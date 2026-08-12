import { createHash } from "node:crypto";
import {
	type AppEnv,
	asError,
	readAppEnv,
	redactString,
} from "@dont-forget/shared";
import {
	assertLocalDirectoryDatabaseUrl,
	loadEnvFile,
	readClerkServerConfig,
	readPostgresConfig,
} from "@dont-forget/shared/node";
import { inArray, or } from "drizzle-orm";
import { z } from "zod";
import { directoryDb, postgresPool } from "./client";
import {
	type EmailBackedPrimaryHouseholdScenarioSeed,
	PRIMARY_HOUSEHOLD_SEED,
	seedEmailBackedPrimaryHouseholdScenario,
	seedPrimaryHouseholdScenario,
} from "./fixtures";
import { REPOSITORY_ROOT } from "./repository-root";
import {
	householdJoinCodes,
	households,
	itemChecks,
	items,
	lists,
	memberships,
	users,
} from "./schema/postgres";
import {
	assertStagingSeedClerkUsersDoNotExist,
	cleanupSeedClerkUsers,
	createProductionSeedClerkClient,
	type EnsuredSeedClerkUsers,
	ensureSeedClerkUsers,
	redactSeedClerkError,
	SEED_TEST_PASSWORD,
	type SeedClerkClient,
	type SeedClerkUser,
} from "./seed-clerk";

const EMAIL_SEED_HASH_LENGTH = 16;
const JOIN_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

const seedEmailSchema = z.email();

export type SeedMode =
	| { kind: "deterministic" }
	| { kind: "clerk"; ownerEmail: string; memberEmail: string };

export type SeedRuntime = {
	appEnv: AppEnv;
	seedMode: SeedMode;
};

type EmailSeedRuntime = {
	appEnv: AppEnv;
	seedMode: Extract<SeedMode, { kind: "clerk" }>;
};

export type SeedDatabasePool = {
	end(): Promise<void>;
};

export type SeedEmailBackedDatabasesForRuntimeInput<
	TPool extends SeedDatabasePool,
> = EmailSeedRuntime & {
	env?: SeedEnvSource;
	clerkClient: SeedClerkClient;
	createPool(): TPool;
	createDirectory(pool: TPool): ReturnType<typeof directoryDb>;
};

export type StagingSeedManifest = {
	householdId: string;
	appUserIds: readonly string[];
	membershipIds: readonly string[];
	joinCodeRowIds: readonly string[];
	listIds: readonly string[];
	itemIds: readonly string[];
	itemCheckIds: readonly string[];
	clerkUsers: {
		owner: { id: string; status: "created" | "reused" };
		member: { id: string; status: "created" | "reused" };
	};
};

type SeedEnvSource = Record<string, string | undefined>;

export type EmailBackedSeedTarget = {
	seed: EmailBackedPrimaryHouseholdScenarioSeed;
};

export function parseOptionalSeedEmail(
	source: Record<string, string | undefined> = process.env,
): SeedMode {
	const rawEmail = source.EMAIL;
	if (!rawEmail || rawEmail.trim() === "") {
		return { kind: "deterministic" };
	}

	const ownerEmail = normalizeSeedEmail(rawEmail);
	return {
		kind: "clerk",
		ownerEmail,
		memberEmail: deriveSeedMemberEmail(ownerEmail),
	};
}

export function normalizeSeedEmail(email: string): string {
	const normalized = email.trim().toLowerCase();
	const result = seedEmailSchema.safeParse(normalized);
	if (!result.success) {
		throw new Error("Invalid EMAIL for seed.");
	}
	return result.data;
}

export function deriveSeedMemberEmail(ownerEmail: string): string {
	const atIndex = ownerEmail.lastIndexOf("@");
	if (atIndex === -1) {
		throw new Error("Invalid EMAIL for seed.");
	}

	return `${ownerEmail.slice(0, atIndex)}+member${ownerEmail.slice(atIndex)}`;
}

function deriveSeedCameronEmail(ownerEmail: string): string {
	const atIndex = ownerEmail.lastIndexOf("@");
	if (atIndex === -1) {
		throw new Error("Invalid EMAIL for seed.");
	}

	return `${ownerEmail.slice(0, atIndex)}+cameron${ownerEmail.slice(atIndex)}`;
}

export function emailBackedSeedTargetForMode(
	mode: Extract<SeedMode, { kind: "clerk" }>,
): EmailBackedSeedTarget {
	const slug = seedSlugForEmail(mode.ownerEmail);

	return {
		seed: {
			users: {
				avery: { id: `usr_seed_${slug}_owner` },
				blake: { id: `usr_seed_${slug}_member` },
				cameron: {
					id: `usr_seed_${slug}_cameron`,
					clerkUserId: `user_seed_${slug}_cameron`,
					email: deriveSeedCameronEmail(mode.ownerEmail),
				},
			},
			household: { id: `hh_seed_${slug}` },
			memberships: {
				avery: { id: `mbr_seed_${slug}_owner` },
				blake: { id: `mbr_seed_${slug}_member` },
				cameron: { id: `mbr_seed_${slug}_cameron` },
			},
			joinCode: {
				id: `hjc_seed_${slug}`,
				code: seedJoinCodeForSlug(slug),
			},
			lists: scopedSeedIds(PRIMARY_HOUSEHOLD_SEED.lists, slug),
			items: scopedSeedIds(PRIMARY_HOUSEHOLD_SEED.items, slug),
		},
	};
}

function scopedSeedIds<T extends Record<string, { id: string }>>(
	source: T,
	slug: string,
): { [K in keyof T]: { id: string } } {
	return Object.fromEntries(
		Object.entries(source).map(([key, value]) => [
			key,
			{ id: `${value.id}_${slug}` },
		]),
	) as { [K in keyof T]: { id: string } };
}

function seedSlugForEmail(email: string): string {
	return createHash("sha256")
		.update(normalizeSeedEmail(email))
		.digest("hex")
		.slice(0, EMAIL_SEED_HASH_LENGTH);
}

function seedJoinCodeForSlug(slug: string): string {
	return Array.from({ length: 8 }, (_, index) => {
		const pair = slug.slice(index * 2, index * 2 + 2).padEnd(2, "0");
		return JOIN_CODE_ALPHABET[
			Number.parseInt(pair, 16) % JOIN_CODE_ALPHABET.length
		];
	}).join("");
}

export function readLocalSeedMode(): SeedMode {
	loadLocalSeedEnv();
	return parseOptionalSeedEmail();
}

export function readSeedRuntime(): SeedRuntime {
	process.env.APP_ENV ??= "local";
	const appEnv = loadEnvFile({ cwd: REPOSITORY_ROOT });
	const seedMode = parseOptionalSeedEmail();
	assertSeedPrerequisites({ appEnv, seedMode });
	return { appEnv, seedMode };
}

export async function seedDatabases(): Promise<void> {
	await seedDatabasesForRuntime(readSeedRuntime());
}

export async function seedLocalDatabases(): Promise<void> {
	await seedLocalDatabasesForMode(readLocalSeedMode());
}

export async function seedLocalDatabasesForMode(
	seedMode: SeedMode,
): Promise<void> {
	assertLocalSeedPrerequisites({ seedMode });
	await seedDatabasesForRuntime({ appEnv: "local", seedMode });
}

async function seedDatabasesForRuntime(input: SeedRuntime): Promise<void> {
	if (input.seedMode.kind === "clerk") {
		await seedEmailBackedDatabases({
			appEnv: input.appEnv,
			seedMode: input.seedMode,
		});
		return;
	}

	await seedDeterministicLocalDatabases(input.seedMode);
}

async function seedDeterministicLocalDatabases(
	seedMode: Extract<SeedMode, { kind: "deterministic" }>,
): Promise<void> {
	assertLocalDirectoryDatabaseUrl(readPostgresConfig());
	const pool = postgresPool();

	try {
		const directory = directoryDb(pool);
		await assertSeedDataDoesNotExist({
			directory,
			seedTarget: deterministicSeedTarget(),
		});
		const scenario = await seedPrimaryHouseholdScenario({
			directory,
		});

		logLocalSeedSummary({ scenario, seedMode });
	} finally {
		await pool.end();
	}
}

async function seedEmailBackedDatabases(
	input: EmailSeedRuntime,
): Promise<void> {
	assertLocalDirectoryDatabaseUrl(readPostgresConfig());
	const clerkClient = await createProductionSeedClerkClient();
	await seedEmailBackedDatabasesForRuntime({
		...input,
		clerkClient,
		createPool: postgresPool,
		createDirectory: directoryDb,
	});
}

export async function seedEmailBackedDatabasesForRuntime<
	TPool extends SeedDatabasePool,
>(input: SeedEmailBackedDatabasesForRuntimeInput<TPool>): Promise<void> {
	const { appEnv, seedMode, env, clerkClient, createPool, createDirectory } =
		input;
	assertSeedPrerequisites({ appEnv, seedMode, env });
	const seedTarget = emailBackedSeedTargetForMode(seedMode);
	if (appEnv === "staging") {
		await assertStagingSeedClerkUsersDoNotExist(clerkClient, seedMode);
	}
	const clerkUsers = await ensureSeedClerkUsers(clerkClient, seedMode, {
		allowReuse: appEnv === "local",
	});
	let pool: TPool | undefined;

	try {
		pool = createPool();
		const directory = createDirectory(pool);
		await assertSeedDataDoesNotExist({
			directory,
			seedTarget: emailSeedDataTarget(seedTarget, seedMode, [
				clerkUsers.owner.user.id,
				clerkUsers.member.user.id,
			]),
		});
		const scenario = await seedEmailBackedPrimaryHouseholdScenario({
			directory,
			ownerClerkUserId: clerkUsers.owner.user.id,
			ownerEmail: seedMode.ownerEmail,
			memberClerkUserId: clerkUsers.member.user.id,
			memberEmail: seedMode.memberEmail,
			seed: seedTarget.seed,
		});
		if (appEnv === "staging") {
			console.log(
				formatStagingSeedSuccess(stagingSeedManifest({ scenario, clerkUsers })),
			);
		} else {
			logLocalSeedSummary({ scenario, seedMode });
		}
	} catch (error) {
		await cleanupSeedClerkUsers(
			clerkClient,
			[
				clerkUsers.owner.created ? { user: clerkUsers.owner.user } : null,
				clerkUsers.member.created ? { user: clerkUsers.member.user } : null,
			].filter((user): user is { user: SeedClerkUser } => Boolean(user)),
		);
		throw error;
	} finally {
		await pool?.end();
	}
}

export function assertLocalSeedEnvironment(appEnv: AppEnv): void {
	if (appEnv === "local") return;
	throw new Error(
		`Refusing to seed APP_ENV=${appEnv}. Local seed data is only allowed with APP_ENV=local.`,
	);
}

export function loadLocalSeedEnv(): AppEnv {
	process.env.APP_ENV ??= "local";
	const appEnv = loadEnvFile({ cwd: REPOSITORY_ROOT });
	assertLocalSeedEnvironment(appEnv);
	return appEnv;
}

export function assertLocalSeedPrerequisites(input: {
	seedMode: SeedMode;
	env?: SeedEnvSource;
}): void {
	const env = input.env ?? process.env;
	const appEnv = env.APP_ENV ? readAppEnv(env) : "local";
	assertLocalSeedEnvironment(appEnv);
	assertSeedPrerequisites({ appEnv, seedMode: input.seedMode, env });
}

export function assertSeedPrerequisites(input: {
	appEnv: AppEnv;
	seedMode: SeedMode;
	env?: SeedEnvSource;
}): void {
	const env: SeedEnvSource = {
		...(input.env ?? process.env),
		APP_ENV: input.appEnv,
	};
	if (input.appEnv === "local") {
		if (input.seedMode.kind === "clerk") {
			readClerkServerConfig(env);
		}
		return;
	}
	if (input.appEnv === "staging" && input.seedMode.kind === "deterministic") {
		throw new Error("Staging seed requires EMAIL.");
	}
	if (input.appEnv === "staging" && env.CONFIRM_STAGING_SEED !== "staging") {
		throw new Error("Staging seed requires CONFIRM_STAGING_SEED=staging.");
	}
	if (input.appEnv === "staging") {
		readClerkServerConfig(env);
		return;
	}

	throw new Error(`Seeding is forbidden for APP_ENV=${input.appEnv}.`);
}

export function formatStagingSeedSuccess(
	manifest: StagingSeedManifest,
): string {
	const clerkUsers = Object.values(manifest.clerkUsers);
	const createdCount = clerkUsers.filter(
		(user) => user.status === "created",
	).length;
	const reusedCount = clerkUsers.length - createdCount;

	return redactString(
		[
			"[seed] STAGING SEED PASS",
			`[seed] clerk_user owner id=${manifest.clerkUsers.owner.id} status=${manifest.clerkUsers.owner.status}`,
			`[seed] clerk_user member id=${manifest.clerkUsers.member.id} status=${manifest.clerkUsers.member.status}`,
			`[seed] clerk_user_counts created=${createdCount} reused=${reusedCount}`,
			`[seed] household_id=${manifest.householdId}`,
			`[seed] app_user_ids=${manifest.appUserIds.join(",")}`,
			`[seed] membership_ids=${manifest.membershipIds.join(",")}`,
			`[seed] join_code_row_ids=${manifest.joinCodeRowIds.join(",")}`,
			`[seed] list_ids=${manifest.listIds.join(",")}`,
			`[seed] item_ids=${manifest.itemIds.join(",")}`,
			`[seed] item_check_ids=${manifest.itemCheckIds.join(",")}`,
			`[seed] row_counts households=1 app_users=${manifest.appUserIds.length} memberships=${manifest.membershipIds.length} join_code_rows=${manifest.joinCodeRowIds.length} lists=${manifest.listIds.length} items=${manifest.itemIds.length} item_checks=${manifest.itemCheckIds.length}`,
		].join("\n"),
	);
}

function stagingSeedManifest(input: {
	scenario: Awaited<ReturnType<typeof seedEmailBackedPrimaryHouseholdScenario>>;
	clerkUsers: EnsuredSeedClerkUsers;
}): StagingSeedManifest {
	return {
		householdId: input.scenario.household.id,
		appUserIds: Object.values(input.scenario.users).map((user) => user.id),
		membershipIds: Object.values(input.scenario.memberships).map(
			(membership) => membership.id,
		),
		joinCodeRowIds: Object.values(input.scenario.joinCodes).map(
			(joinCode) => joinCode.id,
		),
		listIds: Object.values(input.scenario.lists).map((list) => list.id),
		itemIds: Object.values(input.scenario.items).map((item) => item.id),
		itemCheckIds: Object.values(input.scenario.itemChecks).map(
			(itemCheck) => itemCheck.id,
		),
		clerkUsers: {
			owner: {
				id: input.clerkUsers.owner.user.id,
				status: input.clerkUsers.owner.created ? "created" : "reused",
			},
			member: {
				id: input.clerkUsers.member.user.id,
				status: input.clerkUsers.member.created ? "created" : "reused",
			},
		},
	};
}

export function formatSeedCliError(error: unknown): string {
	return `[seed] ERROR: ${redactSeedClerkError(asError(error).message)}`;
}

type SeedSummaryScenario =
	| Awaited<ReturnType<typeof seedPrimaryHouseholdScenario>>
	| Awaited<ReturnType<typeof seedEmailBackedPrimaryHouseholdScenario>>;

function logLocalSeedSummary(input: {
	scenario: SeedSummaryScenario;
	seedMode: SeedMode;
}): void {
	const { scenario, seedMode } = input;
	console.log(
		`[seed] Household ${scenario.household.id} (${scenario.household.name}) seeded`,
	);
	if (seedMode.kind === "clerk") {
		console.log(`[seed] Owner email: ${seedMode.ownerEmail}`);
		console.log(`[seed] Member email: ${seedMode.memberEmail}`);
		console.log(`[seed] Password: ${SEED_TEST_PASSWORD}`);
	} else {
		console.log(
			`[seed] Users: ${scenario.users.avery.email}, ${scenario.users.blake.email}`,
		);
	}
	for (const list of Object.values(scenario.lists)) {
		const status = list.deletedAt
			? "deleted"
			: list.archivedAt
				? "archived"
				: "active";
		console.log(`[seed] List: ${list.name} (${list.id}, ${status})`);
	}
}

type SeedConflictDbs = {
	directory: ReturnType<typeof directoryDb>;
	seedTarget: SeedDataTarget;
};

async function assertSeedDataDoesNotExist({
	directory,
	seedTarget,
}: SeedConflictDbs): Promise<void> {
	const {
		clerkUserIds,
		householdIds,
		itemIds,
		joinCodeCodes,
		joinCodeIds,
		listIds,
		membershipIds,
		seedMode,
		userIds,
	} = seedTarget;

	const [
		existingUsers,
		existingHouseholds,
		existingMemberships,
		existingJoinCodes,
	] = await Promise.all([
		directory
			.select({ id: users.id })
			.from(users)
			.where(userConflictCondition(userIds, clerkUserIds)),
		directory
			.select({ id: households.id })
			.from(households)
			.where(inArray(households.id, householdIds)),
		directory
			.select({ id: memberships.id })
			.from(memberships)
			.where(inArray(memberships.id, membershipIds)),
		directory
			.select({ id: householdJoinCodes.id })
			.from(householdJoinCodes)
			.where(
				or(
					inArray(householdJoinCodes.id, joinCodeIds),
					inArray(householdJoinCodes.code, joinCodeCodes),
				),
			),
	]);
	const [existingLists, existingItems, existingItemChecks] = await Promise.all([
		directory
			.select({ id: lists.id })
			.from(lists)
			.where(inArray(lists.id, listIds)),
		directory
			.select({ id: items.id })
			.from(items)
			.where(inArray(items.id, itemIds)),
		directory
			.select({ itemId: itemChecks.itemId })
			.from(itemChecks)
			.where(inArray(itemChecks.itemId, itemIds)),
	]);

	const conflicts = [
		existingUsers.length ? `${existingUsers.length} User row(s)` : null,
		existingHouseholds.length
			? `${existingHouseholds.length} Household row(s)`
			: null,
		existingMemberships.length
			? `${existingMemberships.length} Member row(s)`
			: null,
		existingJoinCodes.length
			? `${existingJoinCodes.length} Household Join Code row(s)`
			: null,
		existingLists.length ? `${existingLists.length} List row(s)` : null,
		existingItems.length ? `${existingItems.length} Item row(s)` : null,
		existingItemChecks.length
			? `${existingItemChecks.length} item_checks row(s)`
			: null,
	].filter((conflict): conflict is string => Boolean(conflict));

	if (conflicts.length > 0) {
		throw new Error(formatSeedConflictMessage(conflicts, seedMode));
	}
}

type SeedDataTarget = {
	seedMode: SeedMode;
	userIds: string[];
	clerkUserIds: string[];
	householdIds: string[];
	membershipIds: string[];
	joinCodeIds: string[];
	joinCodeCodes: string[];
	listIds: string[];
	itemIds: string[];
};

function deterministicSeedTarget(): SeedDataTarget {
	return {
		seedMode: { kind: "deterministic" },
		userIds: [
			PRIMARY_HOUSEHOLD_SEED.users.avery.id,
			PRIMARY_HOUSEHOLD_SEED.users.blake.id,
		],
		clerkUserIds: [
			PRIMARY_HOUSEHOLD_SEED.users.avery.clerkUserId,
			PRIMARY_HOUSEHOLD_SEED.users.blake.clerkUserId,
		],
		householdIds: [PRIMARY_HOUSEHOLD_SEED.household.id],
		membershipIds: [
			PRIMARY_HOUSEHOLD_SEED.memberships.avery.id,
			PRIMARY_HOUSEHOLD_SEED.memberships.blake.id,
		],
		joinCodeIds: [PRIMARY_HOUSEHOLD_SEED.joinCodes.active.id],
		joinCodeCodes: [PRIMARY_HOUSEHOLD_SEED.joinCodes.active.code],
		listIds: Object.values(PRIMARY_HOUSEHOLD_SEED.lists).map((list) => list.id),
		itemIds: Object.values(PRIMARY_HOUSEHOLD_SEED.items).map((item) => item.id),
	};
}

export function emailSeedDataTarget(
	target: EmailBackedSeedTarget,
	seedMode: Extract<SeedMode, { kind: "clerk" }>,
	clerkUserIds: string[],
): SeedDataTarget {
	const cameronClerkUserId = target.seed.users.cameron.clerkUserId;
	if (!cameronClerkUserId) {
		throw new Error("EMAIL seed target is missing Cameron Clerk User ID.");
	}

	return {
		seedMode,
		userIds: [
			target.seed.users.avery.id,
			target.seed.users.blake.id,
			target.seed.users.cameron.id,
		],
		clerkUserIds: [...clerkUserIds, cameronClerkUserId],
		householdIds: [target.seed.household.id],
		membershipIds: [
			target.seed.memberships.avery.id,
			target.seed.memberships.blake.id,
			target.seed.memberships.cameron.id,
		],
		joinCodeIds: [target.seed.joinCode.id],
		joinCodeCodes: [target.seed.joinCode.code],
		listIds: Object.values(
			target.seed.lists ?? PRIMARY_HOUSEHOLD_SEED.lists,
		).map((list) => list.id),
		itemIds: Object.values(
			target.seed.items ?? PRIMARY_HOUSEHOLD_SEED.items,
		).map((item) => item.id),
	};
}

function userConflictCondition(userIds: string[], clerkUserIds: string[]) {
	if (clerkUserIds.length === 0) {
		return inArray(users.id, userIds);
	}

	return or(
		inArray(users.id, userIds),
		inArray(users.clerkUserId, clerkUserIds),
	);
}

export function formatSeedConflictMessage(
	conflicts: readonly string[],
	seedMode: SeedMode,
): string {
	if (seedMode.kind === "clerk") {
		return (
			`Refusing to seed because seed data already exists for this EMAIL: ${conflicts.join(", ")}. ` +
			"Matching Clerk development Users were repaired before this check. " +
			"Use a different EMAIL or remove that specific seed data before retrying. Do not run make db-reseed unless you intend to reset all local app data."
		);
	}

	return (
		`Refusing to seed because deterministic seed data already exists: ${conflicts.join(", ")}. ` +
		"Run make db-reseed only if you intend to reset all local app data."
	);
}
