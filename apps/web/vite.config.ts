import path from "node:path";
import { fileURLToPath } from "node:url";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import type { Connect, Plugin } from "vite";
import { defineConfig } from "vite";

import { appSchemeForEnv, readAppEnv, readWebPort } from "@dont-forget/shared";
import { loadEnvFile } from "@dont-forget/shared/node";
import { headersForPublicWebRequest } from "./src/public-response-policy";

const REPO_ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../..",
);

loadEnvFile({ cwd: REPO_ROOT });
const APP_SCHEME = appSchemeForEnv("dontforget", readAppEnv());
const WEB_PORT = readWebPort();

export default defineConfig({
	define: {
		__APP_SCHEME__: JSON.stringify(APP_SCHEME),
	},
	server: {
		port: WEB_PORT,
		strictPort: true,
	},
	plugins: [
		publicResponsePolicyPlugin(),
		tanstackStart({
			prerender: {
				enabled: true,
				autoStaticPathsDiscovery: false,
				crawlLinks: false,
				failOnError: true,
			},
			pages: [{ path: "/invitations/accept" }, { path: "/households/join" }],
		}),
		viteReact(),
	],
});

const applyPublicResponsePolicy: Connect.NextHandleFunction = (
	request,
	response,
	next,
) => {
	const headers = headersForPublicWebRequest(request.url ?? "/");
	if (headers) {
		for (const [name, value] of Object.entries(headers)) {
			response.setHeader(name, value);
		}
	}

	next();
};

function publicResponsePolicyPlugin(): Plugin {
	return {
		name: "dont-forget-public-response-policy",
		configureServer(server) {
			server.middlewares.use(applyPublicResponsePolicy);
		},
		configurePreviewServer(server) {
			server.middlewares.use(applyPublicResponsePolicy);
		},
	};
}
