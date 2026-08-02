import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import type { Connect, Plugin } from "vite";
import { defineConfig } from "vite";

import {
	appSchemeForEnv,
	DEFAULT_WEB_PORT,
	readAppEnv,
} from "../../src/shared/env";
import { headersForPublicWebRequest } from "./src/public-response-policy";

const APP_SCHEME = appSchemeForEnv("dontforget", readAppEnv());
const WEB_PORT = readWebPort(process.env.WEB_PORT);

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

function readWebPort(value: string | undefined): number {
	if (value === undefined) {
		return DEFAULT_WEB_PORT;
	}

	const port = Number(value);
	if (!Number.isInteger(port) || port < 1 || port > 65_535) {
		throw new Error("WEB_PORT must be an integer from 1 through 65535");
	}

	return port;
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
