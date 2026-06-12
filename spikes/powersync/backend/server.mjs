// Minimal PowerSync upload endpoint for the spike.
//
// Responsibilities (Step 2 of plan 015):
//   1. Verify the caller's dev JWT (RS256, same key pair as the sync service)
//      and extract the user id from `sub`.
//   2. Apply each client CRUD op (PUT / PATCH / DELETE) to the source Postgres.
//   3. LWW: ignore an update whose app-owned `updated_at` is older than the
//      stored row's `updated_at`.
//   4. Authorization: reject writes touching a Household the JWT's user is not
//      an ACTIVE member of. Authorization is resolved per row by walking
//      table -> household_id (lists.household_id; items via list_id;
//      item_checks via item_id -> items.list_id).
//
// This is throwaway: single-file http server, no framework.

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import pg from "pg";
import { importSPKI, importPKCS8, jwtVerify, SignJWT } from "jose";

const PORT = Number(process.env.PORT || 6068);
const ALG = "RS256";
const KID = "spike-dev-key-1";
const AUDIENCE = ["powersync-dev", "powersync"];
const TOKEN_AUDIENCE = "powersync-dev";

const publicPem = readFileSync(new URL("../keys/dev-public.pem", import.meta.url), "utf8");
const verifyKey = await importSPKI(publicPem, ALG);
const privatePem = readFileSync(new URL("../keys/dev-private.pem", import.meta.url), "utf8");
const signKey = await importPKCS8(privatePem, ALG);

// Mint a dev token for a user id (the JWT `sub`). Server-side signing so the
// RN client needs no crypto polyfill. Spike only — Phase 2 swaps in Clerk.
async function mintToken(sub) {
  return new SignJWT({})
    .setProtectedHeader({ alg: ALG, kid: KID })
    .setSubject(sub)
    .setAudience(TOKEN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(signKey);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URI });

// Tables we accept writes for, and how each row maps to a household for authz.
const TABLES = new Set(["users", "households", "memberships", "lists", "items", "item_checks"]);

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

// Resolve the household id(s) a write touches, so we can authorize it.
// Returns an array of household ids (usually one) or null if not household-scoped.
async function householdsForOp(client, op) {
  const { table, id, data } = op;
  switch (table) {
    case "lists":
      // household_id is on the row itself (incoming data, or stored).
      if (data?.household_id) return [data.household_id];
      {
        const r = await client.query("SELECT household_id FROM lists WHERE id = $1", [id]);
        return r.rows.map((x) => x.household_id);
      }
    case "items": {
      const listId = data?.list_id;
      if (listId) {
        const r = await client.query("SELECT household_id FROM lists WHERE id = $1", [listId]);
        return r.rows.map((x) => x.household_id);
      }
      const r = await client.query(
        "SELECT l.household_id FROM items i JOIN lists l ON l.id = i.list_id WHERE i.id = $1",
        [id]
      );
      return r.rows.map((x) => x.household_id);
    }
    case "item_checks": {
      // item_id is on the incoming PUT data; for PATCH/DELETE (only changed cols)
      // resolve via the stored row by its synthetic id.
      let itemId = data?.item_id;
      if (!itemId) {
        const r0 = await client.query("SELECT item_id FROM item_checks WHERE id = $1", [id]);
        itemId = r0.rows[0]?.item_id;
      }
      if (!itemId) return [];
      const r = await client.query(
        "SELECT l.household_id FROM items i JOIN lists l ON l.id = i.list_id WHERE i.id = $1",
        [itemId]
      );
      return r.rows.map((x) => x.household_id);
    }
    case "memberships":
      return data?.household_id ? [data.household_id] : null;
    default:
      // users, households: not household-membership scoped in this spike.
      return null;
  }
}

async function isActiveMember(client, userId, householdId) {
  const r = await client.query(
    "SELECT 1 FROM memberships WHERE user_id = $1 AND household_id = $2 AND status = 'active'",
    [userId, householdId]
  );
  return r.rowCount > 0;
}

// LWW guard: returns true if the incoming updated_at is >= stored updated_at
// (or the row does not yet exist). Older writes are ignored.
async function lwwAllows(client, table, id, incomingUpdatedAt) {
  if (!incomingUpdatedAt) return true; // no clock on the op -> let it through
  // All synced tables (incl. item_checks) key on the synthetic `id`.
  const row = await client.query(`SELECT updated_at FROM ${table} WHERE id = $1`, [id]);
  if (row.rowCount === 0) return true;
  const stored = row.rows[0].updated_at;
  return new Date(incomingUpdatedAt).getTime() >= new Date(stored).getTime();
}

function columnsFor(table, data) {
  return Object.keys(data).filter((k) => k !== undefined);
}

async function applyOp(client, op) {
  const { op: kind, table, id, data } = op;

  if (kind === "PUT") {
    // Upsert on the synthetic id (all tables, incl. item_checks).
    const cols = ["id", ...columnsFor(table, data).filter((c) => c !== "id")];
    const vals = cols.map((c) => (c === "id" ? id : data[c]));
    const placeholders = cols.map((_, i) => `$${i + 1}`);
    const updates = cols.filter((c) => c !== "id").map((c) => `${c} = EXCLUDED.${c}`);
    await client.query(
      `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders.join(", ")})
       ON CONFLICT (id) DO UPDATE SET ${updates.join(", ")}`,
      vals
    );
    return;
  }

  if (kind === "PATCH") {
    // Update changed columns, keyed on the synthetic id (all tables).
    const cols = Object.keys(data).filter((c) => c !== "id");
    const set = cols.map((c, i) => `${c} = $${i + 1}`);
    await client.query(`UPDATE ${table} SET ${set.join(", ")} WHERE id = $${cols.length + 1}`, [
      ...cols.map((c) => data[c]),
      id,
    ]);
    return;
  }

  if (kind === "DELETE") {
    // item_checks has no deleted_at column (a missing row == unchecked); hard delete by id.
    if (table === "item_checks") {
      await client.query("DELETE FROM item_checks WHERE id = $1", [id]);
      return;
    }
    // Other tables: tombstone, not hard delete (ADR-0002). Set deleted_at.
    await client.query(`UPDATE ${table} SET deleted_at = now(), updated_at = now() WHERE id = $1`, [id]);
    return;
  }

  throw new Error(`unknown op kind: ${kind}`);
}

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    return send(res, 200, { ok: true });
  }
  // Dev-token endpoint: GET /api/auth/token?user_id=user-a
  if (req.method === "GET" && req.url.startsWith("/api/auth/token")) {
    const u = new URL(req.url, "http://localhost");
    const sub = u.searchParams.get("user_id");
    if (!sub) return send(res, 400, { error: "missing user_id" });
    return send(res, 200, { token: await mintToken(sub) });
  }
  if (req.method !== "POST" || req.url !== "/api/data") {
    return send(res, 404, { error: "not found" });
  }

  // ---- Authn: verify the dev JWT, extract user id from sub.
  const authz = req.headers["authorization"] || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (!token) return send(res, 401, { error: "missing bearer token" });

  let userId;
  try {
    const { payload } = await jwtVerify(token, verifyKey, { audience: AUDIENCE });
    userId = payload.sub;
  } catch (e) {
    return send(res, 401, { error: "invalid token", detail: String(e.message || e) });
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    return send(res, 400, { error: "bad json" });
  }
  const batch = Array.isArray(body.batch) ? body.batch : [];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const results = [];
    for (const op of batch) {
      if (!TABLES.has(op.table)) {
        await client.query("ROLLBACK");
        return send(res, 400, { error: `unknown table ${op.table}` });
      }

      // ---- Authz: every household-scoped write must target an active membership.
      const households = await householdsForOp(client, op);
      if (households && households.length > 0) {
        for (const hid of households) {
          if (!(await isActiveMember(client, userId, hid))) {
            await client.query("ROLLBACK");
            return send(res, 403, {
              error: "not an active member of household",
              household_id: hid,
              user_id: userId,
              table: op.table,
            });
          }
        }
      }

      // ---- LWW: ignore stale updates (keyed on the synthetic id for all tables).
      const incomingUpdatedAt = op.data?.updated_at;
      if (!(await lwwAllows(client, op.table, op.id, incomingUpdatedAt))) {
        console.log(`[lww] SKIP user=${userId} ${op.op} ${op.table} ${op.id} name=${op.data?.name ?? ""} incoming=${incomingUpdatedAt}`);
        results.push({ id: op.id, table: op.table, skipped: "stale-lww" });
        continue;
      }

      await applyOp(client, op);
      console.log(`[lww] APPLY user=${userId} ${op.op} ${op.table} ${op.id} name=${op.data?.name ?? ""} incoming=${incomingUpdatedAt}`);
      results.push({ id: op.id, table: op.table, applied: op.op });
    }
    await client.query("COMMIT");
    return send(res, 200, { ok: true, results });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    return send(res, 500, { error: "apply failed", detail: String(e.message || e) });
  } finally {
    client.release();
  }
});

server.listen(PORT, () => {
  console.log(`[spike-backend] listening on :${PORT}`);
});
