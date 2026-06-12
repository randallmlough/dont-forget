// Derive the public JWK (n, e) from keys/dev-public.pem for embedding in
// powersync/service.yaml client_auth.jwks. Prints the JWK as JSON.
import { readFile } from "node:fs/promises";
import { importSPKI, exportJWK } from "jose";

const KID = "spike-dev-key-1";
const ALG = "RS256";

const pem = await readFile(new URL("../keys/dev-public.pem", import.meta.url), "utf8");
const key = await importSPKI(pem, ALG, { extractable: true });
const jwk = await exportJWK(key);
jwk.alg = ALG;
jwk.kid = KID;
jwk.use = "sig";
console.log(JSON.stringify(jwk, null, 2));
