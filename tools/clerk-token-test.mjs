// PowerSync auth acceptance test. Mints a REAL Clerk session token via the
// Clerk Backend API (secret key) and POSTs it to the running PowerSync service,
// to observe how far the Clerk -> PowerSync auth path gets.
//
// SECRETS POLICY: reads CLERK_SECRET_KEY / EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY from
// the environment at RUNTIME ONLY. Never hardcode key values here. Run with:
//   set -a; source <(grep -E '^(CLERK_SECRET_KEY|EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY)=' \
//     /path/to/.env.local); set +a
//   node tools/clerk-token-test.mjs [powersync_url] [template_name]
//
// With no template arg it mints the DEFAULT Clerk session token (no `aud`) and
// PowerSync returns PSYNC_S2105 (missing aud). Pass the JWT template name
// (e.g. `powersync`, body {"aud":"powersync"}) to get a token PowerSync ACCEPTS.

const SK = process.env.CLERK_SECRET_KEY;
const PK = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
const POWERSYNC_URL = process.argv[2] || "http://localhost:8089";
const TEMPLATE = process.argv[3] || null;

if (!SK) {
	console.error(
		"CLERK_SECRET_KEY not in env. Source it from .env.local first (see header).",
	);
	process.exit(1);
}

const CLERK_API = "https://api.clerk.com/v1";
const h = { Authorization: `Bearer ${SK}`, "Content-Type": "application/json" };

// Public: derive the Clerk frontend-API domain + JWKS URL from the publishable key.
if (PK) {
	const domain = Buffer.from(PK.replace(/^pk_(test|live)_/, ""), "base64")
		.toString("utf8")
		.replace(/\$$/, "");
	console.log(`Clerk frontend-API domain (public): ${domain}`);
	console.log(
		`Clerk JWKS URL (-> service.yaml client_auth.jwks_uri): https://${domain}/.well-known/jwks.json`,
	);
}

// 1. List users -> a real dev user_id.
const users = await (
	await fetch(`${CLERK_API}/users?limit=1`, { headers: h })
).json();
const userId = users[0]?.id;
if (!userId) {
	console.error("No Clerk dev users found.");
	process.exit(1);
}
console.log(`\nuser_id: ${userId}`);

// 2. Create a session (no browser sign-in).
const session = await (
	await fetch(`${CLERK_API}/sessions`, {
		method: "POST",
		headers: h,
		body: JSON.stringify({ user_id: userId }),
	})
).json();
const sessionId = session.id;
console.log(`session_id: ${sessionId}`);

// 3. Mint a session token (default, or via a JWT template if given).
const tokenUrl = TEMPLATE
	? `${CLERK_API}/sessions/${sessionId}/tokens/${TEMPLATE}`
	: `${CLERK_API}/sessions/${sessionId}/tokens`;
const tokenResp = await (
	await fetch(tokenUrl, {
		method: "POST",
		headers: h,
		body: JSON.stringify({ expires_in_seconds: 3600 }),
	})
).json();
if (!tokenResp.jwt) {
	console.error(
		`Token mint failed (${TEMPLATE ? `template '${TEMPLATE}'` : "default"}):`,
		JSON.stringify(tokenResp),
	);
	process.exit(1);
}
const jwt = tokenResp.jwt;

// Decode + print claims (no signature check; just inspecting).
const [, payloadB64] = jwt.split(".");
const claims = JSON.parse(Buffer.from(payloadB64, "base64").toString("utf8"));
console.log(
	`\nClerk token (${TEMPLATE ? `template '${TEMPLATE}'` : "default"}) claims:`,
);
console.log(`  iss: ${claims.iss}`);
console.log(`  sub: ${claims.sub}`);
console.log(
	`  aud: ${claims.aud === undefined ? "(ABSENT)" : JSON.stringify(claims.aud)}`,
);
console.log(`  exp-iat: ${claims.exp - claims.iat}s`);

// 4. POST to PowerSync /sync/stream and report the outcome.
const res = await fetch(`${POWERSYNC_URL}/sync/stream`, {
	method: "POST",
	headers: {
		Authorization: `Bearer ${jwt}`,
		"Content-Type": "application/json",
	},
	body: JSON.stringify({
		streams: { subscriptions: [], include_defaults: true },
		include_checksum: true,
		raw_data: true,
	}),
});
console.log(`\nPowerSync /sync/stream -> HTTP ${res.status}`);
const body = await res.text();
console.log(body.slice(0, 400));
