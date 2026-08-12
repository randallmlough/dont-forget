import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	APPLE_APP_SITE_ASSOCIATION_PATH,
	appIdentityForEnv,
	appleAppSiteAssociationForEnv,
	PUBLIC_ENTRY_PATHS,
	readAppEnv,
	readWebPort,
} from "@dont-forget/shared";
import { loadEnvFile } from "@dont-forget/shared/node";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import type { Connect, Plugin } from "vite";
import { defineConfig } from "vite";
import { headersForPublicWebRequest } from "./src/public-response-policy";

const REPO_ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../..",
);

loadEnvFile({ cwd: REPO_ROOT });
const APP_ENV = readAppEnv();
const APP_SCHEME = appIdentityForEnv(APP_ENV).scheme;
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
		appleAppSiteAssociationPlugin(),
		publicResponsePolicyPlugin(),
		tanstackStart({
			prerender: {
				enabled: true,
				autoStaticPathsDiscovery: false,
				crawlLinks: false,
				failOnError: true,
			},
			pages: PUBLIC_ENTRY_PATHS.map((path) => ({ path })),
		}),
		viteReact(),
	],
});

function appleAppSiteAssociationPlugin(): Plugin {
	return {
		name: "dont-forget-apple-app-site-association",
		generateBundle() {
			this.emitFile({
				type: "asset",
				fileName: APPLE_APP_SITE_ASSOCIATION_PATH.slice(1),
				source: JSON.stringify(appleAppSiteAssociationForEnv(APP_ENV)),
			});
		},
	};
}

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
