import { createHash } from "node:crypto";
import {
	type AppEnv,
	assertLocalDirectoryDatabaseUrl,
	readClerkServerConfig,
	readPostgresConfig,
} from "@dont-forget/shared";
import { loadEnvFile } from "@dont-forget/shared/node";
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

export const SEED_TEST_PASSWORD = "testing1234";

const EMAIL_SEED_HASH_LENGTH = 16;
const JOIN_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

const seedEmailSchema = z.email();

export type SeedMode =
	| { kind: "deterministic" }
	| { kind: "clerk"; ownerEmail: string; memberEmail: string };

type SeedEnvSource = Record<string, string | undefined>;

export type SeedClerkUser = {
	id: string;
	primaryEmailAddressId?: string | null;
	emailAddresses: { id?: string; emailAddress: string }[];
};

export type SeedClerkUsers = {
	owner: SeedClerkUser;
	member: SeedClerkUser;
};

export type SeedClerkClient = {
	getUserList(input: { query: string }): Promise<{ data: SeedClerkUser[] }>;
	createUser(input: {
		emailAddress: string[];
		password: string;
		firstName?: string;
		lastName?: string;
		skipPasswordChecks?: boolean;
	}): Promise<SeedClerkUser>;
	updateUser(
		userId: string,
		input: {
			password: string;
			firstName?: string;
			lastName?: string;
			skipPasswordChecks?: boolean;
		},
	): Promise<SeedClerkUser>;
	disableUserMFA(userId: string): Promise<unknown>;
	updateEmailAddress(
		emailAddressId: string,
		input: { verified: boolean; primary: boolean },
	): Promise<unknown>;
	deleteUser(userId: string): Promise<unknown>;
};

type EnsuredSeedClerkUser = {
	created: boolean;
	user: SeedClerkUser;
};

type EnsuredSeedClerkUsers = {
	owner: EnsuredSeedClerkUser;
	member: EnsuredSeedClerkUser;
};

type SeedClerkUserInput = {
	email: string;
	firstName: string;
	lastName: string;
};

type SeedClerkUserUpdate = {
	password: string;
	firstName: string;
	lastName: string;
	skipPasswordChecks: true;
};

type SeedClerkUserCreate = {
	emailAddress: string[];
	password: string;
	firstName: string;
	lastName: string;
	skipPasswordChecks: true;
};

function seedClerkUserUpdate(input: SeedClerkUserInput): SeedClerkUserUpdate {
	return {
		password: SEED_TEST_PASSWORD,
		firstName: input.firstName,
		lastName: input.lastName,
		skipPasswordChecks: true,
	};
}

function seedClerkUserCreate(input: SeedClerkUserInput): SeedClerkUserCreate {
	return {
		...seedClerkUserUpdate(input),
		emailAddress: [input.email],
	};
}

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
		throw new Error("Invalid EMAIL for local seed.");
	}
	return result.data;
}

export function deriveSeedMemberEmail(ownerEmail: string): string {
	const atIndex = ownerEmail.lastIndexOf("@");
	if (atIndex === -1) {
		throw new Error("Invalid EMAIL for local seed.");
	}

	return `${ownerEmail.slice(0, atIndex)}+member${ownerEmail.slice(atIndex)}`;
}

function deriveSeedCameronEmail(ownerEmail: string): string {
	const atIndex = ownerEmail.lastIndexOf("@");
	if (atIndex === -1) {
		throw new Error("Invalid EMAIL for local seed.");
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

export async function createProductionSeedClerkClient(): Promise<SeedClerkClient> {
	const { secretKey } = readClerkServerConfig();
	const { createClerkClient } = await import("@clerk/backend");
	const clerk = createClerkClient({ secretKey });
	return {
		getUserList: (input) => clerk.users.getUserList(input),
		createUser: (input) => clerk.users.createUser(input),
		updateUser: (userId, input) => clerk.users.updateUser(userId, input),
		disableUserMFA: (userId) => clerk.users.disableUserMFA(userId),
		updateEmailAddress: (emailAddressId, input) =>
			clerk.emailAddresses.updateEmailAddress(emailAddressId, input),
		deleteUser: (userId) => clerk.users.deleteUser(userId),
	};
}

export async function createSeedClerkUsers(
	client: SeedClerkClient,
	mode: Extract<SeedMode, { kind: "clerk" }>,
): Promise<SeedClerkUsers> {
	const users = await ensureSeedClerkUsers(client, mode);
	return { owner: users.owner.user, member: users.member.user };
}

async function ensureSeedClerkUsers(
	client: SeedClerkClient,
	mode: Extract<SeedMode, { kind: "clerk" }>,
): Promise<EnsuredSeedClerkUsers> {
	const owner = await ensureSeedClerkUser(client, {
		email: mode.ownerEmail,
		firstName: "Seed",
		lastName: "Owner",
	});

	let member: EnsuredSeedClerkUser;
	try {
		member = await ensureSeedClerkUser(client, {
			email: mode.memberEmail,
			firstName: "Seed",
			lastName: "Member",
		});
	} catch (error) {
		if (owner.created) {
			await cleanupSeedClerkUsers(client, [
				{ user: owner.user, email: mode.ownerEmail },
			]);
		}
		throw error;
	}

	if (owner.user.id === member.user.id) {
		await cleanupSeedClerkUsers(
			client,
			[
				owner.created ? { user: owner.user, email: mode.ownerEmail } : null,
				member.created ? { user: member.user, email: mode.memberEmail } : null,
			].filter((user): user is { user: SeedClerkUser; email: string } =>
				Boolean(user),
			),
		);
		throw new Error(
			`Refusing to seed because Owner ${mode.ownerEmail} and Member ${mode.memberEmail} resolve to the same Clerk User ${owner.user.id}. Use an EMAIL whose derived +member address belongs to a separate Clerk User.`,
		);
	}

	return { owner, member };
}

async function ensureSeedClerkUser(
	client: SeedClerkClient,
	input: SeedClerkUserInput,
): Promise<EnsuredSeedClerkUser> {
	const existing = await findSeedClerkUserByEmail(client, input.email);
	if (existing) {
		const user = await client.updateUser(
			existing.id,
			seedClerkUserUpdate(input),
		);
		await verifySeedClerkEmailAddress(client, user, input.email);
		await client.disableUserMFA(user.id);
		return { created: false, user };
	}

	const user = await client.createUser(seedClerkUserCreate(input));
	try {
		await verifySeedClerkEmailAddress(client, user, input.email);
		await client.disableUserMFA(user.id);
		return { created: true, user };
	} catch (error) {
		await cleanupSeedClerkUsers(client, [{ user, email: input.email }]);
		throw error;
	}
}

async function verifySeedClerkEmailAddress(
	client: SeedClerkClient,
	user: SeedClerkUser,
	email: string,
): Promise<void> {
	const normalizedEmail = email.toLowerCase();
	const emailAddressId =
		user.emailAddresses.find(
			(address) => address.emailAddress.toLowerCase() === normalizedEmail,
		)?.id ?? user.primaryEmailAddressId;

	if (!emailAddressId) {
		throw new Error(
			`Unable to verify Clerk seed email ${email}: missing email address id.`,
		);
	}

	await client.updateEmailAddress(emailAddressId, {
		verified: true,
		primary: true,
	});
}

async function findSeedClerkUserByEmail(
	client: SeedClerkClient,
	email: string,
): Promise<SeedClerkUser | null> {
	const normalizedEmail = email.toLowerCase();
	const response = await client.getUserList({ query: email });
	return (
		response.data.find((user) =>
			user.emailAddresses.some(
				(address) => address.emailAddress.toLowerCase() === normalizedEmail,
			),
		) ?? null
	);
}

export async function cleanupSeedClerkUsers(
	client: SeedClerkClient,
	usersToDelete: { user: SeedClerkUser; email: string }[],
): Promise<void> {
	for (const { user, email } of usersToDelete) {
		try {
			await client.deleteUser(user.id);
		} catch (error) {
			console.error(
				`[seed] Failed to delete created Clerk User ${user.id} (${email}). Delete it manually.`,
			);
			console.error(error);
		}
	}
}

export function readLocalSeedMode(): SeedMode {
	loadLocalSeedEnv();
	return parseOptionalSeedEmail();
}

export async function seedLocalDatabases(): Promise<void> {
	await seedLocalDatabasesForMode(readLocalSeedMode());
}

export async function seedLocalDatabasesForMode(
	seedMode: SeedMode,
): Promise<void> {
	if (seedMode.kind === "clerk") {
		await seedEmailBackedLocalDatabases(seedMode);
		return;
	}

	await seedDeterministicLocalDatabases(seedMode);
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

		logSeedSummary({ scenario, seedMode });
	} finally {
		await pool.end();
	}
}

async function seedEmailBackedLocalDatabases(
	seedMode: Extract<SeedMode, { kind: "clerk" }>,
): Promise<void> {
	assertLocalSeedPrerequisites({ seedMode });
	assertLocalDirectoryDatabaseUrl(readPostgresConfig());
	const seedTarget = emailBackedSeedTargetForMode(seedMode);
	const clerkClient = await createProductionSeedClerkClient();

	const pool = postgresPool();

	try {
		const directory = directoryDb(pool);
		const clerkUsers = await ensureSeedClerkUsers(clerkClient, seedMode);

		try {
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
			logSeedSummary({ scenario, seedMode });
		} catch (error) {
			await cleanupSeedClerkUsers(
				clerkClient,
				[
					clerkUsers.owner.created
						? { user: clerkUsers.owner.user, email: seedMode.ownerEmail }
						: null,
					clerkUsers.member.created
						? { user: clerkUsers.member.user, email: seedMode.memberEmail }
						: null,
				].filter((user): user is { user: SeedClerkUser; email: string } =>
					Boolean(user),
				),
			);
			throw error;
		}
	} finally {
		await pool.end();
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
	assertLocalSeedEnvironment(
		(input.env?.APP_ENV as AppEnv | undefined) ?? "local",
	);
	if (input.seedMode.kind === "clerk") {
		readClerkServerConfig(input.env);
	}
}

function logSeedSummary(input: {
	scenario: Awaited<ReturnType<typeof seedPrimaryHouseholdScenario>>;
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
			`Refusing to seed because local seed data already exists for this EMAIL: ${conflicts.join(", ")}. ` +
			"Matching Clerk development Users were repaired before this check. " +
			"Use a different EMAIL or remove that specific seed data before retrying. Do not run make db-reseed unless you intend to reset all local app data."
		);
	}

	return (
		`Refusing to seed because deterministic seed data already exists: ${conflicts.join(", ")}. ` +
		"Run make db-reseed only if you intend to reset all local app data."
	);
}
