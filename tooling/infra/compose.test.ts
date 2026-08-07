import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";

const composeSchema = z.object({
	services: z
		.object({
			migrate: z.object({
				command: z.array(z.string()),
			}),
			seed: z.unknown().optional(),
			web: z.object({
				healthcheck: z.object({
					test: z.tuple([z.literal("CMD-SHELL"), z.string()]),
				}),
			}),
		})
		.passthrough(),
});

const seedServiceSchema = z
	.object({
		profiles: z.array(z.string()),
		build: z
			.object({
				context: z.string(),
				dockerfile: z.string(),
				target: z.string(),
			})
			.strict(),
		environment: z.record(z.string(), z.string()),
		command: z.array(z.string()),
		depends_on: z.record(
			z.string(),
			z.object({ condition: z.string() }).strict(),
		),
		networks: z.array(z.string()),
	})
	.strict();

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

	it("keeps the seed runner isolated to the staging tools profile", () => {
		const [staging, production] = composeFiles;
		const seed = seedServiceSchema.parse(staging?.services.seed);

		expect(seed).toEqual({
			profiles: ["tools"],
			build: {
				context: "..",
				dockerfile: "infra/api/Dockerfile",
				target: "builder",
			},
			environment: {
				APP_ENV: "staging",
				CONFIRM_STAGING_SEED: "staging",
				DATABASE_URL: `postgresql://\${PG_DATABASE_USER}:\${PG_DATABASE_PASSWORD}@pg-source:5432/\${PG_DATABASE_NAME}`,
				CLERK_SECRET_KEY: `\${CLERK_SECRET_KEY}`,
				EMAIL: `\${EMAIL:-}`,
			},
			command: ["pnpm", "--dir", "packages/db", "db:seed"],
			depends_on: {
				"pg-source": { condition: "service_healthy" },
			},
			networks: ["internal"],
		});
		expect(production?.services).not.toHaveProperty("seed");
	});

	it("runs the seed tool only for staging with a nonblank EMAIL", () => {
		const composeMarker = "COMPOSE_WAS_INVOKED";
		const runMake = (appEnv: string, email: string) =>
			spawnSync(
				"make",
				[
					"infra-seed",
					`APP_ENV=${appEnv}`,
					`EMAIL=${email}`,
					`COMPOSE=echo ${composeMarker}`,
				],
				{ cwd: repositoryRoot, encoding: "utf8" },
			);

		const production = runMake("production", "qa-owner@example.invalid");
		expect(production.status).not.toBe(0);
		expect(`${production.stdout}${production.stderr}`).not.toContain(
			composeMarker,
		);

		const missingEmail = runMake("staging", "");
		expect(missingEmail.status).not.toBe(0);
		expect(`${missingEmail.stdout}${missingEmail.stderr}`).not.toContain(
			composeMarker,
		);
		const blankEmail = runMake("staging", "   ");
		expect(blankEmail.status).not.toBe(0);
		expect(`${blankEmail.stdout}${blankEmail.stderr}`).not.toContain(
			composeMarker,
		);

		const staging = runMake("staging", "qa-owner@example.invalid");
		expect(staging.status).toBe(0);
		expect(`${staging.stdout}${staging.stderr}`).toContain(
			`${composeMarker} --profile tools run --build --rm seed`,
		);
	});

	it.each([
		"db-seed",
		"db-reseed",
	])("keeps %s local-only before invoking pnpm", (target) => {
		const pnpmMarker = "PNPM_WAS_INVOKED";
		const runMake = (appEnv: string) =>
			spawnSync(
				"make",
				[
					target,
					`APP_ENV=${appEnv}`,
					"EMAIL=qa-owner@example.invalid",
					"CONFIRM_STAGING_SEED=staging",
					`PNPM=echo ${pnpmMarker}`,
				],
				{ cwd: repositoryRoot, encoding: "utf8" },
			);

		for (const appEnv of ["staging", "test", "production"]) {
			const result = runMake(appEnv);
			expect(result.status).not.toBe(0);
			expect(`${result.stdout}${result.stderr}`).not.toContain(pnpmMarker);
		}

		const local = runMake("local");
		expect(local.status).toBe(0);
		expect(`${local.stdout}${local.stderr}`).toContain(pnpmMarker);
	});
});
