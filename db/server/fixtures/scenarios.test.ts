import { eq } from "drizzle-orm";

import {
	householdJoinCodeAttempts,
	householdJoinCodes,
	householdJoinCodeUses,
	households,
	invitations,
	memberships,
	users,
} from "@/db/schema/directory";
import { lists } from "@/db/schema/household";
import { createTestDirectoryDb, createTestHouseholdDb } from "@/db/server/test";
import { DEFAULT_LIST_ID } from "@/lib/bootstrap";
import {
	householdFixture,
	householdJoinCodeAttemptFixture,
	householdJoinCodeFixture,
	householdJoinCodeUseFixture,
	membershipFixture,
	PRIMARY_HOUSEHOLD_SEED,
	seedHouseholdJoinCodeAuditScenario,
	seedInvitationVariantsScenario,
	seedMultiHouseholdUserScenario,
	seedPrimaryHouseholdScenario,
	userFixture,
} from "./index";

describe("database fixture scenarios", () => {
	it("inserts Household Join Code builder rows into a migrated directory DB", async () => {
		const directory = await createTestDirectoryDb();

		try {
			const avery = userFixture();
			const blake = userFixture({
				...PRIMARY_HOUSEHOLD_SEED.users.blake,
			});
			const household = householdFixture();
			const averyMembership = membershipFixture();
			const blakeMembership = membershipFixture({
				id: PRIMARY_HOUSEHOLD_SEED.memberships.blake.id,
				userId: blake.id,
				role: "member",
			});
			const joinCode = householdJoinCodeFixture();
			const use = householdJoinCodeUseFixture();
			const attempt = householdJoinCodeAttemptFixture();

			await directory.db.insert(users).values([avery, blake]);
			await directory.db.insert(households).values(household);
			await directory.db
				.insert(memberships)
				.values([averyMembership, blakeMembership]);
			await directory.db.insert(householdJoinCodes).values(joinCode);
			await directory.db.insert(householdJoinCodeUses).values(use);
			await directory.db.insert(householdJoinCodeAttempts).values(attempt);

			expect(await directory.db.select().from(householdJoinCodes)).toEqual([
				expect.objectContaining({
					id: joinCode.id,
					code: joinCode.code,
					disabledAt: null,
					replacedAt: null,
				}),
			]);
			expect(await directory.db.select().from(householdJoinCodeUses)).toEqual([
				expect.objectContaining({
					id: use.id,
					householdJoinCodeId: joinCode.id,
					userId: blake.id,
				}),
			]);
			expect(
				await directory.db.select().from(householdJoinCodeAttempts),
			).toEqual([
				expect.objectContaining({
					userId: blake.id,
					failedCount: 1,
				}),
			]);
		} finally {
			await directory.close();
		}
	});

	it("seeds a primary Household with active User selection and a Household Join Code", async () => {
		const directory = await createTestDirectoryDb();
		const household = await createTestHouseholdDb();

		try {
			const scenario = await seedPrimaryHouseholdScenario({
				directory: directory.db,
				household: household.db,
			});

			expect(scenario.users.avery.activeHouseholdId).toBe(
				scenario.household.id,
			);
			expect(scenario.users.blake.activeHouseholdId).toBe(
				scenario.household.id,
			);
			expect(await directory.db.select().from(householdJoinCodes)).toEqual([
				expect.objectContaining({
					id: scenario.joinCodes.active.id,
					householdId: scenario.household.id,
				}),
			]);
		} finally {
			await household.close();
			await directory.close();
		}
	});

	it("seeds multiple active Lists plus one archived and one deleted List", async () => {
		const directory = await createTestDirectoryDb();
		const household = await createTestHouseholdDb();

		try {
			const scenario = await seedPrimaryHouseholdScenario({
				directory: directory.db,
				household: household.db,
			});

			const rows = await household.db.select().from(lists);
			const active = rows.filter(
				(row) => row.archivedAt === null && row.deletedAt === null,
			);
			const archived = rows.filter(
				(row) => row.archivedAt !== null && row.deletedAt === null,
			);
			const deleted = rows.filter((row) => row.deletedAt !== null);

			expect(scenario.lists.groceries.id).toBe(DEFAULT_LIST_ID);
			expect(rows).toHaveLength(5);
			expect(active).toHaveLength(3);
			expect(active.map((row) => row.id).sort()).toEqual(
				[
					scenario.lists.groceries.id,
					scenario.lists.hardware.id,
					scenario.lists.pharmacy.id,
				].sort(),
			);
			expect(archived).toEqual([
				expect.objectContaining({
					id: scenario.lists.archived.id,
					name: scenario.lists.archived.name,
					archivedAt: expect.any(Number),
					deletedAt: null,
				}),
			]);
			expect(deleted).toEqual([
				expect.objectContaining({
					id: scenario.lists.deleted.id,
					archivedAt: null,
					deletedAt: expect.any(Number),
				}),
			]);
		} finally {
			await household.close();
			await directory.close();
		}
	});

	it("seeds a multi-Household User scenario", async () => {
		const directory = await createTestDirectoryDb();

		try {
			const scenario = await seedMultiHouseholdUserScenario({
				directory: directory.db,
			});

			expect(scenario.users.avery.activeHouseholdId).toBe(
				scenario.households.second.id,
			);
			expect(await directory.db.select().from(households)).toHaveLength(2);
			expect(await directory.db.select().from(memberships)).toHaveLength(3);
			expect(await directory.db.select().from(householdJoinCodes)).toHaveLength(
				2,
			);
			const [avery] = await directory.db
				.select()
				.from(users)
				.where(eq(users.id, scenario.users.avery.id))
				.limit(1);
			expect(avery).toEqual(
				expect.objectContaining({
					activeHouseholdId: scenario.households.second.id,
				}),
			);
		} finally {
			await directory.close();
		}
	});

	it("seeds Invitation variants for pending, accepted, revoked, and expired states", async () => {
		const directory = await createTestDirectoryDb();

		try {
			const scenario = await seedInvitationVariantsScenario({
				directory: directory.db,
			});

			const rows = await directory.db.select().from(invitations);

			expect(rows).toHaveLength(5);
			expect(rows).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						id: scenario.invitations.pendingEmail.id,
						email: "new-member@example.com",
						acceptedAt: null,
						revokedAt: null,
					}),
					expect.objectContaining({
						id: scenario.invitations.pendingLink.id,
						email: null,
						acceptedAt: null,
						revokedAt: null,
					}),
					expect.objectContaining({
						id: scenario.invitations.accepted.id,
						acceptedByUserId: scenario.users.blake.id,
					}),
					expect.objectContaining({
						id: scenario.invitations.revoked.id,
						revokedAt: expect.any(Number),
					}),
					expect.objectContaining({
						id: scenario.invitations.expired.id,
						expiresAt: expect.any(Number),
					}),
				]),
			);
			expect(scenario.invitations.expired.expiresAt).toBeLessThan(
				PRIMARY_HOUSEHOLD_SEED.now,
			);
			expect(scenario.members.avery).toBe(scenario.memberships.avery);
		} finally {
			await directory.close();
		}
	});

	it("seeds Household Join Code lifecycle audit rows with safe use and attempt columns", async () => {
		const directory = await createTestDirectoryDb();

		try {
			const scenario = await seedHouseholdJoinCodeAuditScenario({
				directory: directory.db,
			});

			const codes = await directory.db.select().from(householdJoinCodes);
			const uses = await directory.db.select().from(householdJoinCodeUses);
			const attempts = await directory.db
				.select()
				.from(householdJoinCodeAttempts);

			expect(codes).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						id: scenario.joinCodes.active.id,
						disabledAt: null,
						replacedAt: null,
					}),
					expect.objectContaining({
						id: scenario.joinCodes.replaced.id,
						replacedAt: expect.any(Number),
					}),
					expect.objectContaining({
						id: scenario.joinCodes.disabled.id,
						disabledAt: expect.any(Number),
					}),
				]),
			);
			expect(uses).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						householdJoinCodeId: scenario.joinCodes.active.id,
						userId: scenario.users.blake.id,
					}),
					expect.objectContaining({
						householdJoinCodeId: scenario.joinCodes.active.id,
						userId: scenario.users.cameron.id,
					}),
				]),
			);
			expect(attempts).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						userId: scenario.users.blake.id,
						failedCount: 2,
					}),
					expect.objectContaining({
						userId: scenario.users.cameron.id,
						failedCount: 1,
					}),
				]),
			);
			expect(Object.keys(uses[0]).sort()).toEqual([
				"householdId",
				"householdJoinCodeId",
				"id",
				"membershipId",
				"usedAt",
				"userId",
			]);
			expect(Object.keys(attempts[0]).sort()).toEqual([
				"failedCount",
				"lastFailedAt",
				"userId",
				"windowStartedAt",
			]);
			expect(scenario.members.blake).toBe(scenario.memberships.blake);
		} finally {
			await directory.close();
		}
	});
});
