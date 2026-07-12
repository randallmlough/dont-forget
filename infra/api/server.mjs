import { createRequire } from "node:module";
import path from "node:path";
import express from "express";

const require = createRequire(import.meta.url);
const { createRequestHandler } = require("@expo/server/adapter/express");

const CLIENT_BUILD_DIR = path.join(process.cwd(), "dist/client");
const SERVER_BUILD_DIR = path.join(process.cwd(), "dist/server");

const app = express();

app.use(express.static(CLIENT_BUILD_DIR, { maxAge: "1h", immutable: true }));
app.use(createRequestHandler({ build: SERVER_BUILD_DIR }));

const port = Number(process.env.PORT ?? 8080);
app.listen(port, (error) => {
	if (error) {
		throw error;
	}
	console.log(`Expo API server listening on :${port}`);
});
