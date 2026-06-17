import { eq } from "drizzle-orm";
import { deletedUserIdentities, users } from "@/db/schema/directory";
import { createTestDirectoryDb } from "@/db/server/test";
import type { ServerUserRecord } from "@/lib/server/auth";
import { createUserService, DeletedUserError } from "./user-service";

describe("createUserService", () => {
	it("finds an active User for deletion by Clerk ID", async () => {
		const directory = await createTestDirectoryDb();
		const service = createUserService({ directory: directory.db });

		try {
			await directory.db.insert(users).values({
				id: "usr_avery",
				clerkUserId: "clerk_avery",
				email: "avery@example.com",
			});

			await expect(
				service.findUserForDeletionByClerkUserId("clerk_avery"),
			).resolves.toMatchObject({
				id: "usr_avery",
				clerkUserId: "clerk_avery",
				deletedAt: null,
			});
		} finally {
			await directory.close();
		}
	});

	it("finds a deleted User for deletion by the original Clerk ID", async () => {
		const directory = await createTestDirectoryDb();
		const service = createUserService({ directory: directory.db });

		try {
			await directory.db.insert(users).values({
				id: "usr_avery",
				clerkUserId: "clerk_avery",
				deletedAt: 1,
			});

			await expect(
				service.findUserForDeletionByClerkUserId("clerk_avery"),
			).resolves.toMatchObject({
				id: "usr_avery",
				clerkUserId: "clerk_avery",
				deletedAt: 1,
			});
		} finally {
			await directory.close();
		}
	});

	it("finds an anonymized deleted User through the deleted identity hash", async () => {
		const directory = await createTestDirectoryDb();
		const service = createUserService({ directory: directory.db });

		try {
			await directory.db.insert(users).values({
				id: "usr_avery",
				clerkUserId: "clerk_avery",
				deletedAt: 1,
			});
			await service.recordClerkDeleted({
				userId: "usr_avery",
				clerkUserId: "clerk_avery",
			});
			await service.anonymizeUser({
				userId: "usr_avery",
				clerkUserId: "clerk_avery",
			});

			await expect(
				service.findUserForDeletionByClerkUserId("clerk_avery"),
			).resolves.toMatchObject({
				id: "usr_avery",
				clerkUserId: "deleted_usr_avery",
				deletedAt: 1,
			});
		} finally {
			await directory.close();
		}
	});

	it("marks a deleted app User without removing the row or Clerk link", async () => {
		const directory = await createTestDirectoryDb();
		const service = createUserService({ directory: directory.db });
		const dateNow = jest.spyOn(Date, "now");

		try {
			await directory.db.insert(users).values({
				id: "usr_avery",
				clerkUserId: "clerk_avery",
				email: "avery@example.com",
				firstName: "Avery",
				lastName: "Chen",
				displayName: "Avery Chen",
				activeHouseholdId: null,
				createdAt: 1,
				updatedAt: 1,
			});
			dateNow.mockReturnValueOnce(1_700_000_002_000);

			await service.markUserDeleted({
				userId: "usr_avery",
				clerkUserId: "clerk_avery",
			});

			const [user] = await directory.db.select().from(users);
			const [guard] = await directory.db.select().from(deletedUserIdentities);
			expect(user).toMatchObject({
				id: "usr_avery",
				clerkUserId: "clerk_avery",
				email: null,
				firstName: null,
				lastName: null,
				displayName: null,
				activeHouseholdId: null,
				createdAt: 1,
				updatedAt: 1_700_000_002_000,
				deletedAt: 1_700_000_002_000,
			});
			expect(guard).toMatchObject({
				userId: "usr_avery",
				directoryDeletedAt: 1_700_000_002_000,
				clerkDeletedAt: null,
				anonymizedAt: null,
			});
			expect(guard.clerkUserIdHash).not.toBe("clerk_avery");
		} finally {
			dateNow.mockRestore();
			await directory.close();
		}
	});

	it("tombstones the Clerk link after external deletion succeeds", async () => {
		const directory = await createTestDirectoryDb();
		const service = createUserService({ directory: directory.db });
		const dateNow = jest.spyOn(Date, "now");

		try {
			await directory.db.insert(users).values({
				id: "usr_avery",
				clerkUserId: "clerk_avery",
				email: null,
				firstName: null,
				lastName: null,
				displayName: null,
				activeHouseholdId: null,
				createdAt: 1,
				updatedAt: 1,
				deletedAt: 1,
			});
			await service.markUserDeleted({
				userId: "usr_avery",
				clerkUserId: "clerk_avery",
			});
			dateNow.mockReturnValueOnce(1_700_000_003_000);

			await service.anonymizeUser({
				userId: "usr_avery",
				clerkUserId: "clerk_avery",
			});

			const [user] = await directory.db.select().from(users);
			const [guard] = await directory.db.select().from(deletedUserIdentities);
			expect(user).toMatchObject({
				id: "usr_avery",
				clerkUserId: "deleted_usr_avery",
				email: null,
				firstName: null,
				lastName: null,
				displayName: null,
				deletedAt: expect.any(Number),
				updatedAt: 1_700_000_003_000,
			});
			expect(guard).toMatchObject({
				userId: "usr_avery",
				directoryDeletedAt: expect.any(Number),
				anonymizedAt: 1_700_000_003_000,
			});
		} finally {
			dateNow.mockRestore();
			await directory.close();
		}
	});

	it("records Clerk deletion finalization without clearing the guard", async () => {
		const directory = await createTestDirectoryDb();
		const service = createUserService({ directory: directory.db });
		const dateNow = jest.spyOn(Date, "now");

		try {
			await directory.db.insert(users).values({
				id: "usr_avery",
				clerkUserId: "clerk_avery",
				deletedAt: 1,
			});
			dateNow.mockReturnValueOnce(1_700_000_004_000);

			await service.recordClerkDeleted({
				userId: "usr_avery",
				clerkUserId: "clerk_avery",
			});

			const [guard] = await directory.db.select().from(deletedUserIdentities);
			expect(guard).toMatchObject({
				userId: "usr_avery",
				clerkDeletedAt: 1_700_000_004_000,
				anonymizedAt: null,
			});
			expect(guard.clerkUserIdHash).not.toBe("clerk_avery");
		} finally {
			dateNow.mockRestore();
			await directory.close();
		}
	});

	it("rejects upserting a deleted User with the same Clerk identity", async () => {
		const directory = await createTestDirectoryDb();
		const service = createUserService({ directory: directory.db });

		try {
			await directory.db.insert(users).values({
				id: "usr_avery",
				clerkUserId: "clerk_avery",
				email: null,
				firstName: null,
				lastName: null,
				displayName: null,
				deletedAt: 1,
			});

			await expect(service.upsertUser(averyUserRecord)).rejects.toBeInstanceOf(
				DeletedUserError,
			);
			expect(await directory.db.select().from(users)).toHaveLength(1);
		} finally {
			await directory.close();
		}
	});

	it("rejects a stale Clerk identity after the User row Clerk link is tombstoned", async () => {
		const directory = await createTestDirectoryDb();
		const service = createUserService({ directory: directory.db });

		try {
			await directory.db.insert(users).values({
				id: "usr_avery",
				clerkUserId: "clerk_avery",
				email: "avery@example.com",
				firstName: "Avery",
				lastName: "Chen",
				displayName: "Avery Chen",
			});
			await service.markUserDeleted({
				userId: "usr_avery",
				clerkUserId: "clerk_avery",
			});
			await service.recordClerkDeleted({
				userId: "usr_avery",
				clerkUserId: "clerk_avery",
			});
			await service.anonymizeUser({
				userId: "usr_avery",
				clerkUserId: "clerk_avery",
			});

			await expect(service.upsertUser(averyUserRecord)).rejects.toBeInstanceOf(
				DeletedUserError,
			);
			expect(await directory.db.select().from(users)).toHaveLength(1);
			await expect(
				directory.db
					.select()
					.from(users)
					.where(eq(users.clerkUserId, "clerk_avery")),
			).resolves.toEqual([]);
		} finally {
			await directory.close();
		}
	});

	it("rejects upserts when deletion commits before the conflict update", async () => {
		const directory = await createTestDirectoryDb();
		let deleteBeforeConflictUpdate = true;
		const racingDirectory = new Proxy(directory.db, {
			get(target, prop, receiver) {
				if (prop === "insert") {
					return (table: Parameters<typeof directory.db.insert>[0]) => {
						const insertBuilder = directory.db.insert(table);
						if (table !== users) return insertBuilder;
						return {
							values(values: Parameters<typeof insertBuilder.values>[0]) {
								const valuesBuilder = insertBuilder.values(values);
								return {
									async onConflictDoUpdate(
										config: Parameters<
											typeof valuesBuilder.onConflictDoUpdate
										>[0],
									) {
										if (deleteBeforeConflictUpdate) {
											deleteBeforeConflictUpdate = false;
											await directory.db
												.update(users)
												.set({
													email: null,
													firstName: null,
													lastName: null,
													displayName: null,
													deletedAt: 1_700_000_002_000,
												})
												.where(eq(users.clerkUserId, "clerk_avery"));
										}
										return valuesBuilder.onConflictDoUpdate(config);
									},
								};
							},
						};
					};
				}
				const value = Reflect.get(target, prop, receiver);
				return typeof value === "function" ? value.bind(target) : value;
			},
		});
		const service = createUserService({ directory: racingDirectory });

		try {
			await directory.db.insert(users).values({
				id: "usr_avery",
				clerkUserId: "clerk_avery",
				email: "avery@example.com",
				firstName: "Avery",
				lastName: "Chen",
				displayName: "Avery Chen",
			});

			await expect(service.upsertUser(averyUserRecord)).rejects.toBeInstanceOf(
				DeletedUserError,
			);
			const [user] = await directory.db.select().from(users);
			expect(user).toMatchObject({
				email: null,
				firstName: null,
				lastName: null,
				displayName: null,
				deletedAt: 1_700_000_002_000,
			});
		} finally {
			await directory.close();
		}
	});

	it("creates and updates an app User from a Clerk User record", async () => {
		const directory = await createTestDirectoryDb();
		const service = createUserService({ directory: directory.db });
		const dateNow = jest.spyOn(Date, "now");

		try {
			dateNow.mockReturnValueOnce(1_700_000_000_000);
			const created = await service.upsertUser(averyUserRecord);

			dateNow.mockReturnValueOnce(1_700_000_001_000);
			const updated = await service.upsertUser({
				...averyUserRecord,
				displayName: "Avery Lough",
				lastName: "Lough",
			});

			expect(updated.id).toBe(created.id);
			expect(updated).toMatchObject({
				clerkUserId: "clerk_avery",
				email: "avery@example.com",
				displayName: "Avery Lough",
				lastName: "Lough",
				createdAt: 1_700_000_000_000,
				updatedAt: 1_700_000_001_000,
			});
			expect(await directory.db.select().from(users)).toHaveLength(1);
		} finally {
			dateNow.mockRestore();
			await directory.close();
		}
	});

	it("sets onboarding completion for a User", async () => {
		const directory = await createTestDirectoryDb();
		const service = createUserService({ directory: directory.db });
		jest.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);

		try {
			await directory.db.insert(users).values({
				id: "usr_avery",
				clerkUserId: "clerk_avery",
			});

			await service.completeOnboarding("usr_avery");

			const [user] = await directory.db
				.select()
				.from(users)
				.where(eq(users.id, "usr_avery"));
			expect(user.onboardingCompletedAt).toBe(1_700_000_000_000);
			expect(user.updatedAt).toBe(1_700_000_000_000);
		} finally {
			jest.restoreAllMocks();
			await directory.close();
		}
	});

	it("does not overwrite existing onboarding completion", async () => {
		const directory = await createTestDirectoryDb();
		const service = createUserService({ directory: directory.db });
		jest.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);

		try {
			await directory.db.insert(users).values({
				id: "usr_avery",
				clerkUserId: "clerk_avery",
				onboardingCompletedAt: 1_700_000_000_000,
				updatedAt: 1_700_000_000_000,
			});

			await service.completeOnboarding("usr_avery");

			const [user] = await directory.db
				.select()
				.from(users)
				.where(eq(users.id, "usr_avery"));
			expect(user.onboardingCompletedAt).toBe(1_700_000_000_000);
			expect(user.updatedAt).toBe(1_700_000_000_000);
		} finally {
			jest.restoreAllMocks();
			await directory.close();
		}
	});

	it("updates the Clerk User name and stores the returned app User", async () => {
		const directory = await createTestDirectoryDb();
		const updateClerkUserName = jest.fn(async () => ({
			clerkUserId: "clerk_avery",
			email: "avery@example.com",
			firstName: "Avery",
			lastName: "Lough",
			displayName: "Avery Lough",
		}));
		const service = createUserService({
			directory: directory.db,
			updateClerkUserName,
		});

		try {
			const user = await service.updateUserName({
				clerkUserId: "clerk_avery",
				firstName: "Avery",
				lastName: "Lough",
			});

			expect(updateClerkUserName).toHaveBeenCalledWith({
				clerkUserId: "clerk_avery",
				firstName: "Avery",
				lastName: "Lough",
			});
			expect(user).toMatchObject({
				clerkUserId: "clerk_avery",
				email: "avery@example.com",
				firstName: "Avery",
				lastName: "Lough",
				displayName: "Avery Lough",
			});
			expect(await directory.db.select().from(users)).toHaveLength(1);
		} finally {
			await directory.close();
		}
	});
});

const averyUserRecord: ServerUserRecord = {
	clerkUserId: "clerk_avery",
	email: "avery@example.com",
	firstName: "Avery",
	lastName: "Chen",
	displayName: "Avery Chen",
};
