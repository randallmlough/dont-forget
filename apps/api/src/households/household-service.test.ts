import {
	householdFixture,
	membershipFixture,
	PRIMARY_HOUSEHOLD_SEED,
	userFixture,
} from "@dont-forget/db/fixtures";
import {
	householdJoinCodes,
	households,
	memberships,
	users,
} from "@dont-forget/db/schema";
import { createTestDirectoryDb } from "@dont-forget/db/test";
import { eq } from "drizzle-orm";
import {
	createHouseholdService,
	HouseholdForbiddenError,
	HouseholdNameInvalidError,
	HouseholdNotFoundError,
} from "./household-service";

describe("createHouseholdService", () => {
	it("creates a Household with an initial join code", async () => {
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
				user,
				name: "Avery",
			});

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
				createdByUserId: "usr_avery",
				createdAt: 1_700_000_000_000,
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
