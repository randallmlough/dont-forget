import { eq } from "drizzle-orm";
import { type User, users } from "@/db/schema/directory";
import type { DirectoryDb } from "@/db/server/client";
import { createAppId } from "@/lib/ids";
import type { ServerUserProfile } from "@/lib/server/auth";

type DirectoryTransaction = Parameters<
	Parameters<DirectoryDb["transaction"]>[0]
>[0];

export type UserServiceDirectory = DirectoryDb | DirectoryTransaction;

export type UserService = {
	anonymizeUser(userId: string): Promise<void>;
	upsertUser(profile: ServerUserProfile): Promise<User>;
};

export type UserServiceDeps = {
	directory: UserServiceDirectory;
};

export function createUserService(deps: UserServiceDeps): UserService {
	return {
		anonymizeUser(userId) {
			return anonymizeUser(userId, deps.directory);
		},
		upsertUser(profile) {
			return upsertUser(profile, deps.directory);
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
			email: null,
			firstName: null,
			lastName: null,
			displayName: null,
			clerkUserId: `deleted_${userId}`,
			activeHouseholdId: null,
			updatedAt: now,
			deletedAt: now,
		})
		.where(eq(users.id, userId));
}

async function upsertUser(
	profile: ServerUserProfile,
	directory: UserServiceDirectory,
): Promise<User> {
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
