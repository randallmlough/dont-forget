import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { deletedUserIdentities, type User, users } from "@/db/schema/directory";
import type { DirectoryDb } from "@/db/server/client";
import { createAppId } from "@/lib/ids";
import type { ServerUserProfile } from "@/lib/server/auth";

type DirectoryTransaction = Parameters<
	Parameters<DirectoryDb["transaction"]>[0]
>[0];

export type UserServiceDirectory = DirectoryDb | DirectoryTransaction;

export type UserService = {
	anonymizeUser(input: UserDeletionIdentityInput): Promise<void>;
	markUserDeleted(input: UserDeletionIdentityInput): Promise<void>;
	recordClerkDeleted(input: UserDeletionIdentityInput): Promise<void>;
	upsertUser(profile: ServerUserProfile): Promise<User>;
};

export type UserDeletionIdentityInput = {
	userId: string;
	clerkUserId: string;
};

export type UserServiceDeps = {
	directory: UserServiceDirectory;
};

export class DeletedUserError extends Error {
	constructor() {
		super("User has been deleted.");
		this.name = "DeletedUserError";
	}
}

export function createUserService(deps: UserServiceDeps): UserService {
	return {
		anonymizeUser(input) {
			return anonymizeUser(input, deps.directory);
		},
		markUserDeleted(input) {
			return markUserDeleted(input, deps.directory);
		},
		recordClerkDeleted(input) {
			return recordClerkDeleted(input, deps.directory);
		},
		upsertUser(profile) {
			return upsertUser(profile, deps.directory);
		},
	};
}

async function anonymizeUser(
	input: UserDeletionIdentityInput,
	directory: UserServiceDirectory,
): Promise<void> {
	const now = Date.now();
	await directory
		.update(users)
		.set({
			clerkUserId: `deleted_${input.userId}`,
			updatedAt: now,
		})
		.where(eq(users.id, input.userId));
	await upsertDeletedUserIdentity(
		{
			userId: input.userId,
			clerkUserId: input.clerkUserId,
			anonymizedAt: now,
		},
		directory,
	);
}

async function markUserDeleted(
	input: UserDeletionIdentityInput,
	directory: UserServiceDirectory,
): Promise<void> {
	const now = Date.now();
	await upsertDeletedUserIdentity(
		{
			userId: input.userId,
			clerkUserId: input.clerkUserId,
			directoryDeletedAt: now,
		},
		directory,
	);
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
		.where(eq(users.id, input.userId));
}

async function recordClerkDeleted(
	input: UserDeletionIdentityInput,
	directory: UserServiceDirectory,
): Promise<void> {
	await upsertDeletedUserIdentity(
		{
			userId: input.userId,
			clerkUserId: input.clerkUserId,
			clerkDeletedAt: Date.now(),
		},
		directory,
	);
}

async function upsertUser(
	profile: ServerUserProfile,
	directory: UserServiceDirectory,
): Promise<User> {
	const [deletedIdentity] = await directory
		.select()
		.from(deletedUserIdentities)
		.where(
			eq(
				deletedUserIdentities.clerkUserIdHash,
				clerkUserIdHash(profile.clerkUserId),
			),
		)
		.limit(1);
	if (deletedIdentity) {
		throw new DeletedUserError();
	}

	const [existing] = await directory
		.select()
		.from(users)
		.where(eq(users.clerkUserId, profile.clerkUserId))
		.limit(1);
	if (existing?.deletedAt !== null && existing?.deletedAt !== undefined) {
		throw new DeletedUserError();
	}

	const now = Date.now();
	const profileFields = {
		email: profile.email,
		firstName: profile.firstName,
		lastName: profile.lastName,
		displayName: profile.displayName,
		updatedAt: now,
	};

	await directory
		.insert(users)
		.values({
			id: createAppId("usr"),
			clerkUserId: profile.clerkUserId,
			...profileFields,
			createdAt: now,
		})
		.onConflictDoUpdate({
			target: users.clerkUserId,
			set: profileFields,
		});

	const [user] = await directory
		.select()
		.from(users)
		.where(eq(users.clerkUserId, profile.clerkUserId))
		.limit(1);

	if (!user) {
		throw new Error("Unable to load bootstrapped User");
	}

	return user;
}

type DeletedUserIdentityUpdate = {
	userId: string;
	clerkUserId: string;
	directoryDeletedAt?: number;
	clerkDeletedAt?: number;
	anonymizedAt?: number;
};

async function upsertDeletedUserIdentity(
	input: DeletedUserIdentityUpdate,
	directory: UserServiceDirectory,
): Promise<void> {
	const values = {
		id: createAppId("dui"),
		userId: input.userId,
		clerkUserIdHash: clerkUserIdHash(input.clerkUserId),
		createdAt: input.directoryDeletedAt ?? Date.now(),
		directoryDeletedAt: input.directoryDeletedAt,
		clerkDeletedAt: input.clerkDeletedAt,
		anonymizedAt: input.anonymizedAt,
	};
	await directory
		.insert(deletedUserIdentities)
		.values(values)
		.onConflictDoUpdate({
			target: deletedUserIdentities.clerkUserIdHash,
			set: {
				userId: input.userId,
				directoryDeletedAt: sql`coalesce(excluded.directory_deleted_at, ${deletedUserIdentities.directoryDeletedAt})`,
				clerkDeletedAt: sql`coalesce(excluded.clerk_deleted_at, ${deletedUserIdentities.clerkDeletedAt})`,
				anonymizedAt: sql`coalesce(excluded.anonymized_at, ${deletedUserIdentities.anonymizedAt})`,
			},
		});
}

function clerkUserIdHash(clerkUserId: string): string {
	return createHash("sha256").update(clerkUserId).digest("hex");
}
