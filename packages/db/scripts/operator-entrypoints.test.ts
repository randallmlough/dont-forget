import { spawnSync } from "node:child_process";
import path from "node:path";

type OperatorProbe = {
	command: string;
	appEnv: "local" | "production" | "staging";
	expectedRefusal: string;
};

const packageRoot = path.resolve(__dirname, "..");
const syntheticDatabaseUrl =
	"postgresql://synthetic:synthetic@db.invalid:5432/dont_forget_smoke";

const operatorProbes = [
	{
		command: "db:migrate",
		appEnv: "production",
		expectedRefusal:
			"Refusing production operation without CONFIRM_APP_ENV=production.",
	},
	{
		command: "db:reset",
		appEnv: "local",
		expectedRefusal: "Refusing database reset without CONFIRM_DB_RESET=local.",
	},
	{
		command: "db:reseed",
		appEnv: "local",
		expectedRefusal:
			"Refusing to use non-local Postgres directory database db.invalid.",
	},
	{
		command: "worktree:db",
		appEnv: "staging",
		expectedRefusal: "worktree-db only supports APP_ENV=local",
	},
	{
		command: "worktree:db:destroy",
		appEnv: "staging",
		expectedRefusal: "worktree-db-destroy only supports APP_ENV=local",
	},
] satisfies readonly OperatorProbe[];

describe("database operator entrypoints", () => {
	it.each(
		operatorProbes,
	)("runs $command through its ESM subprocess entrypoint", ({
		command,
		appEnv,
		expectedRefusal,
	}) => {
		const result = spawnSync("pnpm", ["run", command], {
			cwd: packageRoot,
			encoding: "utf8",
			env: {
				...process.env,
				APP_ENV: appEnv,
				CONFIRM_APP_ENV: "",
				CONFIRM_DB_RESET: "",
				DATABASE_URL: syntheticDatabaseUrl,
				EMAIL: "",
			},
		});
		const output = `${result.stdout}${result.stderr}`;

		expect(result.error).toBeUndefined();
		expect(result.status).not.toBe(0);
		expect(output).toContain(expectedRefusal);
		expect(output).not.toContain("ReferenceError");
	});
});
