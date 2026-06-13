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
		const service = createHouseholdService({ directory: directory.db });

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
		} finally {
			await directory.close();
		}
	});

	it("rejects Household rename by a plain Member", async () => {
		const directory = await createTestDirectoryDb();
		const service = createHouseholdService({ directory: directory.db });

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
		const service = createHouseholdService({ directory: directory.db });

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

	it("rejects unknown and deleted Households", async () => {
		const directory = await createTestDirectoryDb();
		const service = createHouseholdService({ directory: directory.db });

		try {
			await seedRenameScenario(directory.db);

			await expect(
				service.renameHousehold({
					householdId: "hh_missing",
					name: "Lake House",
					requestedByUserId: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
				}),
			).rejects.toBeInstanceOf(HouseholdNotFoundError);

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
});

type TestDirectory = Awaited<ReturnType<typeof createTestDirectoryDb>>["db"];

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
