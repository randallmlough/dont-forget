import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";

const composeSchema = z.object({
	services: z.object({
		web: z.object({
			healthcheck: z.object({
				test: z.tuple([z.literal("CMD-SHELL"), z.string()]),
			}),
		}),
	}),
});

const composePaths = [
	"infra/compose.staging.yaml",
	"infra/compose.production.yaml",
];

describe("deployment Compose", () => {
	it("routes web healthchecks to nginx over IPv4 loopback", () => {
		const healthchecks = composePaths.map((composePath) => {
			const compose = composeSchema.parse(
				parse(readFileSync(path.join(process.cwd(), composePath), "utf8")),
			);
			return compose.services.web.healthcheck.test;
		});

		expect(healthchecks).toEqual([
			[
				"CMD-SHELL",
				"wget -q -O /dev/null http://127.0.0.1:8080/.well-known/apple-app-site-association || exit 1",
			],
			[
				"CMD-SHELL",
				"wget -q -O /dev/null http://127.0.0.1:8080/.well-known/apple-app-site-association || exit 1",
			],
		]);
	});
});
