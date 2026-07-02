import { eq } from "drizzle-orm";
import type { DirectoryDb } from "@/server/db/client";
import { type User, users } from "@/server/db/schema/postgres";
import type { ServerUserProfile } from "@/server/http";
import { createAppId } from "@/shared/ids";

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
			const updateClerkUserName =
				deps.updateClerkUserName ?? (await defaultUpdateClerkUserName());
			const profile = await updateClerkUserName(input);
			return upsertUser(profile, deps.directory);
		},
	};
}

async function defaultUpdateClerkUserName(): Promise<UpdateClerkUserName> {
	const { updateClerkUserName } = await import("@/server/http");
	return updateClerkUserName;
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
