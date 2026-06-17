import { eq } from "drizzle-orm";
import {
	householdJoinCodeAttempts,
	households,
	memberships,
	users,
} from "@/db/schema/directory";
import {
	householdJoinCodeAttemptFixture,
	membershipFixture,
	PRIMARY_HOUSEHOLD_SEED,
	seedHouseholdJoinCodeAuditScenario,
	seedMultiHouseholdUserScenario,
	seedPrimaryHouseholdScenario,
	userFixture,
} from "@/db/server/fixtures";
import {
	createTestDirectoryDb,
	createTestHouseholdDb,
	type TestDirectoryDb,
	type TestHouseholdDb,
} from "@/db/server/test";
import { JOIN_LINK_HOUSEHOLD_JOIN_CODE_SOURCE } from "@/lib/household-join-code-source";
import {
	createHouseholdJoinCodeService,
	type HouseholdJoinCodeService,
	type HouseholdProvisioningService,
} from "@/lib/services/household/server";
import { INITIAL_HOUSEHOLD_NAMES } from "@/lib/services/household/server/initial-household-name";
import { createApiRequest, readJsonResponse } from "@/lib/test/api";
import { ApiUnauthorizedError, upsertAuthenticatedUser } from "../shared";
import {
	type HouseholdApiDeps,
	handleChangeMemberRole,
	handleCreateHousehold,
	handleDeleteHousehold,
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
} from "./handlers";

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
					appEnv: "local",
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
				tursoDbName: expect.stringContaining("df-local-hh-"),
				provisioningCompletedAt: expect.any(Number),
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

	it("leaves the previous Household active and creates no Owner Membership when provisioning fails", async () => {
		const harness = await primaryHarness();
		const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
		try {
			const response = await handleCreateHousehold(
				createApiRequest({
					method: "POST",
					body: { name: "Lake House" },
				}),
				{
					...householdDeps(
						harness.directory,
						harness.scenario.users.avery.clerkUserId,
					),
					createHouseholdProvisioningService: () =>
						testHouseholdProvisioningService({
							ensureHouseholdDatabase: async () => {
								throw new Error("provisioning unavailable");
							},
						}),
				},
			);

			await expect(readJsonResponse(response)).resolves.toMatchObject({
				status: 500,
				body: { error: "Server error" },
			});
			const [storedUser] = await harness.directory.db
				.select()
				.from(users)
				.where(eq(users.id, harness.scenario.users.avery.id));
			const [createdHousehold] = await harness.directory.db
				.select()
				.from(households)
				.where(eq(households.name, "Lake House"));
			const createdMemberships = createdHousehold
				? await harness.directory.db
						.select()
						.from(memberships)
						.where(eq(memberships.householdId, createdHousehold.id))
				: [];

			expect(storedUser?.activeHouseholdId).toBe(harness.scenario.household.id);
			expect(createdHousehold).toMatchObject({
				provisioningCompletedAt: null,
			});
			expect(createdMemberships).toEqual([]);
		} finally {
			errorSpy.mockRestore();
			await harness.close();
		}
	});

	it("leaves the previous Household active and creates no Owner Membership when token creation fails", async () => {
		const harness = await primaryHarness();
		const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
		try {
			const response = await handleCreateHousehold(
				createApiRequest({
					method: "POST",
					body: { name: "Lake House" },
				}),
				{
					...householdDeps(
						harness.directory,
						harness.scenario.users.avery.clerkUserId,
					),
					createHouseholdProvisioningService: () =>
						testHouseholdProvisioningService({
							createHouseholdDatabaseToken: async () => {
								throw new Error("token unavailable");
							},
						}),
				},
			);

			await expect(readJsonResponse(response)).resolves.toMatchObject({
				status: 500,
				body: { error: "Server error" },
			});
			const [storedUser] = await harness.directory.db
				.select()
				.from(users)
				.where(eq(users.id, harness.scenario.users.avery.id));
			const [createdHousehold] = await harness.directory.db
				.select()
				.from(households)
				.where(eq(households.name, "Lake House"));
			const createdMemberships = createdHousehold
				? await harness.directory.db
						.select()
						.from(memberships)
						.where(eq(memberships.householdId, createdHousehold.id))
				: [];

			expect(storedUser?.activeHouseholdId).toBe(harness.scenario.household.id);
			expect(createdHousehold).toMatchObject({
				provisioningCompletedAt: null,
			});
			expect(createdMemberships).toEqual([]);
		} finally {
			errorSpy.mockRestore();
			await harness.close();
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

	it("requires auth for Household deletion", async () => {
		const directory = await createTestDirectoryDb();
		try {
			const response = await handleDeleteHousehold(
				createApiRequest({ method: "DELETE" }),
				{ householdId: "hh_avery" },
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

	it("deletes a Household and tears down its Turso database after the directory transaction", async () => {
		const harness = await primaryHarness();
		const deleteDatabase = jest.fn(async () => undefined);
		const dateNow = jest.spyOn(Date, "now").mockReturnValue(now);
		try {
			const response = await handleDeleteHousehold(
				createApiRequest({ method: "DELETE" }),
				{ householdId: harness.scenario.household.id },
				{
					...householdDeps(
						harness.directory,
						harness.scenario.users.avery.clerkUserId,
					),
					...tursoPlatformDeps(deleteDatabase),
				},
			);
			const [storedHousehold] = await harness.directory.db
				.select()
				.from(households)
				.where(eq(households.id, harness.scenario.household.id));
			const storedMemberships = await harness.directory.db
				.select()
				.from(memberships)
				.where(eq(memberships.householdId, harness.scenario.household.id));

			await expect(readJsonResponse(response)).resolves.toMatchObject({
				status: 200,
				body: { deleted: true, databaseDeleted: true },
			});
			expect(storedHousehold?.deletedAt).toBe(now);
			expect(storedMemberships).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						id: harness.scenario.members.avery.id,
						removedAt: now,
					}),
					expect.objectContaining({
						id: harness.scenario.members.blake.id,
						removedAt: now,
					}),
				]),
			);
			expect(deleteDatabase).toHaveBeenCalledWith(
				harness.scenario.household.tursoDbName,
			);
		} finally {
			dateNow.mockRestore();
			await harness.close();
		}
	});

	it("rejects Household deletion by plain Members and deleted Households", async () => {
		const harness = await primaryHarness();
		try {
			const plainMember = await readJsonResponse(
				await handleDeleteHousehold(
					createApiRequest({ method: "DELETE" }),
					{ householdId: harness.scenario.household.id },
					householdDeps(
						harness.directory,
						harness.scenario.users.blake.clerkUserId,
					),
				),
			);

			await harness.directory.db
				.update(households)
				.set({ deletedAt: now })
				.where(eq(households.id, harness.scenario.household.id));
			const deletedHousehold = await readJsonResponse(
				await handleDeleteHousehold(
					createApiRequest({ method: "DELETE" }),
					{ householdId: harness.scenario.household.id },
					householdDeps(
						harness.directory,
						harness.scenario.users.avery.clerkUserId,
					),
				),
			);

			expect(plainMember).toMatchObject({
				status: 403,
				body: { error: "Forbidden" },
			});
			expect(deletedHousehold).toMatchObject({
				status: 404,
				body: { error: "Household not found." },
			});
		} finally {
			await harness.close();
		}
	});

	it("keeps Household deletion successful when Turso teardown fails", async () => {
		const harness = await primaryHarness();
		const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
		const deleteDatabase = jest.fn(async () => {
			throw new Error(
				"boom https://db.example.com?authToken=secret-token-value user@example.com",
			);
		});
		try {
			const response = await handleDeleteHousehold(
				createApiRequest({ method: "DELETE" }),
				{ householdId: harness.scenario.household.id },
				{
					...householdDeps(
						harness.directory,
						harness.scenario.users.avery.clerkUserId,
					),
					...tursoPlatformDeps(deleteDatabase),
				},
			);

			await expect(readJsonResponse(response)).resolves.toMatchObject({
				status: 200,
				body: { deleted: true, databaseDeleted: false },
			});
			expect(deleteDatabase).toHaveBeenCalledWith(
				harness.scenario.household.tursoDbName,
			);
			const loggedAttributes = JSON.stringify(errorSpy.mock.calls[0]?.[1]);
			expect(loggedAttributes).not.toContain("secret-token-value");
			expect(loggedAttributes).not.toContain("user@example.com");
			expect(loggedAttributes).toContain("error_message");
		} finally {
			errorSpy.mockRestore();
			await harness.close();
		}
	});

	it("retries Turso teardown for a tombstoned Household after an initial teardown failure", async () => {
		const harness = await primaryHarness();
		const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
		const deleteDatabase = jest
			.fn()
			.mockRejectedValueOnce(new Error("temporary Turso outage"))
			.mockResolvedValueOnce(undefined);
		try {
			const first = await readJsonResponse(
				await handleDeleteHousehold(
					createApiRequest({ method: "DELETE" }),
					{ householdId: harness.scenario.household.id },
					{
						...householdDeps(
							harness.directory,
							harness.scenario.users.avery.clerkUserId,
						),
						...tursoPlatformDeps(deleteDatabase),
					},
				),
			);
			const retry = await readJsonResponse(
				await handleDeleteHousehold(
					createApiRequest({ method: "DELETE" }),
					{ householdId: harness.scenario.household.id },
					{
						...householdDeps(
							harness.directory,
							harness.scenario.users.avery.clerkUserId,
						),
						...tursoPlatformDeps(deleteDatabase),
					},
				),
			);

			expect(first).toMatchObject({
				status: 200,
				body: { deleted: true, databaseDeleted: false },
			});
			expect(retry).toMatchObject({
				status: 200,
				body: { deleted: true, databaseDeleted: true },
			});
			expect(deleteDatabase).toHaveBeenCalledTimes(2);
			expect(deleteDatabase).toHaveBeenCalledWith(
				harness.scenario.household.tursoDbName,
			);
		} finally {
			errorSpy.mockRestore();
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
		appEnv: "local",
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
		createHouseholdProvisioningService: () =>
			testHouseholdProvisioningService(),
	};
}

function testHouseholdProvisioningService(
	overrides: Partial<HouseholdProvisioningService> = {},
): HouseholdProvisioningService {
	return {
		ensureHouseholdDatabase: async () => ({
			url: "file:test-household.db",
			provisioned: true,
		}),
		createHouseholdDatabaseToken: async () => "test-token",
		deleteHouseholdDatabase: async () => undefined,
		...overrides,
	};
}

function tursoPlatformDeps(
	deleteDatabase: (databaseName: string) => Promise<void>,
): Pick<HouseholdApiDeps, "createHouseholdProvisioningService"> {
	return {
		createHouseholdProvisioningService: () =>
			testHouseholdProvisioningService({
				deleteHouseholdDatabase: deleteDatabase,
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
