import { eq } from "drizzle-orm";
import { households, memberships, users } from "@/server/db/schema/postgres";
import {
	membershipFixture,
	PRIMARY_HOUSEHOLD_SEED,
	seedHouseholdJoinCodeAuditScenario,
	seedMultiHouseholdUserScenario,
	seedPrimaryHouseholdScenario,
	userFixture,
} from "@/server/db/fixtures";
import { createTestDirectoryDb, type TestDirectoryDb } from "@/server/db/test";
import { JOIN_LINK_HOUSEHOLD_JOIN_CODE_SOURCE } from "@/lib/household-join-code-source";
import {
	createHouseholdJoinCodeService,
	type HouseholdJoinCodeService,
} from "@/server/households/join-code-service";
import { INITIAL_HOUSEHOLD_NAMES } from "@/server/households/initial-household-name";
import { createApiRequest, readJsonResponse } from "@/lib/test/api";
import { ApiUnauthorizedError, upsertAuthenticatedUser } from "@/server/http";
import {
	type HouseholdApiDeps,
	handleChangeMemberRole,
	handleCreateHousehold,
	handleGetJoinCode,
	handleJoinByCode,
	handleLeaveHousehold,
	handleListMembers,
	handlePreviewJoinCode,
	handleRegenerateJoinCode,
	handleRemoveMember,
	handleRenameHousehold,
	handleSetJoinCodeEnabled,
	handleSwitchActiveHousehold,
} from "./api";

jest.mock("@clerk/backend", () => ({
	createClerkClient: jest.fn(),
	verifyToken: jest.fn(),
}));

const now = PRIMARY_HOUSEHOLD_SEED.now + 100_000;

describe("Household API handlers", () => {
	it("requires auth for Household creation", async () => {
		const directory = await createTestDirectoryDb();
		try {
			const response = await handleCreateHousehold(
				createApiRequest({
					method: "POST",
					body: { name: "Lake House" },
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

	it("rejects invalid Household creation names", async () => {
		const directory = await createTestDirectoryDb();
		try {
			const response = await handleCreateHousehold(
				createApiRequest({
					method: "POST",
					body: { name: "a".repeat(81) },
				}),
				householdDeps(directory, "user_avery"),
			);

			await expect(readJsonResponse(response)).resolves.toMatchObject({
				status: 400,
				body: { error: "Household name must be 80 characters or fewer." },
			});
		} finally {
			await directory.close();
		}
	});

	it("creates a provisioned Household with an Owner Membership and sets it active", async () => {
		const directory = await createTestDirectoryDb();
		const dateNow = jest.spyOn(Date, "now").mockReturnValue(now);
		try {
			const response = await handleCreateHousehold(
				createApiRequest({
					method: "POST",
					body: { name: "  Lake House  " },
				}),
				householdDeps(directory, "user_avery"),
			);
			const created = await readJsonResponse(response);
			expect(created).toMatchObject({
				status: 201,
				body: {
					household: {
						id: expect.stringMatching(/^hh_/),
						name: "Lake House",
					},
				},
			});
			const householdId = (
				created.body as { household: { id: string; name: string } }
			).household.id;
			const [storedHousehold] = await directory.db
				.select()
				.from(households)
				.where(eq(households.id, householdId));
			const [storedMembership] = await directory.db
				.select()
				.from(memberships)
				.where(eq(memberships.householdId, householdId));
			const [storedUser] = await directory.db
				.select()
				.from(users)
				.where(eq(users.clerkUserId, "user_avery"));

			expect(storedHousehold).toMatchObject({
				id: householdId,
				name: "Lake House",
				createdByUserId: storedUser?.id,
			});
			expect(storedMembership).toMatchObject({
				householdId,
				userId: storedUser?.id,
				role: "owner",
				removedAt: null,
			});
			expect(storedUser?.activeHouseholdId).toBe(householdId);
		} finally {
			dateNow.mockRestore();
			await directory.close();
		}
	});

	it("uses an initial Household name when creation body has no name", async () => {
		const directory = await createTestDirectoryDb();
		const random = jest.spyOn(Math, "random").mockReturnValue(0);
		try {
			const response = await handleCreateHousehold(
				createApiRequest({
					method: "POST",
					body: {},
				}),
				householdDeps(directory, "user_avery"),
			);

			await expect(readJsonResponse(response)).resolves.toMatchObject({
				status: 201,
				body: {
					household: {
						name: INITIAL_HOUSEHOLD_NAMES[0],
					},
				},
			});
		} finally {
			random.mockRestore();
			await directory.close();
		}
	});

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

	it("requires auth for Household rename", async () => {
		const directory = await createTestDirectoryDb();
		try {
			const response = await handleRename({
				householdId: "hh_avery",
				deps: {
					directory: directory.db,
					authenticate: async () => {
						throw new ApiUnauthorizedError("Invalid Clerk session token");
					},
				},
			});

			await expect(readJsonResponse(response)).resolves.toMatchObject({
				status: 401,
				body: { error: "Invalid Clerk session token" },
			});
		} finally {
			await directory.close();
		}
	});

	it("rejects Household rename by plain Members", async () => {
		const harness = await primaryHarness();
		try {
			const response = await handleRename({
				householdId: harness.scenario.household.id,
				deps: householdDeps(
					harness.directory,
					harness.scenario.users.blake.clerkUserId,
				),
			});

			await expect(readJsonResponse(response)).resolves.toMatchObject({
				status: 403,
				body: { error: "Forbidden" },
			});
		} finally {
			await harness.close();
		}
	});

	it("does not reveal Household existence to non-Members during rename", async () => {
		const harness = await primaryHarness();
		try {
			const existing = await readJsonResponse(
				await handleRename({
					householdId: harness.scenario.household.id,
					deps: householdDeps(harness.directory, "user_casey"),
				}),
			);
			const missing = await readJsonResponse(
				await handleRename({
					householdId: "hh_missing",
					deps: householdDeps(harness.directory, "user_casey"),
				}),
			);

			expect(existing).toMatchObject({
				status: 403,
				body: { error: "Forbidden" },
			});
			expect(missing).toMatchObject({
				status: 403,
				body: { error: "Forbidden" },
			});
		} finally {
			await harness.close();
		}
	});

	it("rejects invalid Household rename names", async () => {
		const harness = await primaryHarness();
		try {
			const response = await handleRename({
				householdId: harness.scenario.household.id,
				name: "a".repeat(81),
				deps: householdDeps(
					harness.directory,
					harness.scenario.users.avery.clerkUserId,
				),
			});

			await expect(readJsonResponse(response)).resolves.toMatchObject({
				status: 400,
				body: { error: "Household name must be 80 characters or fewer." },
			});
		} finally {
			await harness.close();
		}
	});

	it("renames Households and returns the updated name", async () => {
		const harness = await primaryHarness();
		try {
			const response = await handleRename({
				householdId: harness.scenario.household.id,
				name: "  Lake House  ",
				deps: householdDeps(
					harness.directory,
					harness.scenario.users.avery.clerkUserId,
				),
			});

			await expect(readJsonResponse(response)).resolves.toMatchObject({
				status: 200,
				body: {
					household: {
						id: harness.scenario.household.id,
						name: "Lake House",
					},
				},
			});
		} finally {
			await harness.close();
		}
	});

	it("requires auth for Member management", async () => {
		const directory = await createTestDirectoryDb();
		try {
			const response = await handleRemoveMember(
				createApiRequest({ method: "DELETE" }),
				{ householdId: "hh_avery", membershipId: "mbr_blake" },
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

	it("rejects Member management by non-Members and plain Members", async () => {
		const harness = await primaryHarness();
		try {
			const nonMember = await readJsonResponse(
				await handleRemoveMember(
					createApiRequest({ method: "DELETE" }),
					{
						householdId: harness.scenario.household.id,
						membershipId: harness.scenario.members.blake.id,
					},
					householdDeps(harness.directory, "user_casey"),
				),
			);
			const plainMemberRemoval = await readJsonResponse(
				await handleRemoveMember(
					createApiRequest({ method: "DELETE" }),
					{
						householdId: harness.scenario.household.id,
						membershipId: harness.scenario.members.avery.id,
					},
					householdDeps(
						harness.directory,
						harness.scenario.users.blake.clerkUserId,
					),
				),
			);
			const plainMemberRoleChange = await readJsonResponse(
				await handleChangeMemberRole(
					createApiRequest({ method: "PATCH", body: { role: "owner" } }),
					{
						householdId: harness.scenario.household.id,
						membershipId: harness.scenario.members.blake.id,
					},
					householdDeps(
						harness.directory,
						harness.scenario.users.blake.clerkUserId,
					),
				),
			);

			expect(nonMember.status).toBe(403);
			expect(plainMemberRemoval.status).toBe(403);
			expect(plainMemberRoleChange.status).toBe(403);
		} finally {
			await harness.close();
		}
	});

	it("maps unknown Memberships and invalid Owner transitions", async () => {
		const harness = await primaryHarness();
		try {
			const missing = await readJsonResponse(
				await handleRemoveMember(
					createApiRequest({ method: "DELETE" }),
					{
						householdId: harness.scenario.household.id,
						membershipId: "mbr_missing",
					},
					householdDeps(
						harness.directory,
						harness.scenario.users.avery.clerkUserId,
					),
				),
			);
			const lastOwner = await readJsonResponse(
				await handleChangeMemberRole(
					createApiRequest({ method: "PATCH", body: { role: "member" } }),
					{
						householdId: harness.scenario.household.id,
						membershipId: harness.scenario.members.avery.id,
					},
					householdDeps(
						harness.directory,
						harness.scenario.users.avery.clerkUserId,
					),
				),
			);
			await harness.directory.db
				.update(memberships)
				.set({ removedAt: now })
				.where(eq(memberships.id, harness.scenario.members.blake.id));
			const soleMemberLeave = await readJsonResponse(
				await handleLeaveHousehold(
					createApiRequest({ method: "POST" }),
					{ householdId: harness.scenario.household.id },
					householdDeps(
						harness.directory,
						harness.scenario.users.avery.clerkUserId,
					),
				),
			);

			expect(missing).toMatchObject({
				status: 404,
				body: { error: "Member not found." },
			});
			expect(lastOwner).toMatchObject({
				status: 409,
				body: { error: "A Household must have at least one Owner." },
			});
			expect(soleMemberLeave).toMatchObject({
				status: 409,
				body: { error: "The only Member cannot leave the Household." },
			});
		} finally {
			await harness.close();
		}
	});

	it("removes Members, changes roles, and leaves Households", async () => {
		const harness = await primaryHarness();
		try {
			await addCameronMember(harness);
			const removed = await readJsonResponse(
				await handleRemoveMember(
					createApiRequest({ method: "DELETE" }),
					{
						householdId: harness.scenario.household.id,
						membershipId: harness.scenario.members.blake.id,
					},
					householdDeps(
						harness.directory,
						harness.scenario.users.avery.clerkUserId,
					),
				),
			);
			const roleChanged = await readJsonResponse(
				await handleChangeMemberRole(
					createApiRequest({ method: "PATCH", body: { role: "owner" } }),
					{
						householdId: harness.scenario.household.id,
						membershipId: PRIMARY_HOUSEHOLD_SEED.memberships.cameron.id,
					},
					householdDeps(
						harness.directory,
						harness.scenario.users.avery.clerkUserId,
					),
				),
			);
			const left = await readJsonResponse(
				await handleLeaveHousehold(
					createApiRequest({ method: "POST" }),
					{ householdId: harness.scenario.household.id },
					householdDeps(
						harness.directory,
						harness.scenario.users.avery.clerkUserId,
					),
				),
			);

			expect(removed).toMatchObject({
				status: 200,
				body: { removed: true },
			});
			expect(roleChanged).toMatchObject({
				status: 200,
				body: {
					member: {
						membershipId: PRIMARY_HOUSEHOLD_SEED.memberships.cameron.id,
						role: "owner",
					},
				},
			});
			expect(left).toMatchObject({
				status: 200,
				body: { left: true, promotedMembershipId: null },
			});
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
						{
							directory: directory.db,
							authenticate: async () => {
								throw new ApiUnauthorizedError("Missing bearer token");
							},
						},
					),
				),
			).resolves.toMatchObject({
				status: 401,
				body: { error: "Missing bearer token" },
			});
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
			for (const code of [scenario.joinCodes.replaced.code, "NOPE0000"]) {
				await expect(
					readJsonResponse(
						await handlePreviewJoinCode(
							createApiRequest({
								method: "GET",
								path: `/api/households/join-code/preview?code=${code}`,
							}),
							deps,
						),
					),
				).resolves.toMatchObject({
					status: 404,
					body: { available: false },
				});
			}

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

			const unavailableMissingJoin = await readJsonResponse(
				await handleJoinByCode(
					createApiRequest({ body: { code: "NOPE0000" } }),
					householdDeps(directory, scenario.users.blake.clerkUserId),
				),
			);
			expect(unavailableMissingJoin).toMatchObject({
				status: 404,
				body: { error: "This Household code is not available." },
			});
			const unavailableJoin = await readJsonResponse(
				await handleJoinByCode(
					createApiRequest({
						body: { code: scenario.joinCodes.disabled.code },
					}),
					householdDeps(directory, scenario.users.cameron.clerkUserId),
				),
			);
			expect(unavailableJoin).toMatchObject({
				status: 404,
				body: { error: "This Household code is not available." },
			});
		} finally {
			dateNow.mockRestore();
			await directory.close();
		}
	});

	it("passes constrained Household Join Code sources to the service", async () => {
		const directory = await createTestDirectoryDb();
		const joinByCode = jest.fn(async () => ({
			householdJoinCodeId: "hjc_1",
			householdId: "hh_1",
			membershipId: "mbr_1",
			membershipRole: "member" as const,
			membershipCreated: true,
			useId: "hjcu_1",
			activeHouseholdId: "hh_1",
		}));
		const service: HouseholdJoinCodeService = {
			getCurrentJoinCode: jest.fn(),
			previewJoinCode: jest.fn(),
			joinByCode,
			regenerateJoinCode: jest.fn(),
			disableJoinCode: jest.fn(),
			enableJoinCode: jest.fn(),
		};
		const deps: HouseholdApiDeps = {
			directory: directory.db,
			authenticate: async (_request, db) =>
				upsertAuthenticatedUser(
					{
						clerkUserId: "user_casey",
						email: "casey@example.com",
						firstName: "Casey",
						lastName: "User",
						displayName: "Casey User",
					},
					db,
				),
			createHouseholdJoinCodeService: () => service,
		};

		try {
			const joined = await readJsonResponse(
				await handleJoinByCode(
					createApiRequest({
						body: {
							code: "ABCDEFGH",
							source: JOIN_LINK_HOUSEHOLD_JOIN_CODE_SOURCE,
						},
					}),
					deps,
				),
			);
			const invalid = await readJsonResponse(
				await handleJoinByCode(
					createApiRequest({
						body: { code: "ABCDEFGH", source: "visible_code" },
					}),
					deps,
				),
			);

			expect(joined.status).toBe(200);
			expect(joinByCode).toHaveBeenCalledWith({
				code: "ABCDEFGH",
				userId: expect.any(String),
				source: JOIN_LINK_HOUSEHOLD_JOIN_CODE_SOURCE,
			});
			expect(invalid).toMatchObject({
				status: 400,
				body: { error: "Invalid Household Join Code source" },
			});
		} finally {
			await directory.close();
		}
	});

	it("redacts thrown service errors before logging generic server failures", async () => {
		const directory = await createTestDirectoryDb();
		const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
		const thrownError = new Error(
			"boom https://db.example.com?authToken=secret-token-value user@example.com",
		);
		const service: HouseholdJoinCodeService = {
			getCurrentJoinCode: jest.fn(),
			previewJoinCode: jest.fn(),
			joinByCode: jest.fn(),
			regenerateJoinCode: jest.fn(async () => {
				throw thrownError;
			}),
			disableJoinCode: jest.fn(),
			enableJoinCode: jest.fn(),
		};

		try {
			const response = await handleRegenerateJoinCode(
				createApiRequest({ method: "POST" }),
				{ householdId: "hh_avery" },
				{
					directory: directory.db,
					authenticate: async (_request, db) =>
						upsertAuthenticatedUser(
							{
								clerkUserId: "user_avery",
								email: "avery@example.com",
								firstName: "Avery",
								lastName: "User",
								displayName: "Avery User",
							},
							db,
						),
					createHouseholdJoinCodeService: () => service,
				},
			);

			await expect(readJsonResponse(response)).resolves.toMatchObject({
				status: 500,
				body: { error: "Server error" },
			});
			expect(errorSpy).toHaveBeenCalled();
			const loggedAttributes = JSON.stringify(errorSpy.mock.calls[0]?.[1]);
			expect(loggedAttributes).not.toContain("secret-token-value");
			expect(loggedAttributes).not.toContain("user@example.com");
			expect(loggedAttributes).toContain("error_message");
		} finally {
			errorSpy.mockRestore();
			await directory.close();
		}
	});
});

function renameRequest(name = "Lake House"): Request {
	return createApiRequest({
		method: "PATCH",
		body: { name },
	});
}

function handleRename(input: {
	householdId: string;
	deps: HouseholdApiDeps;
	name?: string;
}): Promise<Response> {
	return handleRenameHousehold(
		renameRequest(input.name),
		{ householdId: input.householdId },
		input.deps,
	);
}

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
	scenario: Awaited<ReturnType<typeof seedPrimaryHouseholdScenario>>;
	close: () => Promise<void>;
}> {
	const directory = await createTestDirectoryDb();
	const scenario = await seedPrimaryHouseholdScenario({
		directory: directory.db,
	});
	return {
		directory,
		scenario,
		close: async () => {
			await directory.close();
		},
	};
}

async function addCameronMember(
	harness: Awaited<ReturnType<typeof primaryHarness>>,
) {
	const cameron = userFixture({
		...PRIMARY_HOUSEHOLD_SEED.users.cameron,
		activeHouseholdId: harness.scenario.household.id,
	});
	await harness.directory.db.insert(users).values(cameron);
	await harness.directory.db.insert(memberships).values(
		membershipFixture({
			id: PRIMARY_HOUSEHOLD_SEED.memberships.cameron.id,
			householdId: harness.scenario.household.id,
			userId: cameron.id,
			role: "member",
			joinedAt: now + 10,
		}),
	);
}
