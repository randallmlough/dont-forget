import { eq } from "drizzle-orm";
import { deletedUserIdentities, users } from "@/db/schema/directory";
import { createTestDirectoryDb } from "@/db/server/test";
import type { ServerUserProfile } from "@/lib/server/auth";
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

			await expect(service.upsertUser(averyProfile)).rejects.toBeInstanceOf(
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

			await expect(service.upsertUser(averyProfile)).rejects.toBeInstanceOf(
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

			await expect(service.upsertUser(averyProfile)).rejects.toBeInstanceOf(
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

	it("creates and updates an app User from a Clerk profile", async () => {
		const directory = await createTestDirectoryDb();
		const service = createUserService({ directory: directory.db });
		const dateNow = jest.spyOn(Date, "now");

		try {
			dateNow.mockReturnValueOnce(1_700_000_000_000);
			const created = await service.upsertUser(averyProfile);

			dateNow.mockReturnValueOnce(1_700_000_001_000);
			const updated = await service.upsertUser({
				...averyProfile,
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
});

const averyProfile: ServerUserProfile = {
	clerkUserId: "clerk_avery",
	email: "avery@example.com",
	firstName: "Avery",
	lastName: "Chen",
	displayName: "Avery Chen",
};
