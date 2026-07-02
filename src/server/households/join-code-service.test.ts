import { eq } from "drizzle-orm";
import {
	householdJoinCodes,
	householdJoinCodeUses,
	households,
	memberships,
	users,
} from "@/server/db/schema/postgres";
import type { DirectoryDb } from "@/server/db/client";
import {
	householdFixture,
	householdJoinCodeFixture,
	membershipFixture,
	PRIMARY_HOUSEHOLD_SEED,
	userFixture,
} from "@/server/db/fixtures";
import { createTestDirectoryDb } from "@/server/db/test";
import { JOIN_LINK_HOUSEHOLD_JOIN_CODE_SOURCE } from "@/lib/household-join-code-source";
import { deferred } from "@/lib/test/async";
import {
	createHouseholdJoinCodeService,
	HouseholdJoinCodeMembershipRequiredError,
	HouseholdJoinCodeUnavailableError,
} from "./join-code-service";

function createCodeGenerator(codes: string[]) {
	return jest.fn(async () => {
		const code = codes.shift();
		if (!code) throw new Error("No code left");
		return code;
	});
}

describe("createHouseholdJoinCodeService", () => {
	it("views, previews, and joins with the current Household Join Code", async () => {
		const directory = await createTestDirectoryDb();
		const dateNow = jest.spyOn(Date, "now").mockReturnValue(1_700_000_100_000);
		const analytics = { track: jest.fn() };

		try {
			await seedJoinCodeHousehold(directory.db);
			const service = createHouseholdJoinCodeService({
				directory: directory.db,
				buildJoinUrl: ({ code }) => `app://join/${code}`,
				analytics,
			});

			await expect(
				service.getCurrentJoinCode({
					householdId: PRIMARY_HOUSEHOLD_SEED.household.id,
					requestedByUserId: "usr_nonmember",
				}),
			).rejects.toBeInstanceOf(HouseholdJoinCodeMembershipRequiredError);
			await expect(
				service.getCurrentJoinCode({
					householdId: PRIMARY_HOUSEHOLD_SEED.household.id,
					requestedByUserId: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
				}),
			).resolves.toMatchObject({
				enabled: true,
				code: PRIMARY_HOUSEHOLD_SEED.joinCodes.active.code,
				joinUrl: `app://join/${PRIMARY_HOUSEHOLD_SEED.joinCodes.active.code}`,
			});
			await expect(service.previewJoinCode("abcd-efgh")).resolves.toEqual({
				available: true,
				householdName: PRIMARY_HOUSEHOLD_SEED.household.name,
			});

			const joined = await service.joinByCode({
				code: "ABCD EFGH",
				userId: PRIMARY_HOUSEHOLD_SEED.users.blake.id,
				source: JOIN_LINK_HOUSEHOLD_JOIN_CODE_SOURCE,
			});
			const existingMemberJoin = await service.joinByCode({
				code: "ABCDEFGH",
				userId: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
			});

			expect(joined).toMatchObject({
				householdJoinCodeId: PRIMARY_HOUSEHOLD_SEED.joinCodes.active.id,
				householdId: PRIMARY_HOUSEHOLD_SEED.household.id,
				membershipRole: "member",
				membershipCreated: true,
				activeHouseholdId: PRIMARY_HOUSEHOLD_SEED.household.id,
			});
			expect(existingMemberJoin).toMatchObject({
				membershipId: PRIMARY_HOUSEHOLD_SEED.memberships.avery.id,
				membershipRole: "owner",
				membershipCreated: false,
			});
			await expect(
				directory.db.select().from(memberships),
			).resolves.toHaveLength(2);
			await expect(
				directory.db.select().from(householdJoinCodeUses),
			).resolves.toHaveLength(2);
			expect(analytics.track).toHaveBeenCalledWith("household_join_code_used", {
				household_id: PRIMARY_HOUSEHOLD_SEED.household.id,
				user_id: PRIMARY_HOUSEHOLD_SEED.users.blake.id,
				membership_created: true,
				source: JOIN_LINK_HOUSEHOLD_JOIN_CODE_SOURCE,
			});
		} finally {
			dateNow.mockRestore();
			await directory.close();
		}
	});

	it("regenerates, disables, and enables Household Join Codes with collision retry", async () => {
		const directory = await createTestDirectoryDb();
		const dateNow = jest.spyOn(Date, "now").mockReturnValue(1_700_000_200_000);
		const analytics = { track: jest.fn() };

		try {
			await seedJoinCodeHousehold(directory.db);
			await directory.db.insert(households).values(
				householdFixture({
					id: "hh_unused",
					name: "Unused",
				}),
			);
			await directory.db.insert(householdJoinCodes).values(
				householdJoinCodeFixture({
					id: PRIMARY_HOUSEHOLD_SEED.joinCodes.replaced.id,
					code: "ZZZZZZZZ",
					householdId: "hh_unused",
					createdByUserId: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
					replacedAt: 1,
				}),
			);
			const service = createHouseholdJoinCodeService({
				directory: directory.db,
				buildJoinUrl: testJoinUrl,
				generateCode: createCodeGenerator(["ZZZZZZZZ", "HJKLMNPQ", "RSTUVWXY"]),
				analytics,
			});

			const regenerated = await service.regenerateJoinCode({
				householdId: PRIMARY_HOUSEHOLD_SEED.household.id,
				requestedByUserId: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
			});
			const disabled = await service.disableJoinCode({
				householdId: PRIMARY_HOUSEHOLD_SEED.household.id,
				requestedByUserId: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
			});
			const enabled = await service.enableJoinCode({
				householdId: PRIMARY_HOUSEHOLD_SEED.household.id,
				requestedByUserId: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
			});

			expect(regenerated).toMatchObject({ enabled: true, code: "HJKLMNPQ" });
			expect(disabled).toEqual({
				enabled: false,
				householdId: PRIMARY_HOUSEHOLD_SEED.household.id,
			});
			expect(enabled).toMatchObject({ enabled: true, code: "RSTUVWXY" });
			await expect(service.previewJoinCode("ABCDEFGH")).resolves.toEqual({
				available: false,
			});
			await expect(service.previewJoinCode("HJKLMNPQ")).resolves.toEqual({
				available: false,
			});
			await expect(service.previewJoinCode("RSTUVWXY")).resolves.toEqual({
				available: true,
				householdName: PRIMARY_HOUSEHOLD_SEED.household.name,
			});
			expect(analytics.track).toHaveBeenCalledWith(
				"household_join_code_regenerated",
				{
					household_id: PRIMARY_HOUSEHOLD_SEED.household.id,
					requested_by_user_id: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
				},
			);
			expect(analytics.track).toHaveBeenCalledWith(
				"household_join_code_disabled",
				{
					household_id: PRIMARY_HOUSEHOLD_SEED.household.id,
					requested_by_user_id: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
				},
			);
			expect(analytics.track).toHaveBeenCalledWith(
				"household_join_code_enabled",
				{
					household_id: PRIMARY_HOUSEHOLD_SEED.household.id,
					requested_by_user_id: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
				},
			);
		} finally {
			dateNow.mockRestore();
			await directory.close();
		}
	});

	it("returns unavailable for invalid codes without blocking a later successful join", async () => {
		const directory = await createTestDirectoryDb();
		const dateNow = jest.spyOn(Date, "now").mockReturnValue(1_700_000_300_000);

		try {
			await seedJoinCodeHousehold(directory.db);
			const service = createHouseholdJoinCodeService({
				directory: directory.db,
				buildJoinUrl: testJoinUrl,
				analytics: { track: jest.fn() },
			});

			await expect(
				service.joinByCode({
					code: "NOPE1234",
					userId: PRIMARY_HOUSEHOLD_SEED.users.blake.id,
				}),
			).rejects.toBeInstanceOf(HouseholdJoinCodeUnavailableError);

			await expect(
				service.joinByCode({
					code: PRIMARY_HOUSEHOLD_SEED.joinCodes.active.code,
					userId: PRIMARY_HOUSEHOLD_SEED.users.blake.id,
				}),
			).resolves.toMatchObject({ membershipCreated: true });
		} finally {
			dateNow.mockRestore();
			await directory.close();
		}
	});

	// NOTE: the "concurrent"/"race" tests below run against a single PGlite
	// connection whose worker serializes transactions, so they exercise 23505
	// unique-conflict handling against the partial unique index — not true
	// DB-level concurrent interleaving of two in-flight transactions.
	it("lets two different Users use the same active reusable code concurrently", async () => {
		const directory = await createTestDirectoryDb();
		const dateNow = jest.spyOn(Date, "now").mockReturnValue(1_700_000_400_000);

		try {
			await seedJoinCodeHousehold(directory.db, {
				includeBlakeMembership: false,
				includeExtraUser: true,
			});
			const firstService = createHouseholdJoinCodeService({
				directory: directory.db,
				buildJoinUrl: testJoinUrl,
				analytics: { track: jest.fn() },
			});
			const secondService = createHouseholdJoinCodeService({
				directory: directory.db,
				buildJoinUrl: testJoinUrl,
				analytics: { track: jest.fn() },
			});

			await Promise.all([
				firstService.joinByCode({
					code: PRIMARY_HOUSEHOLD_SEED.joinCodes.active.code,
					userId: PRIMARY_HOUSEHOLD_SEED.users.blake.id,
				}),
				secondService.joinByCode({
					code: PRIMARY_HOUSEHOLD_SEED.joinCodes.active.code,
					userId: "usr_casey",
				}),
			]);

			const householdMemberships = await directory.db
				.select()
				.from(memberships)
				.where(
					eq(memberships.householdId, PRIMARY_HOUSEHOLD_SEED.household.id),
				);
			const uses = await directory.db.select().from(householdJoinCodeUses);

			expect(householdMemberships).toHaveLength(3);
			expect(uses).toHaveLength(2);
		} finally {
			dateNow.mockRestore();
			await directory.close();
		}
	}, 15_000);

	it("returns the current code when concurrent enable requests race", async () => {
		const directory = await createTestDirectoryDb();
		const dateNow = jest.spyOn(Date, "now").mockReturnValue(1_700_000_500_000);
		const releaseGenerators = deferred<void>();
		const firstGeneratorReady = deferred<void>();
		const secondGeneratorReady = deferred<void>();

		try {
			await seedJoinCodeHousehold(directory.db);
			await directory.db
				.update(householdJoinCodes)
				.set({
					disabledAt: 1_700_000_490_000,
					disabledByUserId: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
				})
				.where(
					eq(householdJoinCodes.id, PRIMARY_HOUSEHOLD_SEED.joinCodes.active.id),
				);
			const firstService = createHouseholdJoinCodeService({
				directory: directory.db,
				buildJoinUrl: testJoinUrl,
				generateCode: jest.fn(async () => {
					firstGeneratorReady.resolve();
					await releaseGenerators.promise;
					return "HJKLMNPQ";
				}),
				analytics: { track: jest.fn() },
			});
			const secondService = createHouseholdJoinCodeService({
				directory: directory.db,
				buildJoinUrl: testJoinUrl,
				generateCode: jest.fn(async () => {
					secondGeneratorReady.resolve();
					await releaseGenerators.promise;
					return "RSTUVWXY";
				}),
				analytics: { track: jest.fn() },
			});

			const firstEnable = firstService.enableJoinCode({
				householdId: PRIMARY_HOUSEHOLD_SEED.household.id,
				requestedByUserId: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
			});
			const secondEnable = secondService.enableJoinCode({
				householdId: PRIMARY_HOUSEHOLD_SEED.household.id,
				requestedByUserId: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
			});

			await Promise.all([
				firstGeneratorReady.promise,
				secondGeneratorReady.promise,
			]);
			releaseGenerators.resolve();

			const enabled = await Promise.all([firstEnable, secondEnable]);
			expect(enabled[0]).toMatchObject({ enabled: true });
			expect(enabled[1]).toMatchObject({ enabled: true });
			if (!enabled[0].enabled || !enabled[1].enabled) {
				throw new Error(
					"Expected both enable requests to return an active code",
				);
			}
			expect(enabled[0].code).toBe(enabled[1].code);

			const currentCodes = await directory.db
				.select()
				.from(householdJoinCodes)
				.where(
					eq(
						householdJoinCodes.householdId,
						PRIMARY_HOUSEHOLD_SEED.household.id,
					),
				);
			expect(
				currentCodes.filter((code) => !code.disabledAt && !code.replacedAt),
			).toHaveLength(1);
		} finally {
			dateNow.mockRestore();
			await directory.close();
		}
	}, 15_000);

	it("leaves no active code when disable races with regeneration", async () => {
		const directory = await createTestDirectoryDb();
		const dateNow = jest.spyOn(Date, "now").mockReturnValue(1_700_000_600_000);
		const generatorStarted = deferred<void>();
		const releaseGenerator = deferred<void>();

		try {
			await seedJoinCodeHousehold(directory.db);
			const regeneratingService = createHouseholdJoinCodeService({
				directory: directory.db,
				buildJoinUrl: testJoinUrl,
				generateCode: jest.fn(async () => {
					generatorStarted.resolve();
					await releaseGenerator.promise;
					return "HJKLMNPQ";
				}),
				analytics: { track: jest.fn() },
			});
			const disablingService = createHouseholdJoinCodeService({
				directory: directory.db,
				buildJoinUrl: testJoinUrl,
				analytics: { track: jest.fn() },
			});

			const regenerate = regeneratingService.regenerateJoinCode({
				householdId: PRIMARY_HOUSEHOLD_SEED.household.id,
				requestedByUserId: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
			});
			await generatorStarted.promise;

			const disable = disablingService.disableJoinCode({
				householdId: PRIMARY_HOUSEHOLD_SEED.household.id,
				requestedByUserId: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
			});
			await new Promise((resolve) => setTimeout(resolve, 20));
			releaseGenerator.resolve();

			await regenerate;
			await expect(disable).resolves.toEqual({
				enabled: false,
				householdId: PRIMARY_HOUSEHOLD_SEED.household.id,
			});

			const currentCodes = await directory.db
				.select()
				.from(householdJoinCodes)
				.where(
					eq(
						householdJoinCodes.householdId,
						PRIMARY_HOUSEHOLD_SEED.household.id,
					),
				);
			expect(
				currentCodes.filter((code) => !code.disabledAt && !code.replacedAt),
			).toHaveLength(0);
			await expect(
				disablingService.previewJoinCode("HJKLMNPQ"),
			).resolves.toEqual({
				available: false,
			});
		} finally {
			dateNow.mockRestore();
			await directory.close();
		}
	}, 15_000);
});

async function seedJoinCodeHousehold(
	directory: DirectoryDb,
	options: {
		includeBlakeMembership?: boolean;
		includeExtraUser?: boolean;
	} = {},
) {
	await directory.insert(users).values([
		userFixture({ ...PRIMARY_HOUSEHOLD_SEED.users.avery }),
		userFixture({
			...PRIMARY_HOUSEHOLD_SEED.users.blake,
			activeHouseholdId: null,
		}),
		...(options.includeExtraUser
			? [
					userFixture({
						id: "usr_casey",
						clerkUserId: "user_casey",
						email: "casey@example.com",
						firstName: "Casey",
						lastName: "Morgan",
						displayName: "Casey Morgan",
						activeHouseholdId: null,
					}),
				]
			: []),
	]);
	await directory.insert(households).values(householdFixture());
	await directory.insert(memberships).values([
		membershipFixture({
			id: PRIMARY_HOUSEHOLD_SEED.memberships.avery.id,
			userId: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
			role: "owner",
		}),
		...(options.includeBlakeMembership
			? [
					membershipFixture({
						id: PRIMARY_HOUSEHOLD_SEED.memberships.blake.id,
						userId: PRIMARY_HOUSEHOLD_SEED.users.blake.id,
						role: "member",
						joinedAt: PRIMARY_HOUSEHOLD_SEED.now + 1,
					}),
				]
			: []),
	]);
	await directory.insert(householdJoinCodes).values(householdJoinCodeFixture());
}

function testJoinUrl(input: { code: string }): string {
	return `app://join/${input.code}`;
}
