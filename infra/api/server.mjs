import { createRequire } from "node:module";
import path from "node:path";
import express from "express";

// createRequire forces the CJS build: expo-server's mjs build ships
// extensionless relative imports that Node's ESM loader rejects.
const require = createRequire(import.meta.url);
const { createRequestHandler } = require("expo-server/adapter/express");

const CLIENT_BUILD_DIR = path.join(process.cwd(), "dist/client");
const SERVER_BUILD_DIR = path.join(process.cwd(), "dist/server");

const app = express();

// The web export renders no UI (root layout is a null stub), so the public
// Invitation/Household Join Code links built from PUBLIC_APP_BASE_URL get a
// minimal fallback page instead of a 404. Universal links land later (ADR-0018
// deploy follow-up); until then recipients open the app manually.
const PUBLIC_ENTRY_FALLBACKS = [
	["/invitations/accept", "This invitation opens in the Don't Forget app."],
	[
		"/households/join",
		"This Household Join Code opens in the Don't Forget app.",
	],
];
for (const [route, message] of PUBLIC_ENTRY_FALLBACKS) {
	app.get(route, (_req, res) => {
		res
			.status(200)
			.type("html")
			.send(
				`<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Don't Forget</title></head><body style="font-family: -apple-system, system-ui, sans-serif; margin: 3rem auto; max-width: 28rem; padding: 0 1rem;"><h1>Don't Forget</h1><p>${message}</p><p>Open the Don't Forget app on your iPhone to continue.</p></body></html>`,
			);
	});
}

app.use(express.static(CLIENT_BUILD_DIR, { maxAge: "1h", immutable: true }));
app.use(createRequestHandler({ build: SERVER_BUILD_DIR }));

const port = Number(process.env.PORT ?? 8080);
app.listen(port, (error) => {
	if (error) {
		throw error;
	}
	console.log(`Expo API server listening on :${port}`);
});
