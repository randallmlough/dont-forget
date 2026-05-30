import { randomInt } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";

import type { DirectoryDb } from "@/db/client";
import {
	type HouseholdJoinCode,
	householdJoinCodeAttempts,
	householdJoinCodes,
	householdJoinCodeUses,
	households,
	type Membership,
	memberships,
	users,
} from "@/db/schema/directory";
import { track } from "@/lib/analytics";
import { createAppId } from "@/lib/ids";
import { findActiveMembershipSelection } from "./active-household-service";

const JOIN_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const JOIN_CODE_LENGTH = 8;
const MAX_CODE_GENERATION_ATTEMPTS = 5;
const FAILED_ATTEMPT_LIMIT = 5;
const FAILED_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

type DirectoryTransaction = Parameters<
	Parameters<DirectoryDb["transaction"]>[0]
>[0];

type HouseholdJoinCodeServiceExecutor = DirectoryDb | DirectoryTransaction;

export class HouseholdJoinCodeUnavailableError extends Error {
	constructor() {
		super("Household Join Code is not available");
		this.name = "HouseholdJoinCodeUnavailableError";
	}
}

export class HouseholdJoinCodeThrottledError extends Error {
	constructor() {
		super("Too many Household Join Code attempts");
		this.name = "HouseholdJoinCodeThrottledError";
	}
}

export class HouseholdJoinCodeMembershipRequiredError extends Error {
	constructor() {
		super("User must be an active Member of the Household");
		this.name = "HouseholdJoinCodeMembershipRequiredError";
	}
}

export type HouseholdJoinCodeGenerator = () => string | Promise<string>;

export type HouseholdJoinUrlBuilder = (input: { code: string }) => string;

export type HouseholdJoinCodeState =
	| {
			enabled: true;
			id: string;
			householdId: string;
			code: string;
			groupedCode: string;
			joinUrl: string;
			createdAt: number;
	  }
	| {
			enabled: false;
			householdId: string;
	  };

export type HouseholdJoinCodePreview =
	| { available: true; householdName: string }
	| { available: false };

export type JoinHouseholdByCodeInput = {
	code: string;
	userId: string;
	source?: "manual_code" | "join_link";
};

export type JoinHouseholdByCodeResult = {
	householdJoinCodeId: string;
	householdId: string;
	membershipId: string;
	membershipRole: "owner" | "member";
	membershipCreated: boolean;
	useId: string;
	activeHouseholdId: string;
};

export type HouseholdJoinCodeService = {
	getCurrentJoinCode(input: {
		householdId: string;
		requestedByUserId: string;
	}): Promise<HouseholdJoinCodeState>;
	previewJoinCode(code: string): Promise<HouseholdJoinCodePreview>;
	joinByCode(
		input: JoinHouseholdByCodeInput,
	): Promise<JoinHouseholdByCodeResult>;
	regenerateJoinCode(input: {
		householdId: string;
		requestedByUserId: string;
	}): Promise<HouseholdJoinCodeState>;
	disableJoinCode(input: {
		householdId: string;
		requestedByUserId: string;
	}): Promise<HouseholdJoinCodeState>;
	enableJoinCode(input: {
		householdId: string;
		requestedByUserId: string;
	}): Promise<HouseholdJoinCodeState>;
};

export type HouseholdJoinCodeServiceDeps = {
	directory: DirectoryDb;
	buildJoinUrl?: HouseholdJoinUrlBuilder;
	generateCode?: HouseholdJoinCodeGenerator;
	analytics?: { track: typeof track };
};

export function createHouseholdJoinCodeService(
	deps: HouseholdJoinCodeServiceDeps,
): HouseholdJoinCodeService {
	const buildJoinUrl = deps.buildJoinUrl ?? defaultBuildJoinUrl;
	const generateCode = deps.generateCode ?? generateSecureHouseholdJoinCode;
	const analytics = deps.analytics ?? { track };
	let joinQueue: Promise<unknown> = Promise.resolve();

	return {
		getCurrentJoinCode(input) {
			return getCurrentJoinCode(input, deps.directory, buildJoinUrl);
		},
		previewJoinCode(code) {
			return previewJoinCode(code, deps.directory);
		},
		joinByCode(input) {
			const result = joinQueue.then(() =>
				joinByCode(input, deps.directory, analytics),
			);
			joinQueue = result.catch(() => undefined);
			return result;
		},
		regenerateJoinCode(input) {
			return regenerateJoinCode(input, deps.directory, {
				buildJoinUrl,
				generateCode,
				analytics,
			});
		},
		disableJoinCode(input) {
			return disableJoinCode(input, deps.directory, buildJoinUrl, analytics);
		},
		enableJoinCode(input) {
			return enableJoinCode(input, deps.directory, {
				buildJoinUrl,
				generateCode,
				analytics,
			});
		},
	};
}

async function getCurrentJoinCode(
	input: { householdId: string; requestedByUserId: string },
	directory: HouseholdJoinCodeServiceExecutor,
	buildJoinUrl: HouseholdJoinUrlBuilder,
): Promise<HouseholdJoinCodeState> {
	await requireActiveHouseholdMember(input, directory);
	const code = await findCurrentJoinCode(input.householdId, directory);
	return code
		? toJoinCodeState(code, buildJoinUrl)
		: disabledJoinCode(input.householdId);
}

async function previewJoinCode(
	code: string,
	directory: HouseholdJoinCodeServiceExecutor,
): Promise<HouseholdJoinCodePreview> {
	const current = await findAvailableJoinCode(
		normalizeJoinCode(code),
		directory,
	);
	if (!current) return { available: false };
	return { available: true, householdName: current.householdName };
}

async function joinByCode(
	input: JoinHouseholdByCodeInput,
	directory: DirectoryDb,
	analytics: { track: typeof track },
): Promise<JoinHouseholdByCodeResult> {
	const now = Date.now();
	await assertNotThrottled(input.userId, now, directory);
	const normalizedCode = normalizeJoinCode(input.code);
	const availableCode = await findAvailableJoinCode(normalizedCode, directory);
	if (!availableCode) {
		await recordFailedAttempt({ userId: input.userId, now }, directory);
		throw new HouseholdJoinCodeUnavailableError();
	}

	const result = await runJoinTransactionWithBusyRetry(async () =>
		directory.transaction(async (tx) => {
			const availableCode = await findAvailableJoinCode(normalizedCode, tx);
			if (!availableCode) {
				throw new HouseholdJoinCodeUnavailableError();
			}

			const { membership, created } = await ensurePlainMemberMembership(
				{
					householdId: availableCode.householdId,
					userId: input.userId,
					now,
				},
				tx,
			);
			const useId = createAppId("hjcu");
			await tx.insert(householdJoinCodeUses).values({
				id: useId,
				householdJoinCodeId: availableCode.id,
				householdId: availableCode.householdId,
				userId: input.userId,
				membershipId: membership.id,
				usedAt: now,
			});
			await tx
				.update(users)
				.set({ activeHouseholdId: availableCode.householdId, updatedAt: now })
				.where(eq(users.id, input.userId));
			await tx
				.delete(householdJoinCodeAttempts)
				.where(eq(householdJoinCodeAttempts.userId, input.userId));

			return {
				householdJoinCodeId: availableCode.id,
				householdId: availableCode.householdId,
				membershipId: membership.id,
				membershipRole: membership.role,
				membershipCreated: created,
				useId,
				activeHouseholdId: availableCode.householdId,
			};
		}),
	);

	analytics.track("household_join_code_used", {
		household_id: result.householdId,
		user_id: input.userId,
		membership_created: result.membershipCreated,
		source: input.source ?? "manual_code",
	});

	return result;
}

async function regenerateJoinCode(
	input: { householdId: string; requestedByUserId: string },
	directory: DirectoryDb,
	deps: {
		buildJoinUrl: HouseholdJoinUrlBuilder;
		generateCode: HouseholdJoinCodeGenerator;
		analytics: { track: typeof track };
	},
): Promise<HouseholdJoinCodeState> {
	const now = Date.now();
	await requireActiveHouseholdMember(input, directory);

	const result = await directory.transaction(async (tx) => {
		await tx
			.update(householdJoinCodes)
			.set({ replacedAt: now, replacedByUserId: input.requestedByUserId })
			.where(
				and(
					eq(householdJoinCodes.householdId, input.householdId),
					isNull(householdJoinCodes.disabledAt),
					isNull(householdJoinCodes.replacedAt),
				),
			);

		const code = await createJoinCodeRow(
			{
				householdId: input.householdId,
				requestedByUserId: input.requestedByUserId,
				now,
			},
			tx,
			deps.generateCode,
		);

		return toJoinCodeState(code, deps.buildJoinUrl);
	});

	deps.analytics.track("household_join_code_regenerated", {
		household_id: input.householdId,
		requested_by_user_id: input.requestedByUserId,
	});

	return result;
}

async function disableJoinCode(
	input: { householdId: string; requestedByUserId: string },
	directory: HouseholdJoinCodeServiceExecutor,
	buildJoinUrl: HouseholdJoinUrlBuilder,
	analytics: { track: typeof track },
): Promise<HouseholdJoinCodeState> {
	const now = Date.now();
	await requireActiveHouseholdMember(input, directory);
	const current = await findCurrentJoinCode(input.householdId, directory);
	if (!current) return disabledJoinCode(input.householdId);

	const [updated] = await directory
		.update(householdJoinCodes)
		.set({ disabledAt: now, disabledByUserId: input.requestedByUserId })
		.where(eq(householdJoinCodes.id, current.id))
		.returning();

	analytics.track("household_join_code_disabled", {
		household_id: input.householdId,
		requested_by_user_id: input.requestedByUserId,
	});

	return updated
		? toJoinCodeState(updated, buildJoinUrl)
		: disabledJoinCode(input.householdId);
}

async function enableJoinCode(
	input: { householdId: string; requestedByUserId: string },
	directory: DirectoryDb,
	deps: {
		buildJoinUrl: HouseholdJoinUrlBuilder;
		generateCode: HouseholdJoinCodeGenerator;
		analytics: { track: typeof track };
	},
): Promise<HouseholdJoinCodeState> {
	const now = Date.now();
	await requireActiveHouseholdMember(input, directory);
	const current = await findCurrentJoinCode(input.householdId, directory);
	if (current) return toJoinCodeState(current, deps.buildJoinUrl);

	const code = await createJoinCodeRow(
		{
			householdId: input.householdId,
			requestedByUserId: input.requestedByUserId,
			now,
		},
		directory,
		deps.generateCode,
	);

	deps.analytics.track("household_join_code_enabled", {
		household_id: input.householdId,
		requested_by_user_id: input.requestedByUserId,
	});

	return toJoinCodeState(code, deps.buildJoinUrl);
}

async function requireActiveHouseholdMember(
	input: { householdId: string; requestedByUserId: string },
	directory: HouseholdJoinCodeServiceExecutor,
) {
	const membership = await findActiveMembershipSelection(
		{ userId: input.requestedByUserId, householdId: input.householdId },
		directory,
	);
	if (!membership) throw new HouseholdJoinCodeMembershipRequiredError();
}

async function findCurrentJoinCode(
	householdId: string,
	directory: HouseholdJoinCodeServiceExecutor,
): Promise<HouseholdJoinCode | null> {
	const [row] = await directory
		.select()
		.from(householdJoinCodes)
		.where(
			and(
				eq(householdJoinCodes.householdId, householdId),
				isNull(householdJoinCodes.disabledAt),
				isNull(householdJoinCodes.replacedAt),
			),
		)
		.limit(1);

	return row ?? null;
}

async function findAvailableJoinCode(
	code: string,
	directory: HouseholdJoinCodeServiceExecutor,
): Promise<(HouseholdJoinCode & { householdName: string }) | null> {
	const [row] = await directory
		.select({
			id: householdJoinCodes.id,
			householdId: householdJoinCodes.householdId,
			code: householdJoinCodes.code,
			createdByUserId: householdJoinCodes.createdByUserId,
			createdAt: householdJoinCodes.createdAt,
			disabledAt: householdJoinCodes.disabledAt,
			disabledByUserId: householdJoinCodes.disabledByUserId,
			replacedAt: householdJoinCodes.replacedAt,
			replacedByUserId: householdJoinCodes.replacedByUserId,
			householdName: households.name,
		})
		.from(householdJoinCodes)
		.innerJoin(households, eq(households.id, householdJoinCodes.householdId))
		.where(
			and(
				eq(householdJoinCodes.code, code),
				isNull(householdJoinCodes.disabledAt),
				isNull(householdJoinCodes.replacedAt),
				isNull(households.deletedAt),
			),
		)
		.limit(1);

	return row ?? null;
}

async function createJoinCodeRow(
	input: { householdId: string; requestedByUserId: string; now: number },
	directory: HouseholdJoinCodeServiceExecutor,
	generateCode: HouseholdJoinCodeGenerator,
): Promise<HouseholdJoinCode> {
	for (let attempt = 0; attempt < MAX_CODE_GENERATION_ATTEMPTS; attempt += 1) {
		const code = normalizeJoinCode(await generateCode());
		const [existing] = await directory
			.select({ id: householdJoinCodes.id })
			.from(householdJoinCodes)
			.where(eq(householdJoinCodes.code, code))
			.limit(1);

		if (existing) continue;

		const joinCode: HouseholdJoinCode = {
			id: createAppId("hjc"),
			householdId: input.householdId,
			code,
			createdByUserId: input.requestedByUserId,
			createdAt: input.now,
			disabledAt: null,
			disabledByUserId: null,
			replacedAt: null,
			replacedByUserId: null,
		};
		await directory.insert(householdJoinCodes).values(joinCode);
		return joinCode;
	}

	throw new Error("Unable to generate a unique Household Join Code");
}

async function assertNotThrottled(
	userId: string,
	now: number,
	directory: HouseholdJoinCodeServiceExecutor,
) {
	const [attempt] = await directory
		.select()
		.from(householdJoinCodeAttempts)
		.where(eq(householdJoinCodeAttempts.userId, userId))
		.limit(1);

	if (!attempt) return;
	if (attempt.windowStartedAt <= now - FAILED_ATTEMPT_WINDOW_MS) return;
	if (attempt.failedCount >= FAILED_ATTEMPT_LIMIT) {
		throw new HouseholdJoinCodeThrottledError();
	}
}

async function recordFailedAttempt(
	input: { userId: string; now: number },
	directory: HouseholdJoinCodeServiceExecutor,
) {
	const [attempt] = await directory
		.select()
		.from(householdJoinCodeAttempts)
		.where(eq(householdJoinCodeAttempts.userId, input.userId))
		.limit(1);

	if (
		!attempt ||
		attempt.windowStartedAt <= input.now - FAILED_ATTEMPT_WINDOW_MS
	) {
		await directory
			.insert(householdJoinCodeAttempts)
			.values({
				userId: input.userId,
				failedCount: 1,
				windowStartedAt: input.now,
				lastFailedAt: input.now,
			})
			.onConflictDoUpdate({
				target: householdJoinCodeAttempts.userId,
				set: {
					failedCount: 1,
					windowStartedAt: input.now,
					lastFailedAt: input.now,
				},
			});
		return;
	}

	await directory
		.update(householdJoinCodeAttempts)
		.set({
			failedCount: attempt.failedCount + 1,
			lastFailedAt: input.now,
		})
		.where(eq(householdJoinCodeAttempts.userId, input.userId));
}

async function runJoinTransactionWithBusyRetry<T>(
	run: () => Promise<T>,
): Promise<T> {
	let lastError: unknown;
	for (let attempt = 0; attempt < 20; attempt += 1) {
		try {
			return await run();
		} catch (error) {
			if (!isSqliteBusyError(error)) throw error;
			lastError = error;
			await new Promise((resolve) => setTimeout(resolve, 25));
		}
	}
	throw lastError;
}

function isSqliteBusyError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	return (
		error.message.includes("SQLITE_BUSY") ||
		error.message.includes("database is locked")
	);
}

async function ensurePlainMemberMembership(
	input: { householdId: string; userId: string; now: number },
	directory: HouseholdJoinCodeServiceExecutor,
): Promise<{ membership: Membership; created: boolean }> {
	const [existing] = await directory
		.select()
		.from(memberships)
		.where(
			and(
				eq(memberships.householdId, input.householdId),
				eq(memberships.userId, input.userId),
				isNull(memberships.removedAt),
			),
		)
		.limit(1);

	if (existing) return { membership: existing, created: false };

	const membership: Membership = {
		id: createAppId("mbr"),
		householdId: input.householdId,
		userId: input.userId,
		role: "member",
		joinedAt: input.now,
		removedAt: null,
	};
	await directory.insert(memberships).values(membership);
	return { membership, created: true };
}

function toJoinCodeState(
	code: HouseholdJoinCode,
	buildJoinUrl: HouseholdJoinUrlBuilder,
): HouseholdJoinCodeState {
	if (code.disabledAt !== null || code.replacedAt !== null) {
		return disabledJoinCode(code.householdId);
	}

	return {
		enabled: true,
		id: code.id,
		householdId: code.householdId,
		code: code.code,
		groupedCode: groupJoinCode(code.code),
		joinUrl: buildJoinUrl({ code: code.code }),
		createdAt: code.createdAt,
	};
}

function disabledJoinCode(householdId: string): HouseholdJoinCodeState {
	return { enabled: false, householdId };
}

function normalizeJoinCode(code: string): string {
	return code.toUpperCase().replace(/[\s-]/g, "");
}

function groupJoinCode(code: string): string {
	return `${code.slice(0, 4)} ${code.slice(4)}`;
}

function defaultBuildJoinUrl(input: { code: string }): string {
	return `/households/join?code=${encodeURIComponent(input.code)}`;
}

function generateSecureHouseholdJoinCode(): string {
	let code = "";
	for (let index = 0; index < JOIN_CODE_LENGTH; index += 1) {
		code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)];
	}
	return code;
}
