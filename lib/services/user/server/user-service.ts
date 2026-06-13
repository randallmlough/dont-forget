import { and, eq, isNull } from "drizzle-orm";
import { type User, users } from "@/db/schema/directory";
import type { DirectoryDb } from "@/db/server/client";
import { createAppId } from "@/lib/ids";
import type { ServerUserRecord } from "@/lib/server/auth";

type DirectoryTransaction = Parameters<
	Parameters<DirectoryDb["transaction"]>[0]
>[0];

export type UserServiceDirectory = DirectoryDb | DirectoryTransaction;

export type UpdateClerkUserName = (input: {
	clerkUserId: string;
	firstName: string | null;
	lastName: string | null;
}) => Promise<ServerUserRecord>;

export type UserService = {
	anonymizeUser(userId: string): Promise<void>;
	completeOnboarding(userId: string): Promise<void>;
	markUserDeleted(userId: string): Promise<void>;
	upsertUser(userRecord: ServerUserRecord): Promise<User>;
	updateUserName(input: {
		clerkUserId: string;
		firstName: string | null;
		lastName: string | null;
	}): Promise<User>;
};

export type UserServiceDeps = {
	directory: UserServiceDirectory;
	updateClerkUserName?: UpdateClerkUserName;
};

export class DeletedUserError extends Error {
	constructor() {
		super("User has been deleted.");
		this.name = "DeletedUserError";
	}
}

export function createUserService(deps: UserServiceDeps): UserService {
	return {
		anonymizeUser(userId) {
			return anonymizeUser(userId, deps.directory);
		},
		completeOnboarding(userId) {
			return completeOnboarding(userId, deps.directory);
		},
		markUserDeleted(userId) {
			return markUserDeleted(userId, deps.directory);
		},
		upsertUser(userRecord) {
			return upsertUser(userRecord, deps.directory);
		},
		async updateUserName(input) {
			const updateClerkUserName =
				deps.updateClerkUserName ?? (await defaultUpdateClerkUserName());
			const userRecord = await updateClerkUserName(input);
			return upsertUser(userRecord, deps.directory);
		},
	};
}

async function anonymizeUser(
	userId: string,
	directory: UserServiceDirectory,
): Promise<void> {
	const now = Date.now();
	await directory
		.update(users)
		.set({
			clerkUserId: `deleted_${userId}`,
			updatedAt: now,
		})
		.where(eq(users.id, userId));
}

async function markUserDeleted(
	userId: string,
	directory: UserServiceDirectory,
): Promise<void> {
	const now = Date.now();
	await directory
		.update(users)
		.set({
			email: null,
			firstName: null,
			lastName: null,
			displayName: null,
			activeHouseholdId: null,
			updatedAt: now,
			deletedAt: now,
		})
		.where(eq(users.id, userId));
}

async function completeOnboarding(
	userId: string,
	directory: UserServiceDirectory,
): Promise<void> {
	const completedAt = Date.now();
	await directory
		.update(users)
		.set({
			onboardingCompletedAt: completedAt,
			updatedAt: completedAt,
		})
		.where(and(eq(users.id, userId), isNull(users.onboardingCompletedAt)));
}

async function defaultUpdateClerkUserName(): Promise<UpdateClerkUserName> {
	const { updateClerkUserName } = await import("@/lib/server/auth");
	return updateClerkUserName;
}

async function upsertUser(
	userRecord: ServerUserRecord,
	directory: UserServiceDirectory,
): Promise<User> {
	const [existing] = await directory
		.select()
		.from(users)
		.where(eq(users.clerkUserId, userRecord.clerkUserId))
		.limit(1);
	if (existing?.deletedAt !== null && existing?.deletedAt !== undefined) {
		throw new DeletedUserError();
	}

	const now = Date.now();
	const userRecordFields = {
		email: userRecord.email,
		firstName: userRecord.firstName,
		lastName: userRecord.lastName,
		displayName: userRecord.displayName,
		updatedAt: now,
	};

	await directory
		.insert(users)
		.values({
			id: createAppId("usr"),
			clerkUserId: userRecord.clerkUserId,
			...userRecordFields,
			createdAt: now,
		})
		.onConflictDoUpdate({
			target: users.clerkUserId,
			set: userRecordFields,
		});

	const [user] = await directory
		.select()
		.from(users)
		.where(eq(users.clerkUserId, userRecord.clerkUserId))
		.limit(1);

	if (!user) {
		throw new Error("Unable to load bootstrapped User");
	}

	return user;
}
