import type { ServerUserProfile } from "@api/http";
import type { DirectoryDb } from "@dont-forget/db";
import { type User, users } from "@dont-forget/db/schema";
import { createAppId } from "@dont-forget/shared";
import { eq } from "drizzle-orm";

type DirectoryTransaction = Parameters<
	Parameters<DirectoryDb["transaction"]>[0]
>[0];

export type UserServiceDirectory = DirectoryDb | DirectoryTransaction;

export type UpdateClerkUserName = (input: {
	clerkUserId: string;
	firstName: string | null;
	lastName: string | null;
}) => Promise<ServerUserProfile>;

export type UserService = {
	upsertUser(profile: ServerUserProfile): Promise<User>;
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

export function createUserService(deps: UserServiceDeps): UserService {
	return {
		upsertUser(profile) {
			return upsertUser(profile, deps.directory);
		},
		async updateUserName(input) {
			const updateClerkUserName = deps.updateClerkUserName;
			if (!updateClerkUserName) {
				throw new Error("Clerk User name updates are not configured");
			}
			const profile = await updateClerkUserName(input);
			return upsertUser(profile, deps.directory);
		},
	};
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
