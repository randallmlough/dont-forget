import {
	householdJoinCodeAttemptFixture,
	PRIMARY_HOUSEHOLD_SEED,
	seedHouseholdJoinCodeAuditScenario,
	seedMultiHouseholdUserScenario,
	seedPrimaryHouseholdScenario,
} from "@/db/fixtures";
import { householdJoinCodeAttempts } from "@/db/schema/directory";
import {
	createTestDirectoryDb,
	createTestHouseholdDb,
	type TestDirectoryDb,
	type TestHouseholdDb,
} from "@/db/test";
import { createHouseholdJoinCodeService } from "@/lib/services/household/server";
import { createApiRequest, readJsonResponse } from "@/lib/test/api";
import { ApiUnauthorizedError, upsertAuthenticatedUser } from "../shared";
import {
	type HouseholdApiDeps,
	handleGetJoinCode,
	handleJoinByCode,
	handleListMembers,
	handlePreviewJoinCode,
	handleRegenerateJoinCode,
	handleSetJoinCodeEnabled,
	handleSwitchActiveHousehold,
} from "./handlers";

const now = PRIMARY_HOUSEHOLD_SEED.now + 100_000;

describe("Household API handlers", () => {
	it("requires auth for active Household switching", async () => {
		const directory = await createTestDirectoryDb();
		try {
			const response = await handleSwitchActiveHousehold(
				createApiRequest({
					method: "PATCH",
					body: { householdId: "hh_avery" },
				}),
				{
					directory: directory.db,
					authenticate: async () => {
						throw new ApiUnauthorizedError("Invalid Clerk session token");
					},
				},
			);

			await expect(readJsonResponse(response)).resolves.toMatchObject({
				status: 401,
				body: { error: "Invalid Clerk session token" },
			});
		} finally {
			await directory.close();
		}
	});

	it("switches active Household and rejects non-Member switches", async () => {
		const directory = await createTestDirectoryDb();

		try {
			const scenario = await seedMultiHouseholdUserScenario({
				directory: directory.db,
			});
			const switched = await readJsonResponse(
				await handleSwitchActiveHousehold(
					createApiRequest({
						method: "PATCH",
						body: { householdId: scenario.households.primary.id },
					}),
					householdDeps(directory, scenario.users.avery.clerkUserId),
				),
			);
			expect(switched).toMatchObject({
				status: 200,
				body: {
					activeHousehold: {
						householdId: scenario.households.primary.id,
						membershipRole: "owner",
					},
				},
			});

			const forbidden = await readJsonResponse(
				await handleSwitchActiveHousehold(
					createApiRequest({
						method: "PATCH",
						body: { householdId: scenario.households.primary.id },
					}),
					householdDeps(directory, scenario.users.blake.clerkUserId),
				),
			);
			expect(forbidden).toMatchObject({
				status: 403,
				body: { error: "Forbidden" },
			});
		} finally {
			await directory.close();
		}
	});

	it("lists Members for active Members only", async () => {
		const harness = await primaryHarness();
		try {
			const members = await readJsonResponse(
				await handleListMembers(
					createApiRequest(),
					{ householdId: harness.scenario.household.id },
					householdDeps(
						harness.directory,
						harness.scenario.users.avery.clerkUserId,
					),
				),
			);
			expect(members).toMatchObject({
				status: 200,
				body: {
					members: [
						{
							membershipId: harness.scenario.members.avery.id,
							userId: harness.scenario.users.avery.id,
							role: "owner",
						},
						{
							membershipId: harness.scenario.members.blake.id,
							userId: harness.scenario.users.blake.id,
							role: "member",
						},
					],
				},
			});

			const forbidden = await readJsonResponse(
				await handleListMembers(
					createApiRequest(),
					{ householdId: harness.scenario.household.id },
					householdDeps(harness.directory, "user_casey"),
				),
			);
			expect(forbidden.status).toBe(403);
		} finally {
			await harness.close();
		}
	});

	it("previews, joins, throttles, and manages Household Join Codes", async () => {
		const directory = await createTestDirectoryDb();
		const dateNow = jest.spyOn(Date, "now").mockReturnValue(now);

		try {
			const scenario = await seedHouseholdJoinCodeAuditScenario({
				directory: directory.db,
				now: PRIMARY_HOUSEHOLD_SEED.now,
			});
			const deps = householdDeps(directory, scenario.users.avery.clerkUserId);

			await expect(
				readJsonResponse(
					await handlePreviewJoinCode(
						createApiRequest({
							method: "GET",
							path: `/api/households/join-code/preview?code=${scenario.joinCodes.active.code}`,
						}),
						deps,
					),
				),
			).resolves.toMatchObject({
				status: 200,
				body: {
					available: true,
					householdName: scenario.household.name,
				},
			});
			await expect(
				readJsonResponse(
					await handlePreviewJoinCode(
						createApiRequest({
							method: "GET",
							path: `/api/households/join-code/preview?code=${scenario.joinCodes.disabled.code}`,
						}),
						deps,
					),
				),
			).resolves.toMatchObject({
				status: 404,
				body: { available: false },
			});

			const current = await readJsonResponse(
				await handleGetJoinCode(
					createApiRequest(),
					{ householdId: scenario.household.id },
					deps,
				),
			);
			expect(current).toMatchObject({
				status: 200,
				body: {
					joinCode: {
						enabled: true,
						code: scenario.joinCodes.active.code,
						joinUrl: `app://join/${scenario.joinCodes.active.code}`,
					},
				},
			});

			const disabled = await readJsonResponse(
				await handleSetJoinCodeEnabled(
					createApiRequest({ method: "PATCH", body: { enabled: false } }),
					{ householdId: scenario.household.id },
					deps,
				),
			);
			expect(disabled).toMatchObject({
				status: 200,
				body: {
					joinCode: { enabled: false, householdId: scenario.household.id },
				},
			});

			const regenerated = await readJsonResponse(
				await handleRegenerateJoinCode(
					createApiRequest({ method: "POST" }),
					{ householdId: scenario.household.id },
					deps,
				),
			);
			expect(regenerated).toMatchObject({
				status: 200,
				body: {
					joinCode: {
						enabled: true,
						code: "STAGE500",
						joinUrl: "app://join/STAGE500",
					},
				},
			});

			const joined = await readJsonResponse(
				await handleJoinByCode(
					createApiRequest({ body: { code: "STAGE500" } }),
					householdDeps(directory, "user_casey"),
				),
			);
			expect(joined).toMatchObject({
				status: 200,
				body: {
					householdId: scenario.household.id,
					membershipRole: "member",
					membershipCreated: true,
					activeHouseholdId: scenario.household.id,
				},
			});

			await directory.db.delete(householdJoinCodeAttempts);
			await directory.db.insert(householdJoinCodeAttempts).values(
				householdJoinCodeAttemptFixture({
					userId: scenario.users.blake.id,
					failedCount: 5,
					windowStartedAt: now,
					lastFailedAt: now,
				}),
			);
			const throttled = await readJsonResponse(
				await handleJoinByCode(
					createApiRequest({ body: { code: "NOPE0000" } }),
					householdDeps(directory, scenario.users.blake.clerkUserId),
				),
			);
			expect(throttled).toMatchObject({
				status: 429,
				body: { error: "Too many attempts. Try again later." },
			});
		} finally {
			dateNow.mockRestore();
			await directory.close();
		}
	});
});

function householdDeps(
	directory: TestDirectoryDb,
	clerkUserId: string,
): HouseholdApiDeps {
	return {
		directory: directory.db,
		authenticate: async (_request, db) =>
			upsertAuthenticatedUser(
				{
					clerkUserId,
					email: `${clerkUserId}@example.com`,
					firstName: "API",
					lastName: "User",
					displayName: "API User",
				},
				db,
			),
		createHouseholdJoinCodeService: (db) =>
			createHouseholdJoinCodeService({
				directory: db,
				buildJoinUrl: ({ code }) => `app://join/${code}`,
				generateCode: async () => "STAGE500",
				analytics: { track: jest.fn() },
			}),
	};
}

async function primaryHarness(): Promise<{
	directory: TestDirectoryDb;
	household: TestHouseholdDb;
	scenario: Awaited<ReturnType<typeof seedPrimaryHouseholdScenario>>;
	close: () => Promise<void>;
}> {
	const directory = await createTestDirectoryDb();
	const household = await createTestHouseholdDb();
	const scenario = await seedPrimaryHouseholdScenario({
		directory: directory.db,
		household: household.db,
	});
	return {
		directory,
		household,
		scenario,
		close: async () => {
			await household.close();
			await directory.close();
		},
	};
}
