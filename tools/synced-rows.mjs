// Show exactly which rows a given user receives from the PowerSync service, by
// calling POST /sync/stream with that user's REAL Clerk token and summarizing
// the streamed checkpoint + data messages. This proves the 3-level item_checks
// scoping reaches a connected Member and a non-Member receives nothing.
//
// SECRETS POLICY: mints a real Clerk session token via the Clerk Backend API at
// RUNTIME ONLY: no static signing key, no extra crypto dependency. Reads
// CLERK_SECRET_KEY from env.
//
// Usage:
//   set -a; source <(grep -E '^CLERK_SECRET_KEY=' /path/to/.env.local); set +a
//   node tools/synced-rows.mjs <clerk-user-id> [powersync_url] [template_name]
//     e.g. node tools/synced-rows.mjs user_2abc... http://localhost:8089 powersync

const SK = process.env.CLERK_SECRET_KEY;
const clerkUserId = process.argv[2];
const endpoint = process.argv[3] || "http://localhost:8089";
const TEMPLATE = process.argv[4] || "powersync";

if (!clerkUserId) {
	console.error(
		"usage: node synced-rows.mjs <clerk-user-id> [powersync_url] [template_name]",
	);
	process.exit(1);
}
if (!SK) {
	console.error(
		"CLERK_SECRET_KEY not in env. Source it from .env.local first (see header).",
	);
	process.exit(1);
}

const CLERK_API = "https://api.clerk.com/v1";
const h = { Authorization: `Bearer ${SK}`, "Content-Type": "application/json" };

// 1. Create a session for the given Clerk user (no browser sign-in).
const session = await (
	await fetch(`${CLERK_API}/sessions`, {
		method: "POST",
		headers: h,
		body: JSON.stringify({ user_id: clerkUserId }),
	})
).json();
if (!session.id) {
	console.error("Failed to create Clerk session:", JSON.stringify(session));
	process.exit(1);
}

// 2. Mint a session token via the JWT template that carries `aud: powersync`.
const tokenResp = await (
	await fetch(`${CLERK_API}/sessions/${session.id}/tokens/${TEMPLATE}`, {
		method: "POST",
		headers: h,
		body: JSON.stringify({ expires_in_seconds: 3600 }),
	})
).json();
if (!tokenResp.jwt) {
	console.error(
		`Token mint failed (template '${TEMPLATE}'):`,
		JSON.stringify(tokenResp),
	);
	process.exit(1);
}
const token = tokenResp.jwt;

const res = await fetch(`${endpoint}/sync/stream`, {
	method: "POST",
	headers: {
		Authorization: `Bearer ${token}`,
		"Content-Type": "application/json",
	},
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
	let nl = buf.indexOf("\n");
	while (nl >= 0) {
		const line = buf.slice(0, nl).trim();
		buf = buf.slice(nl + 1);
		nl = buf.indexOf("\n");
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
for (const r of rows) {
	byType[r.type] ||= [];
	byType[r.type].push(r.id);
}
for (const t of Object.keys(byType)) byType[t].sort();

console.log(`\n=== Synced rows for Clerk user "${clerkUserId}" ===`);
console.log(`households received: [${[...households].sort().join(", ")}]`);
for (const t of [
	"users",
	"households",
	"memberships",
	"lists",
	"items",
	"item_checks",
]) {
	console.log(
		`  ${t.padEnd(12)} (${(byType[t] || []).length}): ${(byType[t] || []).join(", ")}`,
	);
}
