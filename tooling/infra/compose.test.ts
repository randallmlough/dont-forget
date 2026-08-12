import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";

const composeSchema = z.object({
	services: z
		.object({
			api: z.object({
				stop_grace_period: z.string(),
			}),
			migrate: z.object({
				command: z.array(z.string()),
				environment: z
					.object({
						APP_ENV: z.enum(["staging", "production"]),
						CONFIRM_APP_ENV: z.string(),
						DATABASE_URL: z.string(),
					})
					.strict(),
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
const composeMarker = "COMPOSE_WAS_INVOKED";

function runMake(
	target: string,
	variables: readonly string[],
	env: NodeJS.ProcessEnv = process.env,
) {
	return spawnSync(
		"make",
		[target, ...variables, `COMPOSE=echo ${composeMarker}`],
		{ cwd: repositoryRoot, encoding: "utf8", env },
	);
}

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
			["pnpm", "--dir", "packages/db", "db:migrate"],
			["pnpm", "--dir", "packages/db", "db:migrate"],
		]);
		expect(
			composeFiles.map((compose) => compose.services.migrate.environment),
		).toEqual([
			{
				APP_ENV: "staging",
				CONFIRM_APP_ENV: `\${CONFIRM_APP_ENV:-}`,
				DATABASE_URL: `postgresql://\${PG_DATABASE_USER}:\${PG_DATABASE_PASSWORD}@pg-source:5432/\${PG_DATABASE_NAME}`,
			},
			{
				APP_ENV: "production",
				CONFIRM_APP_ENV: `\${CONFIRM_APP_ENV:-}`,
				DATABASE_URL: `postgresql://\${PG_DATABASE_USER}:\${PG_DATABASE_PASSWORD}@pg-source:5432/\${PG_DATABASE_NAME}`,
			},
		]);
	});

	it("gives the API longer than its ten-second internal shutdown deadline", () => {
		expect(
			composeFiles.map((compose) => compose.services.api.stop_grace_period),
		).toEqual(["15s", "15s"]);
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
		const runSeed = (appEnv: string, email: string) =>
			runMake("infra-seed", [`APP_ENV=${appEnv}`, `EMAIL=${email}`]);

		const production = runSeed("production", "qa-owner@example.invalid");
		expect(production.status).not.toBe(0);
		expect(`${production.stdout}${production.stderr}`).not.toContain(
			composeMarker,
		);

		const missingEmail = runSeed("staging", "");
		expect(missingEmail.status).not.toBe(0);
		expect(`${missingEmail.stdout}${missingEmail.stderr}`).not.toContain(
			composeMarker,
		);
		const blankEmail = runSeed("staging", "   ");
		expect(blankEmail.status).not.toBe(0);
		expect(`${blankEmail.stdout}${blankEmail.stderr}`).not.toContain(
			composeMarker,
		);

		const staging = runSeed("staging", "qa-owner@example.invalid");
		expect(staging.status).toBe(0);
		expect(`${staging.stdout}${staging.stderr}`).toContain(
			`${composeMarker} --env-file .env.staging -f infra/compose.staging.yaml --profile tools run --build --rm seed`,
		);
	});

	it.each([
		["local", "infra/docker-compose.yaml"],
		["staging", "infra/compose.staging.yaml"],
		["production", "infra/compose.production.yaml"],
	])("maps APP_ENV=%s to %s and ignores ambient COMPOSE_FILE", (appEnv, composeFile) => {
		const result = runMake("infra-ps", [`APP_ENV=${appEnv}`], {
			...process.env,
			COMPOSE_FILE: "infra/compose.staging.debug.yaml",
		});
		const output = `${result.stdout}${result.stderr}`;

		expect(result.status).toBe(0);
		expect(output).toContain(
			`${composeMarker} --env-file .env.${appEnv} -f ${composeFile} ps`,
		);
		expect(output).not.toContain("-f infra/compose.staging.debug.yaml");
	});

	it("rejects unsupported environments before invoking Compose", () => {
		const result = runMake("infra-ps", ["APP_ENV=test"]);
		const output = `${result.stdout}${result.stderr}`;

		expect(result.status).not.toBe(0);
		expect(output).toContain(
			"infra targets require APP_ENV=local, staging, or production",
		);
		expect(output).not.toContain(composeMarker);
	});

	it("refuses production destruction before invoking Compose", () => {
		const production = runMake("infra-destroy", ["APP_ENV=production"]);
		expect(production.status).not.toBe(0);
		expect(`${production.stdout}${production.stderr}`).not.toContain(
			composeMarker,
		);

		const staging = runMake("infra-destroy", ["APP_ENV=staging"]);
		expect(staging.status).toBe(0);
		expect(`${staging.stdout}${staging.stderr}`).toContain(
			`${composeMarker} --env-file .env.staging -f infra/compose.staging.yaml down --volumes`,
		);
	});

	it("requires production confirmation before invoking migration", () => {
		const unconfirmed = runMake("infra-migrate", ["APP_ENV=production"]);
		expect(unconfirmed.status).not.toBe(0);
		expect(`${unconfirmed.stdout}${unconfirmed.stderr}`).not.toContain(
			composeMarker,
		);

		const confirmed = runMake("infra-migrate", [
			"APP_ENV=production",
			"CONFIRM_APP_ENV=production",
		]);
		expect(confirmed.status).toBe(0);
		expect(`${confirmed.stdout}${confirmed.stderr}`).toContain(
			`${composeMarker} --env-file .env.production -f infra/compose.production.yaml --profile tools run --build --rm migrate`,
		);
	});

	it("deploys build, up, and migration in order under parallel Make", () => {
		const result = runMake("infra-deploy", [
			"-j4",
			"APP_ENV=production",
			"CONFIRM_APP_ENV=production",
		]);
		const markerLines = `${result.stdout}${result.stderr}`
			.split("\n")
			.filter((line) => line.includes(composeMarker));

		expect(result.status).toBe(0);
		expect(markerLines).toEqual([
			`${composeMarker} --env-file .env.production -f infra/compose.production.yaml build`,
			`${composeMarker} --env-file .env.production -f infra/compose.production.yaml up -d`,
			`${composeMarker} --env-file .env.production -f infra/compose.production.yaml --profile tools run --build --rm migrate`,
		]);
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
