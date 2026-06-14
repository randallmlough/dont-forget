import { asc, eq } from "drizzle-orm";

import {
	deletedUserIdentities,
	households,
	invitations,
	memberships,
	pushTokens,
	type User,
	users,
} from "@/db/schema/directory";
import { createTestDirectoryDb } from "@/db/server/test";
import type { TursoPlatformClient } from "@/db/server/turso-platform";
import { createAccountDeletionService } from "./account-deletion-service";

describe("createAccountDeletionService", () => {
	it("deletes a sole-Owner Household and tears down its Turso database", async () => {
		const directory = await createTestDirectoryDb();
		const deleteDatabase = jest.fn(async () => undefined);
		const deleteClerkUser = jest.fn(async () => undefined);
		const anonymizeUser = jest.fn(async () => undefined);
		let transactionRunnerCalls = 0;
		const transactionRunner = async <T>(
			operation: () => Promise<T>,
		): Promise<T> => {
			transactionRunnerCalls += 1;
			return operation();
		};

		try {
			const user = await seedUser(directory.db, "usr_avery", "clerk_avery");
			await seedHousehold(directory.db, {
				id: "hh_solo",
				tursoDbName: "df-test-hh-solo",
				createdByUserId: user.id,
			});
			await seedMembership(directory.db, {
				id: "mbr_solo",
				householdId: "hh_solo",
				userId: user.id,
				role: "owner",
			});

			const summary = await createAccountDeletionService({
				directory: directory.db,
				tursoPlatform: () => tursoPlatform(deleteDatabase),
				deleteClerkUser,
				anonymizeUser,
				transactionRunner,
			}).deleteAccount({ user });

			expect(summary).toEqual({
				leftHouseholdIds: [],
				deletedHouseholdIds: ["hh_solo"],
				databasesNotDeleted: [],
			});
			expect(deleteDatabase).toHaveBeenCalledWith("df-test-hh-solo");
			expect(deleteClerkUser).toHaveBeenCalledWith("clerk_avery");
			expect(anonymizeUser).toHaveBeenCalledWith({
				userId: "usr_avery",
				clerkUserId: "clerk_avery",
			});
			expect(transactionRunnerCalls).toBe(1);
			await expectHouseholdDeleted(directory.db, "hh_solo");
			await expectMembershipRemoved(directory.db, "mbr_solo");
			await expectUserMarkedDeleted(directory.db, {
				userId: user.id,
				directoryDeletedAt: expect.any(Number),
				clerkDeletedAt: expect.any(Number),
				anonymizedAt: null,
			});
		} finally {
			await directory.close();
		}
	});

	it("promotes a sole plain Member before deleting their orphaned Household", async () => {
		const directory = await createTestDirectoryDb();

		try {
			const user = await seedUser(directory.db, "usr_avery", "clerk_avery");
			await seedHousehold(directory.db, {
				id: "hh_orphan",
				tursoDbName: "df-test-hh-orphan",
				createdByUserId: user.id,
			});
			await seedMembership(directory.db, {
				id: "mbr_orphan",
				householdId: "hh_orphan",
				userId: user.id,
				role: "member",
			});

			const summary = await createAccountDeletionService({
				directory: directory.db,
				tursoPlatform: () => tursoPlatform(),
				deleteClerkUser: async () => undefined,
				anonymizeUser: async () => undefined,
			}).deleteAccount({ user });

			expect(summary.deletedHouseholdIds).toEqual(["hh_orphan"]);
			const [membership] = await directory.db
				.select()
				.from(memberships)
				.where(eq(memberships.id, "mbr_orphan"));
			expect(membership).toMatchObject({
				role: "owner",
				removedAt: expect.any(Number),
			});
		} finally {
			await directory.close();
		}
	});

	it("leaves a multi-Member Household and promotes the next Member when the User is the last Owner", async () => {
		const directory = await createTestDirectoryDb();

		try {
			const owner = await seedUser(directory.db, "usr_owner", "clerk_owner");
			const remaining = await seedUser(
				directory.db,
				"usr_remaining",
				"clerk_remaining",
			);
			await seedHousehold(directory.db, {
				id: "hh_shared",
				tursoDbName: "df-test-hh-shared",
				createdByUserId: owner.id,
			});
			await seedMembership(directory.db, {
				id: "mbr_owner",
				householdId: "hh_shared",
				userId: owner.id,
				role: "owner",
				joinedAt: 1,
			});
			await seedMembership(directory.db, {
				id: "mbr_remaining",
				householdId: "hh_shared",
				userId: remaining.id,
				role: "member",
				joinedAt: 2,
			});

			const summary = await createAccountDeletionService({
				directory: directory.db,
				deleteClerkUser: async () => undefined,
				anonymizeUser: async () => undefined,
			}).deleteAccount({ user: owner });

			expect(summary).toEqual({
				leftHouseholdIds: ["hh_shared"],
				deletedHouseholdIds: [],
				databasesNotDeleted: [],
			});
			await expectMembershipRemoved(directory.db, "mbr_owner");
			const [promoted] = await directory.db
				.select()
				.from(memberships)
				.where(eq(memberships.id, "mbr_remaining"));
			expect(promoted.role).toBe("owner");
		} finally {
			await directory.close();
		}
	});

	it("simply leaves a multi-Member Household when the User is a plain Member", async () => {
		const directory = await createTestDirectoryDb();

		try {
			const owner = await seedUser(directory.db, "usr_owner", "clerk_owner");
			const member = await seedUser(directory.db, "usr_member", "clerk_member");
			await seedHousehold(directory.db, {
				id: "hh_shared",
				tursoDbName: "df-test-hh-shared",
				createdByUserId: owner.id,
			});
			await seedMembership(directory.db, {
				id: "mbr_owner",
				householdId: "hh_shared",
				userId: owner.id,
				role: "owner",
			});
			await seedMembership(directory.db, {
				id: "mbr_member",
				householdId: "hh_shared",
				userId: member.id,
				role: "member",
			});

			const summary = await createAccountDeletionService({
				directory: directory.db,
				deleteClerkUser: async () => undefined,
				anonymizeUser: async () => undefined,
			}).deleteAccount({ user: member });

			expect(summary.leftHouseholdIds).toEqual(["hh_shared"]);
			await expectMembershipRemoved(directory.db, "mbr_member");
			const [ownerMembership] = await directory.db
				.select()
				.from(memberships)
				.where(eq(memberships.id, "mbr_owner"));
			expect(ownerMembership).toMatchObject({ role: "owner", removedAt: null });
		} finally {
			await directory.close();
		}
	});

	it("handles a mixed membership set and revokes pending created Invitations", async () => {
		const directory = await createTestDirectoryDb();

		try {
			const user = await seedUser(directory.db, "usr_avery", "clerk_avery");
			const other = await seedUser(directory.db, "usr_other", "clerk_other");
			await seedHousehold(directory.db, {
				id: "hh_solo",
				tursoDbName: "df-test-hh-solo",
				createdByUserId: user.id,
			});
			await seedHousehold(directory.db, {
				id: "hh_shared",
				tursoDbName: "df-test-hh-shared",
				createdByUserId: user.id,
			});
			await seedMembership(directory.db, {
				id: "mbr_solo",
				householdId: "hh_solo",
				userId: user.id,
				role: "owner",
			});
			await seedMembership(directory.db, {
				id: "mbr_shared_user",
				householdId: "hh_shared",
				userId: user.id,
				role: "owner",
			});
			await seedMembership(directory.db, {
				id: "mbr_shared_other",
				householdId: "hh_shared",
				userId: other.id,
				role: "member",
			});
			await directory.db.insert(invitations).values([
				invitation({
					id: "inv_pending",
					householdId: "hh_shared",
					createdByUserId: user.id,
				}),
				invitation({
					id: "inv_accepted",
					householdId: "hh_shared",
					createdByUserId: user.id,
					acceptedAt: 1,
					acceptedByUserId: other.id,
				}),
				invitation({
					id: "inv_revoked",
					householdId: "hh_shared",
					createdByUserId: user.id,
					revokedAt: 1,
				}),
			]);

			const summary = await createAccountDeletionService({
				directory: directory.db,
				tursoPlatform: () => tursoPlatform(),
				deleteClerkUser: async () => undefined,
				anonymizeUser: async () => undefined,
			}).deleteAccount({ user });

			expect(summary).toEqual({
				leftHouseholdIds: ["hh_shared"],
				deletedHouseholdIds: ["hh_solo"],
				databasesNotDeleted: [],
			});
			const invitationRows = await directory.db
				.select()
				.from(invitations)
				.orderBy(asc(invitations.id));
			expect(invitationRows).toMatchObject([
				{ id: "inv_accepted", revokedAt: null },
				{ id: "inv_pending", revokedAt: expect.any(Number) },
				{ id: "inv_revoked", revokedAt: 1 },
			]);
		} finally {
			await directory.close();
		}
	});

	it("deletes push token identifiers for the deleted User inside the directory transaction", async () => {
		const directory = await createTestDirectoryDb();

		try {
			const user = await seedUser(directory.db, "usr_avery", "clerk_avery");
			const other = await seedUser(directory.db, "usr_other", "clerk_other");
			await seedHousehold(directory.db, {
				id: "hh_solo",
				tursoDbName: "df-test-hh-solo",
				createdByUserId: user.id,
			});
			await seedMembership(directory.db, {
				id: "mbr_solo",
				householdId: "hh_solo",
				userId: user.id,
				role: "owner",
			});
			await directory.db.insert(pushTokens).values([
				pushToken({
					id: "pst_active_one",
					userId: user.id,
					expoPushToken: "ExponentPushToken[one]",
				}),
				pushToken({
					id: "pst_disabled",
					userId: user.id,
					expoPushToken: "ExponentPushToken[two]",
					disabledAt: 2,
					updatedAt: 2,
				}),
				pushToken({
					id: "pst_other",
					userId: other.id,
					expoPushToken: "ExponentPushToken[three]",
				}),
			]);

			await createAccountDeletionService({
				directory: directory.db,
				tursoPlatform: () => tursoPlatform(),
				deleteClerkUser: async () => undefined,
				anonymizeUser: async () => undefined,
			}).deleteAccount({ user });

			await expect(directory.db.select().from(pushTokens)).resolves.toEqual([
				expect.objectContaining({
					id: "pst_other",
					userId: other.id,
					expoPushToken: "ExponentPushToken[three]",
					disabledAt: null,
					updatedAt: 1,
				}),
			]);
		} finally {
			await directory.close();
		}
	});

	it("records Turso teardown failures without failing account deletion", async () => {
		const directory = await createTestDirectoryDb();
		const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

		try {
			const user = await seedUser(directory.db, "usr_avery", "clerk_avery");
			await seedHousehold(directory.db, {
				id: "hh_solo",
				tursoDbName: "df-test-hh-solo",
				createdByUserId: user.id,
			});
			await seedMembership(directory.db, {
				id: "mbr_solo",
				householdId: "hh_solo",
				userId: user.id,
				role: "owner",
			});

			const summary = await createAccountDeletionService({
				directory: directory.db,
				tursoPlatform: () =>
					tursoPlatform(
						jest.fn(async () => {
							throw new Error("delete failed");
						}),
					),
				deleteClerkUser: async () => undefined,
				anonymizeUser: async () => undefined,
			}).deleteAccount({ user });

			expect(summary.databasesNotDeleted).toEqual(["df-test-hh-solo"]);
			expect(errorSpy).toHaveBeenCalledWith(
				"Delete account Household database teardown failed",
				expect.objectContaining({ turso_db_name: "df-test-hh-solo" }),
			);
		} finally {
			errorSpy.mockRestore();
			await directory.close();
		}
	});

	it("throws Clerk failures after committing directory unwinding and PII removal", async () => {
		const directory = await createTestDirectoryDb();
		const anonymizeUser = jest.fn(async () => undefined);

		try {
			const user = await seedUser(directory.db, "usr_avery", "clerk_avery");
			await seedHousehold(directory.db, {
				id: "hh_solo",
				tursoDbName: "df-test-hh-solo",
				createdByUserId: user.id,
			});
			await seedMembership(directory.db, {
				id: "mbr_solo",
				householdId: "hh_solo",
				userId: user.id,
				role: "owner",
			});

			await expect(
				createAccountDeletionService({
					directory: directory.db,
					tursoPlatform: () => tursoPlatform(),
					deleteClerkUser: async () => {
						throw new Error("Clerk unavailable");
					},
					anonymizeUser,
				}).deleteAccount({ user }),
			).rejects.toThrow("Clerk unavailable");

			await expectHouseholdDeleted(directory.db, "hh_solo");
			await expectMembershipRemoved(directory.db, "mbr_solo");
			await expectUserMarkedDeleted(directory.db, {
				userId: user.id,
				directoryDeletedAt: expect.any(Number),
				clerkDeletedAt: null,
				anonymizedAt: null,
			});
			expect(anonymizeUser).not.toHaveBeenCalled();
		} finally {
			await directory.close();
		}
	});

	it("does not leave PII behind when final Clerk-link anonymization fails after Clerk deletion", async () => {
		const directory = await createTestDirectoryDb();
		const deleteClerkUser = jest.fn(async () => undefined);

		try {
			const user = await seedUser(directory.db, "usr_avery", "clerk_avery");
			await seedHousehold(directory.db, {
				id: "hh_solo",
				tursoDbName: "df-test-hh-solo",
				createdByUserId: user.id,
			});
			await seedMembership(directory.db, {
				id: "mbr_solo",
				householdId: "hh_solo",
				userId: user.id,
				role: "owner",
			});

			await expect(
				createAccountDeletionService({
					directory: directory.db,
					tursoPlatform: () => tursoPlatform(),
					deleteClerkUser,
					anonymizeUser: async () => {
						throw new Error("directory unavailable");
					},
				}).deleteAccount({ user }),
			).rejects.toThrow("directory unavailable");

			expect(deleteClerkUser).toHaveBeenCalledWith("clerk_avery");
			await expectUserMarkedDeleted(directory.db, {
				userId: user.id,
				directoryDeletedAt: expect.any(Number),
				clerkDeletedAt: expect.any(Number),
				anonymizedAt: null,
			});
		} finally {
			await directory.close();
		}
	});

	it("completes on rerun after a previous Clerk failure", async () => {
		const directory = await createTestDirectoryDb();
		const anonymizeUser = jest.fn(
			async (input: { userId: string; clerkUserId: string }) => {
				await directory.db
					.update(users)
					.set({ clerkUserId: `deleted_${input.userId}`, deletedAt: 2 })
					.where(eq(users.id, input.userId));
				await directory.db
					.update(deletedUserIdentities)
					.set({ anonymizedAt: 3 })
					.where(eq(deletedUserIdentities.userId, input.userId));
			},
		);

		try {
			const user = await seedUser(directory.db, "usr_avery", "clerk_avery");
			await seedHousehold(directory.db, {
				id: "hh_solo",
				tursoDbName: "df-test-hh-solo",
				createdByUserId: user.id,
			});
			await seedMembership(directory.db, {
				id: "mbr_solo",
				householdId: "hh_solo",
				userId: user.id,
				role: "owner",
			});

			await expect(
				createAccountDeletionService({
					directory: directory.db,
					tursoPlatform: () => tursoPlatform(),
					deleteClerkUser: async () => {
						throw new Error("Clerk unavailable");
					},
					anonymizeUser,
				}).deleteAccount({ user }),
			).rejects.toThrow("Clerk unavailable");

			const summary = await createAccountDeletionService({
				directory: directory.db,
				deleteClerkUser: async () => undefined,
				anonymizeUser,
			}).deleteAccount({ user });

			expect(summary).toEqual({
				leftHouseholdIds: [],
				deletedHouseholdIds: [],
				databasesNotDeleted: [],
			});
			const [storedUser] = await directory.db
				.select()
				.from(users)
				.where(eq(users.id, user.id));
			expect(storedUser).toMatchObject({
				clerkUserId: "deleted_usr_avery",
				deletedAt: 2,
			});
		} finally {
			await directory.close();
		}
	});
});

type DirectoryDb = Awaited<ReturnType<typeof createTestDirectoryDb>>["db"];

async function seedUser(
	directory: DirectoryDb,
	id: string,
	clerkUserId: string,
): Promise<User> {
	await directory.insert(users).values({
		id,
		clerkUserId,
		email: `${id}@example.com`,
		displayName: id,
		createdAt: 1,
		updatedAt: 1,
	});
	const [user] = await directory
		.select()
		.from(users)
		.where(eq(users.id, id))
		.limit(1);
	if (!user) throw new Error("Expected seeded User");
	return user;
}

async function seedHousehold(
	directory: DirectoryDb,
	input: { id: string; tursoDbName: string; createdByUserId: string },
) {
	await directory.insert(households).values({
		id: input.id,
		name: input.id,
		tursoDbName: input.tursoDbName,
		createdByUserId: input.createdByUserId,
		createdAt: 1,
	});
}

async function seedMembership(
	directory: DirectoryDb,
	input: {
		id: string;
		householdId: string;
		userId: string;
		role: "owner" | "member";
		joinedAt?: number;
	},
) {
	await directory.insert(memberships).values({
		id: input.id,
		householdId: input.householdId,
		userId: input.userId,
		role: input.role,
		joinedAt: input.joinedAt ?? 1,
	});
}

function invitation(input: {
	id: string;
	householdId: string;
	createdByUserId: string;
	acceptedAt?: number;
	acceptedByUserId?: string;
	revokedAt?: number;
}) {
	return {
		id: input.id,
		householdId: input.householdId,
		token: `${input.id}_token`,
		createdByUserId: input.createdByUserId,
		createdAt: 1,
		expiresAt: 9_999,
		acceptedAt: input.acceptedAt ?? null,
		acceptedByUserId: input.acceptedByUserId ?? null,
		revokedAt: input.revokedAt ?? null,
	};
}

function pushToken(input: {
	id: string;
	userId: string;
	expoPushToken: string;
	disabledAt?: number | null;
	updatedAt?: number;
}) {
	return {
		id: input.id,
		userId: input.userId,
		expoPushToken: input.expoPushToken,
		platform: "ios" as const,
		createdAt: 1,
		updatedAt: input.updatedAt ?? 1,
		disabledAt: input.disabledAt ?? null,
	};
}

function tursoPlatform(
	deleteDatabase: (databaseName: string) => Promise<void> = jest.fn(
		async () => undefined,
	),
): TursoPlatformClient {
	return {
		ensureDatabase: jest.fn(),
		getDatabase: jest.fn(),
		createDatabaseAuthToken: jest.fn(),
		deleteDatabase,
	};
}

async function expectHouseholdDeleted(
	directory: DirectoryDb,
	householdId: string,
) {
	const [household] = await directory
		.select()
		.from(households)
		.where(eq(households.id, householdId));
	expect(household.deletedAt).toEqual(expect.any(Number));
}

async function expectMembershipRemoved(
	directory: DirectoryDb,
	membershipId: string,
) {
	const [membership] = await directory
		.select()
		.from(memberships)
		.where(eq(memberships.id, membershipId));
	expect(membership.removedAt).toEqual(expect.any(Number));
}

async function expectUserMarkedDeleted(
	directory: DirectoryDb,
	expected: {
		userId: string;
		directoryDeletedAt: unknown;
		clerkDeletedAt: unknown;
		anonymizedAt: unknown;
	},
) {
	const [user] = await directory
		.select()
		.from(users)
		.where(eq(users.id, expected.userId));
	const [guard] = await directory
		.select()
		.from(deletedUserIdentities)
		.where(eq(deletedUserIdentities.userId, expected.userId));
	expect(user).toMatchObject({
		id: expected.userId,
		clerkUserId: "clerk_avery",
		email: null,
		firstName: null,
		lastName: null,
		displayName: null,
		activeHouseholdId: null,
		deletedAt: expect.any(Number),
	});
	expect(guard).toMatchObject({
		userId: expected.userId,
		directoryDeletedAt: expected.directoryDeletedAt,
		clerkDeletedAt: expected.clerkDeletedAt,
		anonymizedAt: expected.anonymizedAt,
	});
	expect(guard.clerkUserIdHash).not.toBe("clerk_avery");
}
