// Step 1 diagnostics: show exactly which rows a given user receives from the
// PowerSync service, by calling POST /sync/stream with that user's dev token
// and summarizing the streamed checkpoint + data messages.
//
// Usage: node synced-rows.mjs <user-id> [endpoint]
//   e.g. node synced-rows.mjs user-a http://localhost:8089
//
// This is the spike's substitute for the powersync-service test-client's
// `fetch-operations` command: same idea (inspect a token's synced operations),
// implemented directly against the documented /sync/stream endpoint so it needs
// no extra repo checkout.

import { readFile } from "node:fs/promises";
import { importPKCS8, SignJWT } from "jose";

const userId = process.argv[2];
const endpoint = process.argv[3] || "http://localhost:8089";
if (!userId) {
  console.error("usage: node synced-rows.mjs <user-id> [endpoint]");
  process.exit(1);
}

const ALG = "RS256";
const KID = "spike-dev-key-1";
const AUDIENCE = "powersync-dev";

const pem = await readFile(new URL("../keys/dev-private.pem", import.meta.url), "utf8");
const key = await importPKCS8(pem, ALG);
const token = await new SignJWT({})
  .setProtectedHeader({ alg: ALG, kid: KID })
  .setSubject(userId)
  .setAudience(AUDIENCE)
  .setIssuedAt()
  .setExpirationTime("12h")
  .sign(key);

const res = await fetch(`${endpoint}/sync/stream`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    streams: { subscriptions: [], include_defaults: true },
    include_checksum: true,
    raw_data: true,
  }),
});

if (!res.ok) {
  console.error(`HTTP ${res.status}: ${await res.text()}`);
  process.exit(1);
}

// The stream is newline-delimited JSON; the first checkpoint lists buckets, and
// subsequent {data:...} messages carry the actual rows. We read until the
// checkpoint_complete marker (or the stream's first idle), collecting rows.
const rows = []; // { type, id }
const households = new Set();
const reader = res.body.getReader();
const decoder = new TextDecoder();
let buf = "";
const deadline = Date.now() + 6000;

outer: while (Date.now() < deadline) {
  const { value, done } = await reader.read();
  if (done) break;
  buf += decoder.decode(value, { stream: true });
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (msg.data?.data) {
      for (const op of msg.data.data) {
        if (op.op === "PUT") {
          rows.push({ type: op.object_type, id: op.object_id });
          if (op.object_type === "households") households.add(op.object_id);
        }
      }
    }
    if (msg.checkpoint_complete) {
      // After the first full checkpoint, we have everything for the initial sync.
      await reader.cancel().catch(() => {});
      break outer;
    }
  }
}
await reader.cancel().catch(() => {});

const byType = {};
for (const r of rows) (byType[r.type] ||= []).push(r.id);
for (const t of Object.keys(byType)) byType[t].sort();

console.log(`\n=== Synced rows for user "${userId}" ===`);
console.log(`households received: [${[...households].sort().join(", ")}]`);
for (const t of ["users", "households", "memberships", "lists", "items", "item_checks"]) {
  console.log(`  ${t.padEnd(12)} (${(byType[t] || []).length}): ${(byType[t] || []).join(", ")}`);
}
