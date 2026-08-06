import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";

const composeSchema = z.object({
	services: z.object({
		migrate: z.object({
			command: z.array(z.string()),
		}),
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
const repositoryRoot = path.resolve(__dirname, "../..");

describe("deployment Compose", () => {
	const composeFiles = composePaths.map((composePath) =>
		composeSchema.parse(
			parse(readFileSync(path.join(repositoryRoot, composePath), "utf8")),
		),
	);

	it("keeps deployment healthchecks and migrations package-owned", () => {
		const healthchecks = composeFiles.map(
			(compose) => compose.services.web.healthcheck.test,
		);

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

		const commands = composeFiles.map(
			(compose) => compose.services.migrate.command,
		);

		expect(commands).toEqual([
			[
				"pnpm",
				"--dir",
				"packages/db",
				"exec",
				"drizzle-kit",
				"migrate",
				"--config=src/drizzle/postgres.migrate.ts",
			],
			[
				"pnpm",
				"--dir",
				"packages/db",
				"exec",
				"drizzle-kit",
				"migrate",
				"--config=src/drizzle/postgres.migrate.ts",
			],
		]);
	});
});
