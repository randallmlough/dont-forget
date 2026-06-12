// Mint an RS256 dev token for a given user id (the JWT `sub`, used by
// auth.user_id() in sync streams). Usage: node mint-token.mjs <user-id>
import { readFile } from "node:fs/promises";
import { importPKCS8, SignJWT } from "jose";

const KID = "spike-dev-key-1";
const ALG = "RS256";
// Must be in service.yaml client_auth.audience.
const AUDIENCE = "powersync-dev";
// PowerSync requires `aud` to also identify the endpoint in some setups; the
// service validates against the configured audience list, so this is enough.

const sub = process.argv[2];
if (!sub) {
  console.error("usage: node mint-token.mjs <user-id>");
  process.exit(1);
}

const pem = await readFile(new URL("../keys/dev-private.pem", import.meta.url), "utf8");
const key = await importPKCS8(pem, ALG);

const token = await new SignJWT({})
  .setProtectedHeader({ alg: ALG, kid: KID })
  .setSubject(sub)
  .setAudience(AUDIENCE)
  .setIssuedAt()
  .setExpirationTime("12h")
  .sign(key);

console.log(token);
