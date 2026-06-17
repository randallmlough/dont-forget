import { eq } from "drizzle-orm";

import {
	householdJoinCodes,
	households,
	memberships,
	users,
} from "@/db/schema/directory";
import {
	householdFixture,
	membershipFixture,
	PRIMARY_HOUSEHOLD_SEED,
	userFixture,
} from "@/db/server/fixtures";
import { createTestDirectoryDb } from "@/db/server/test";
import { createMemberService } from "@/lib/services/member/server";
import {
	createHouseholdService,
	HouseholdForbiddenError,
	HouseholdNameInvalidError,
	HouseholdNotFoundError,
	householdDatabaseName,
} from "./household-service";

describe("createHouseholdService", () => {
	it("creates a Household with a Turso-safe database name and marks provisioning complete", async () => {
		const directory = await createTestDirectoryDb();
		const service = createHouseholdService({
			directory: directory.db,
			generateJoinCode: () => "ABCDEFGH",
		});
		const dateNow = jest.spyOn(Date, "now");

		try {
			await directory.db.insert(users).values({
				id: "usr_avery",
				clerkUserId: "clerk_avery",
				displayName: "Avery Chen",
			});
			const [user] = await directory.db.select().from(users);
			if (!user) throw new Error("Expected test User");

			dateNow.mockReturnValueOnce(1_700_000_000_000);
			const household = await service.createOwnedHousehold({
				appEnv: "test",
				user,
				name: "Avery",
			});

			dateNow.mockReturnValueOnce(1_700_000_001_000);
			await service.markProvisioningCompleted(household.id);

			const [stored] = await directory.db
				.select()
				.from(households)
				.where(eq(households.id, household.id));
			const [joinCode] = await directory.db
				.select()
				.from(householdJoinCodes)
				.where(eq(householdJoinCodes.householdId, household.id));
			expect(stored).toMatchObject({
				id: expect.stringMatching(/^hh_/),
				name: "Avery",
				tursoDbName: householdDatabaseName("test", household.id),
				createdByUserId: "usr_avery",
				createdAt: 1_700_000_000_000,
				provisioningCompletedAt: 1_700_000_001_000,
			});
			expect(joinCode).toMatchObject({
				id: expect.stringMatching(/^hjc_/),
				householdId: household.id,
				code: "ABCDEFGH",
				createdByUserId: "usr_avery",
				createdAt: 1_700_000_000_000,
				disabledAt: null,
				replacedAt: null,
			});
		} finally {
			dateNow.mockRestore();
			await directory.close();
		}
	});

	it("renames a Household for an active Owner and trims the stored name", async () => {
		const directory = await createTestDirectoryDb();
		const analytics = analyticsFixture();
		const service = householdService(directory.db, analytics);

		try {
			await seedRenameScenario(directory.db);

			const renamed = await service.renameHousehold({
				householdId: PRIMARY_HOUSEHOLD_SEED.household.id,
				name: "  Lake House  ",
				requestedByUserId: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
			});

			const [stored] = await directory.db
				.select()
				.from(households)
				.where(eq(households.id, PRIMARY_HOUSEHOLD_SEED.household.id));
			expect(renamed.name).toBe("Lake House");
			expect(stored?.name).toBe("Lake House");
			expect(analytics.track).toHaveBeenCalledWith("household_renamed", {
				household_id: PRIMARY_HOUSEHOLD_SEED.household.id,
				requested_by_user_id: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
			});
		} finally {
			await directory.close();
		}
	});

	it("locks Household lifecycle inside the public rename command before policy reads", async () => {
		const events: string[] = [];
		let readCount = 0;
		const requester = {
			id: PRIMARY_HOUSEHOLD_SEED.memberships.avery.id,
			householdId: "hh_1",
			userId: "usr_owner",
			role: "owner" as const,
			joinedAt: 1,
			removedAt: null,
		};
		const household = {
			id: "hh_1",
			name: "River House",
			tursoDbName: "db-river-house",
			createdByUserId: "usr_owner",
			provisioningCompletedAt: 1,
			createdAt: 1,
			deletedAt: null,
		};
		type FakeSelectBuilder = {
			from: () => FakeSelectBuilder;
			where: () => FakeSelectBuilder;
			limit: () => Promise<(typeof requester | typeof household)[]>;
		};
		type FakeExecutor = {
			select: () => FakeSelectBuilder;
			update: () => {
				set: (values: Partial<typeof household>) => {
					where: () => {
						returning: () => Promise<(typeof household)[]>;
					};
				};
			};
			transaction: <T>(
				operation: (transaction: FakeExecutor) => Promise<T>,
			) => Promise<T>;
		};
		const selectBuilder: FakeSelectBuilder = {
			from: () => selectBuilder,
			where: () => selectBuilder,
			limit: async () => {
				events.push("read");
				readCount += 1;
				if (readCount === 1) return [requester];
				return [household];
			},
		};
		const executor: FakeExecutor = {
			select: () => selectBuilder,
			update: () => ({
				set: (values: Partial<typeof household>) => ({
					where: () => {
						const event =
							"id" in values && !("name" in values) ? "lock" : "mutate";
						events.push(event);
						return {
							returning: async () =>
								event === "mutate"
									? [{ ...household, name: values.name ?? household.name }]
									: [],
						};
					},
				}),
			}),
			transaction: async <T>(
				operation: (transaction: typeof executor) => Promise<T>,
			) => operation(executor),
		};
		const service = householdService(executor as unknown as TestDirectory);

		await service.renameHousehold({
			householdId: "hh_1",
			name: "Lake House",
			requestedByUserId: "usr_owner",
		});

		expect(events).toEqual(["lock", "read", "mutate"]);
	});

	it("rejects Household rename by a plain Member", async () => {
		const directory = await createTestDirectoryDb();
		const service = householdService(directory.db);

		try {
			await seedRenameScenario(directory.db);

			await expect(
				service.renameHousehold({
					householdId: PRIMARY_HOUSEHOLD_SEED.household.id,
					name: "Lake House",
					requestedByUserId: PRIMARY_HOUSEHOLD_SEED.users.blake.id,
				}),
			).rejects.toBeInstanceOf(HouseholdForbiddenError);
		} finally {
			await directory.close();
		}
	});

	it("rejects empty and overlong Household names", async () => {
		const directory = await createTestDirectoryDb();
		const service = householdService(directory.db);

		try {
			await seedRenameScenario(directory.db);

			await expect(
				service.renameHousehold({
					householdId: PRIMARY_HOUSEHOLD_SEED.household.id,
					name: "   ",
					requestedByUserId: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
				}),
			).rejects.toBeInstanceOf(HouseholdNameInvalidError);
			await expect(
				service.renameHousehold({
					householdId: PRIMARY_HOUSEHOLD_SEED.household.id,
					name: "a".repeat(81),
					requestedByUserId: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
				}),
			).rejects.toBeInstanceOf(HouseholdNameInvalidError);
		} finally {
			await directory.close();
		}
	});

	it("rejects unknown Household ids without revealing existence to non-Members", async () => {
		const directory = await createTestDirectoryDb();
		const service = householdService(directory.db);

		try {
			await seedRenameScenario(directory.db);

			await expect(
				service.renameHousehold({
					householdId: "hh_missing",
					name: "Lake House",
					requestedByUserId: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
				}),
			).rejects.toBeInstanceOf(HouseholdForbiddenError);
		} finally {
			await directory.close();
		}
	});

	it("rejects deleted Households for existing Owners", async () => {
		const directory = await createTestDirectoryDb();
		const service = householdService(directory.db);

		try {
			await seedRenameScenario(directory.db);
			await directory.db
				.update(households)
				.set({ deletedAt: PRIMARY_HOUSEHOLD_SEED.now + 1 })
				.where(eq(households.id, PRIMARY_HOUSEHOLD_SEED.household.id));

			await expect(
				service.renameHousehold({
					householdId: PRIMARY_HOUSEHOLD_SEED.household.id,
					name: "Lake House",
					requestedByUserId: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
				}),
			).rejects.toBeInstanceOf(HouseholdNotFoundError);
		} finally {
			await directory.close();
		}
	});

	it("deletes a Household by tombstoning it and removing active Memberships", async () => {
		const directory = await createTestDirectoryDb();
		const dateNow = jest.spyOn(Date, "now").mockReturnValue(1_700_000_100_000);

		try {
			await seedRenameScenario(directory.db);

			const result = await directory.db.transaction((tx) =>
				createHouseholdService({ directory: tx }).deleteHousehold({
					householdId: PRIMARY_HOUSEHOLD_SEED.household.id,
					requestedByUserId: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
				}),
			);

			const [storedHousehold] = await directory.db
				.select()
				.from(households)
				.where(eq(households.id, PRIMARY_HOUSEHOLD_SEED.household.id));
			const storedMemberships = await directory.db
				.select()
				.from(memberships)
				.where(
					eq(memberships.householdId, PRIMARY_HOUSEHOLD_SEED.household.id),
				);
			const associatedHouseholds = await createMemberService({
				directory: directory.db,
			}).listAssociatedHouseholds({
				userId: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
				activeHouseholdId: PRIMARY_HOUSEHOLD_SEED.household.id,
			});

			expect(result).toEqual({
				databaseDeleted: false,
				requiresDatabaseTeardown: true,
				tursoDbName: PRIMARY_HOUSEHOLD_SEED.household.tursoDbName,
			});
			expect(storedHousehold?.deletedAt).toBe(1_700_000_100_000);
			expect(storedMemberships).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						id: PRIMARY_HOUSEHOLD_SEED.memberships.avery.id,
						removedAt: 1_700_000_100_000,
					}),
					expect.objectContaining({
						id: PRIMARY_HOUSEHOLD_SEED.memberships.blake.id,
						removedAt: 1_700_000_100_000,
					}),
				]),
			);
			expect(associatedHouseholds).toEqual([]);
		} finally {
			dateNow.mockRestore();
			await directory.close();
		}
	});

	it("rejects Household deletion by plain Members", async () => {
		const directory = await createTestDirectoryDb();
		const service = createHouseholdService({ directory: directory.db });

		try {
			await seedRenameScenario(directory.db);

			await expect(
				service.deleteHousehold({
					householdId: PRIMARY_HOUSEHOLD_SEED.household.id,
					requestedByUserId: PRIMARY_HOUSEHOLD_SEED.users.blake.id,
				}),
			).rejects.toBeInstanceOf(HouseholdForbiddenError);
		} finally {
			await directory.close();
		}
	});

	it("rejects already-deleted Households during deletion", async () => {
		const directory = await createTestDirectoryDb();
		const service = createHouseholdService({ directory: directory.db });

		try {
			await seedRenameScenario(directory.db);
			await directory.db
				.update(households)
				.set({ deletedAt: PRIMARY_HOUSEHOLD_SEED.now + 1 })
				.where(eq(households.id, PRIMARY_HOUSEHOLD_SEED.household.id));

			await expect(
				service.deleteHousehold({
					householdId: PRIMARY_HOUSEHOLD_SEED.household.id,
					requestedByUserId: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
				}),
			).rejects.toBeInstanceOf(HouseholdNotFoundError);
		} finally {
			await directory.close();
		}
	});
});

type TestDirectory = Awaited<ReturnType<typeof createTestDirectoryDb>>["db"];

function analyticsFixture() {
	return { track: jest.fn() };
}

function householdService(
	directory: TestDirectory,
	analytics = analyticsFixture(),
) {
	return createHouseholdService({ directory, analytics });
}

async function seedRenameScenario(directory: TestDirectory) {
	await directory
		.insert(users)
		.values([
			userFixture(PRIMARY_HOUSEHOLD_SEED.users.avery),
			userFixture(PRIMARY_HOUSEHOLD_SEED.users.blake),
		]);
	await directory.insert(households).values(householdFixture());
	await directory.insert(memberships).values([
		membershipFixture(),
		membershipFixture({
			id: PRIMARY_HOUSEHOLD_SEED.memberships.blake.id,
			userId: PRIMARY_HOUSEHOLD_SEED.users.blake.id,
			role: "member",
			joinedAt: PRIMARY_HOUSEHOLD_SEED.now + 1,
		}),
	]);
}
