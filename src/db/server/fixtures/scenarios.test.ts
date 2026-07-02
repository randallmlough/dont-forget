import { eq } from "drizzle-orm";
import {
	householdJoinCodes,
	householdJoinCodeUses,
	households,
	invitations,
	itemChecks,
	items,
	lists,
	memberships,
	users,
} from "@/db/schema/postgres";
import { createTestDirectoryDb } from "@/db/server/test";
import {
	householdFixture,
	householdJoinCodeFixture,
	householdJoinCodeUseFixture,
	membershipFixture,
	PRIMARY_HOUSEHOLD_SEED,
	seedEmailBackedPrimaryHouseholdScenario,
	seedHouseholdJoinCodeAuditScenario,
	seedInvitationVariantsScenario,
	seedMultiHouseholdUserScenario,
	seedPrimaryHouseholdScenario,
	userFixture,
} from "./index";

const SEED_DEFAULT_LIST_ID = "lst_default_groceries";

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

			await directory.db.insert(users).values([avery, blake]);
			await directory.db.insert(households).values(household);
			await directory.db
				.insert(memberships)
				.values([averyMembership, blakeMembership]);
			await directory.db.insert(householdJoinCodes).values(joinCode);
			await directory.db.insert(householdJoinCodeUses).values(use);

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
		} finally {
			await directory.close();
		}
	});

	it("seeds a primary Household with active User selection and a Household Join Code", async () => {
		const directory = await createTestDirectoryDb();

		try {
			const scenario = await seedPrimaryHouseholdScenario({
				directory: directory.db,
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
			await directory.close();
		}
	});

	it("seeds multiple active Lists plus one archived and one deleted List", async () => {
		const directory = await createTestDirectoryDb();

		try {
			const scenario = await seedPrimaryHouseholdScenario({
				directory: directory.db,
			});

			const rows = await directory.db.select().from(lists);
			const active = rows.filter(
				(row) => row.archivedAt === null && row.deletedAt === null,
			);
			const archived = rows.filter(
				(row) => row.archivedAt !== null && row.deletedAt === null,
			);
			const deleted = rows.filter((row) => row.deletedAt !== null);

			expect(scenario.lists.groceries.id).toBe(SEED_DEFAULT_LIST_ID);
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
					archivedAt: expect.any(Date),
					deletedAt: null,
				}),
			]);
			expect(deleted).toEqual([
				expect.objectContaining({
					id: scenario.lists.deleted.id,
					archivedAt: null,
					deletedAt: expect.any(Date),
				}),
			]);
		} finally {
			await directory.close();
		}
	});

	it("seeds an email-backed primary Household with three Members and rich Items", async () => {
		const directory = await createTestDirectoryDb();

		try {
			const scenario = await seedEmailBackedPrimaryHouseholdScenario({
				directory: directory.db,
				ownerClerkUserId: "user_clerk_owner",
				ownerEmail: "owner@example.com",
				memberClerkUserId: "user_clerk_member",
				memberEmail: "owner+member@example.com",
			});

			const directoryUsers = await directory.db.select().from(users);
			const directoryMemberships = await directory.db
				.select()
				.from(memberships);
			const listRows = await directory.db.select().from(lists);
			const itemRows = await directory.db.select().from(items);
			const itemCheckRows = await directory.db.select().from(itemChecks);

			const membershipFor = (userId: string) => {
				const membership = directoryMemberships.find(
					(row) => row.userId === userId,
				);
				if (!membership) {
					throw new Error(`Missing Membership for ${userId}`);
				}
				return membership;
			};

			expect(directoryUsers).toHaveLength(3);
			expect(directoryMemberships).toHaveLength(3);
			expect(directoryUsers).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						id: scenario.users.avery.id,
						clerkUserId: "user_clerk_owner",
						email: "owner@example.com",
						activeHouseholdId: scenario.household.id,
					}),
					expect.objectContaining({
						id: scenario.users.blake.id,
						clerkUserId: "user_clerk_member",
						email: "owner+member@example.com",
						activeHouseholdId: scenario.household.id,
					}),
					expect.objectContaining({
						id: scenario.users.cameron.id,
						clerkUserId: PRIMARY_HOUSEHOLD_SEED.users.cameron.clerkUserId,
						activeHouseholdId: scenario.household.id,
					}),
				]),
			);
			expect(membershipFor(scenario.users.avery.id)).toEqual(
				expect.objectContaining({ role: "owner" }),
			);
			expect(membershipFor(scenario.users.blake.id)).toEqual(
				expect.objectContaining({ role: "member" }),
			);
			expect(membershipFor(scenario.users.cameron.id)).toEqual(
				expect.objectContaining({ role: "member" }),
			);

			const activeLists = listRows.filter(
				(row) => row.archivedAt === null && row.deletedAt === null,
			);
			const archivedLists = listRows.filter(
				(row) => row.archivedAt !== null && row.deletedAt === null,
			);
			const deletedLists = listRows.filter((row) => row.deletedAt !== null);

			expect(listRows).toHaveLength(5);
			expect(activeLists).toHaveLength(3);
			expect(archivedLists).toHaveLength(1);
			expect(deletedLists).toHaveLength(1);
			for (const list of activeLists) {
				expect(
					itemRows.filter(
						(item) => item.listId === list.id && item.deletedAt === null,
					).length,
				).toBeGreaterThanOrEqual(2);
			}
			expect(
				itemRows.filter(
					(item) =>
						item.listId === archivedLists[0]?.id && item.deletedAt === null,
				).length,
			).toBeGreaterThanOrEqual(1);
			expect(
				itemRows.filter((item) => item.listId === deletedLists[0]?.id),
			).toHaveLength(0);
			expect(
				itemCheckRows.some(
					(row) => row.checkedByUserId === scenario.users.avery.id,
				),
			).toBe(true);
			expect(
				itemCheckRows.some(
					(row) => row.checkedByUserId === scenario.users.blake.id,
				),
			).toBe(true);
		} finally {
			await directory.close();
		}
	});

	it("seeds an email-backed primary Household alongside existing deterministic seed rows", async () => {
		const directory = await createTestDirectoryDb();

		try {
			await seedPrimaryHouseholdScenario({
				directory: directory.db,
			});
			const scenario = await seedEmailBackedPrimaryHouseholdScenario({
				directory: directory.db,
				ownerClerkUserId: "user_email_owner",
				ownerEmail: "owner@example.com",
				memberClerkUserId: "user_email_member",
				memberEmail: "owner+member@example.com",
				seed: {
					users: {
						avery: { id: "usr_email_owner" },
						blake: { id: "usr_email_member" },
						cameron: { id: "usr_email_cameron" },
					},
					household: { id: "hh_email_seed" },
					memberships: {
						avery: { id: "mbr_email_owner" },
						blake: { id: "mbr_email_member" },
						cameron: { id: "mbr_email_cameron" },
					},
					joinCode: { id: "hjc_email_seed", code: "BCDEFGHJ" },
				},
			});

			expect(await directory.db.select().from(users)).toHaveLength(5);
			expect(await directory.db.select().from(households)).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						id: PRIMARY_HOUSEHOLD_SEED.household.id,
					}),
					expect.objectContaining({
						id: scenario.household.id,
					}),
				]),
			);
			expect(await directory.db.select().from(memberships)).toHaveLength(5);
			const listRows = await directory.db.select().from(lists);
			expect(
				listRows.filter(
					(row) => row.householdId === PRIMARY_HOUSEHOLD_SEED.household.id,
				),
			).toHaveLength(5);
			expect(
				listRows.filter((row) => row.householdId === scenario.household.id),
			).toHaveLength(5);
		} finally {
			await directory.close();
		}
	});

	it("seeds multiple email-backed primary Households with unique app-only Member identities", async () => {
		const directory = await createTestDirectoryDb();

		try {
			await seedEmailBackedPrimaryHouseholdScenario({
				directory: directory.db,
				ownerClerkUserId: "user_email_first_owner",
				ownerEmail: "first@example.com",
				memberClerkUserId: "user_email_first_member",
				memberEmail: "first+member@example.com",
				seed: {
					users: {
						avery: { id: "usr_email_first_owner" },
						blake: { id: "usr_email_first_member" },
						cameron: { id: "usr_email_first_cameron" },
					},
					household: { id: "hh_email_first" },
					memberships: {
						avery: { id: "mbr_email_first_owner" },
						blake: { id: "mbr_email_first_member" },
						cameron: { id: "mbr_email_first_cameron" },
					},
					joinCode: { id: "hjc_email_first", code: "BCDEFGHJ" },
				},
			});

			await seedEmailBackedPrimaryHouseholdScenario({
				directory: directory.db,
				ownerClerkUserId: "user_email_second_owner",
				ownerEmail: "second@example.com",
				memberClerkUserId: "user_email_second_member",
				memberEmail: "second+member@example.com",
				seed: {
					users: {
						avery: { id: "usr_email_second_owner" },
						blake: { id: "usr_email_second_member" },
						cameron: { id: "usr_email_second_cameron" },
					},
					household: { id: "hh_email_second" },
					memberships: {
						avery: { id: "mbr_email_second_owner" },
						blake: { id: "mbr_email_second_member" },
						cameron: { id: "mbr_email_second_cameron" },
					},
					joinCode: { id: "hjc_email_second", code: "CDEFGHJK" },
				},
			});

			const directoryUsers = await directory.db.select().from(users);
			const clerkUserIds = directoryUsers.map((user) => user.clerkUserId);

			expect(directoryUsers).toHaveLength(6);
			expect(new Set(clerkUserIds).size).toBe(clerkUserIds.length);
			expect(await directory.db.select().from(lists)).toHaveLength(10);
		} finally {
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

	it("seeds Household Join Code lifecycle audit rows with safe use columns", async () => {
		const directory = await createTestDirectoryDb();

		try {
			const scenario = await seedHouseholdJoinCodeAuditScenario({
				directory: directory.db,
			});

			const codes = await directory.db.select().from(householdJoinCodes);
			const uses = await directory.db.select().from(householdJoinCodeUses);

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
			expect(Object.keys(uses[0]).sort()).toEqual([
				"householdId",
				"householdJoinCodeId",
				"id",
				"membershipId",
				"usedAt",
				"userId",
			]);
			expect(scenario.members.blake).toBe(scenario.memberships.blake);
		} finally {
			await directory.close();
		}
	});
});
