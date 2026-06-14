import { eq } from "drizzle-orm";
import { households, memberships, users } from "@/db/schema/directory";
import type { DirectoryDb } from "@/db/server/client";
import { createTestDirectoryDb } from "@/db/server/test";
import {
	createMemberService,
	LastOwnerError,
	MemberManagementForbiddenError,
	MemberManagementInvalidError,
	SoleMemberError,
} from "./member-service";

describe("createMemberService", () => {
	it("finds the oldest active Membership and lists authenticated app session Members", async () => {
		const directory = await createTestDirectoryDb();
		const service = memberService(directory.db);

		try {
			await directory.db.insert(users).values([
				{
					id: "usr_avery",
					clerkUserId: "clerk_avery",
					displayName: "Avery Chen",
				},
				{
					id: "usr_blake",
					clerkUserId: "clerk_blake",
					displayName: "Blake Park",
				},
			]);
			await directory.db.insert(households).values([
				{
					id: "hh_newer",
					name: "Newer",
					tursoDbName: "db-newer",
					createdByUserId: "usr_avery",
					provisioningCompletedAt: 1,
					createdAt: 1,
				},
				{
					id: "hh_older",
					name: "Older",
					tursoDbName: "db-older",
					createdByUserId: "usr_avery",
					provisioningCompletedAt: 1,
					createdAt: 1,
				},
				{
					id: "hh_deleted",
					name: "Deleted",
					tursoDbName: "db-deleted",
					createdByUserId: "usr_avery",
					provisioningCompletedAt: 1,
					createdAt: 1,
					deletedAt: 99,
				},
			]);
			await directory.db.insert(memberships).values([
				{
					id: "mbr_newer",
					householdId: "hh_newer",
					userId: "usr_avery",
					role: "member",
					joinedAt: 20,
				},
				{
					id: "mbr_older",
					householdId: "hh_older",
					userId: "usr_avery",
					role: "owner",
					joinedAt: 10,
				},
				{
					id: "mbr_blake",
					householdId: "hh_older",
					userId: "usr_blake",
					role: "member",
					joinedAt: 30,
				},
				{
					id: "mbr_deleted",
					householdId: "hh_deleted",
					userId: "usr_avery",
					role: "owner",
					joinedAt: 1,
				},
			]);

			await expect(
				service.findOldestActiveMembership("usr_avery"),
			).resolves.toMatchObject({
				membershipId: "mbr_older",
				membershipRole: "owner",
				householdId: "hh_older",
				householdName: "Older",
			});
			await expect(
				service.findActiveMembership({
					userId: "usr_avery",
					householdId: "hh_newer",
				}),
			).resolves.toMatchObject({
				membershipId: "mbr_newer",
				membershipRole: "member",
				householdId: "hh_newer",
				householdName: "Newer",
			});
			await expect(
				service.findActiveMembership({
					userId: "usr_avery",
					householdId: "hh_deleted",
				}),
			).resolves.toBeNull();
			await expect(
				service.listAssociatedHouseholds({
					userId: "usr_avery",
					activeHouseholdId: "hh_newer",
				}),
			).resolves.toEqual([
				{ id: "hh_older", name: "Older", role: "owner", isActive: false },
				{ id: "hh_newer", name: "Newer", role: "member", isActive: true },
			]);
			await expect(service.listHouseholdMembers("hh_older")).resolves.toEqual([
				{
					membershipId: "mbr_older",
					userId: "usr_avery",
					role: "owner",
					displayName: "Avery Chen",
				},
				{
					membershipId: "mbr_blake",
					userId: "usr_blake",
					role: "member",
					displayName: "Blake Park",
				},
			]);
		} finally {
			await directory.close();
		}
	});

	it("excludes removed Memberships from active lookup and associated Household listing", async () => {
		const directory = await createTestDirectoryDb();
		const service = memberService(directory.db);

		try {
			await directory.db.insert(users).values({
				id: "usr_avery",
				clerkUserId: "clerk_avery",
				displayName: "Avery Chen",
			});
			await directory.db.insert(households).values([
				{
					id: "hh_active",
					name: "Active",
					tursoDbName: "db-active",
					createdByUserId: "usr_avery",
					provisioningCompletedAt: 1,
					createdAt: 1,
				},
				{
					id: "hh_removed",
					name: "Removed",
					tursoDbName: "db-removed",
					createdByUserId: "usr_avery",
					provisioningCompletedAt: 1,
					createdAt: 1,
				},
			]);
			await directory.db.insert(memberships).values([
				{
					id: "mbr_active",
					householdId: "hh_active",
					userId: "usr_avery",
					role: "owner",
					joinedAt: 10,
				},
				{
					id: "mbr_removed",
					householdId: "hh_removed",
					userId: "usr_avery",
					role: "member",
					joinedAt: 5,
					removedAt: 20,
				},
			]);

			await expect(
				service.findActiveMembership({
					userId: "usr_avery",
					householdId: "hh_removed",
				}),
			).resolves.toBeNull();
			await expect(
				service.findOldestActiveMembership("usr_avery"),
			).resolves.toMatchObject({
				membershipId: "mbr_active",
				householdId: "hh_active",
			});
			await expect(
				service.listAssociatedHouseholds({
					userId: "usr_avery",
					activeHouseholdId: "hh_active",
				}),
			).resolves.toEqual([
				{ id: "hh_active", name: "Active", role: "owner", isActive: true },
			]);
		} finally {
			await directory.close();
		}
	});

	it("creates one Owner Membership for a pending Household", async () => {
		const directory = await createTestDirectoryDb();
		const service = memberService(directory.db);
		const dateNow = jest.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);

		try {
			await directory.db.insert(users).values({
				id: "usr_avery",
				clerkUserId: "clerk_avery",
				displayName: "Avery Chen",
			});
			await directory.db.insert(households).values({
				id: "hh_pending",
				name: "Avery",
				tursoDbName: "db-pending",
				createdByUserId: "usr_avery",
				provisioningCompletedAt: null,
			});
			const [user] = await directory.db.select().from(users);
			if (!user) throw new Error("Expected test User");

			const first = await service.ensureOwnerMembership({
				householdId: "hh_pending",
				user,
			});
			const second = await service.ensureOwnerMembership({
				householdId: "hh_pending",
				user,
			});

			expect(second.id).toBe(first.id);
			expect(first).toMatchObject({
				id: expect.stringMatching(/^mbr_/),
				role: "owner",
				joinedAt: 1_700_000_000_000,
			});
			expect(await directory.db.select().from(memberships)).toHaveLength(1);
		} finally {
			dateNow.mockRestore();
			await directory.close();
		}
	});

	it("finds active Household Membership and ensures one plain Member Membership", async () => {
		const directory = await createTestDirectoryDb();
		const service = memberService(directory.db);
		const dateNow = jest.spyOn(Date, "now").mockReturnValue(1_700_000_010_000);

		try {
			await directory.db.insert(users).values([
				{
					id: "usr_avery",
					clerkUserId: "clerk_avery",
					displayName: "Avery Chen",
				},
				{
					id: "usr_blake",
					clerkUserId: "clerk_blake",
					displayName: "Blake Park",
				},
			]);
			await directory.db.insert(households).values({
				id: "hh_avery",
				name: "Avery",
				tursoDbName: "db-avery",
				createdByUserId: "usr_avery",
				provisioningCompletedAt: 1,
				createdAt: 1,
			});
			await directory.db.insert(memberships).values({
				id: "mbr_avery",
				householdId: "hh_avery",
				userId: "usr_avery",
				role: "owner",
				joinedAt: 1,
			});

			const first = await service.ensurePlainMemberMembership({
				householdId: "hh_avery",
				userId: "usr_blake",
			});
			const second = await service.ensurePlainMemberMembership({
				householdId: "hh_avery",
				userId: "usr_blake",
			});
			const membership = await service.findActiveMembership({
				householdId: "hh_avery",
				userId: "usr_blake",
			});

			expect(first.created).toBe(true);
			expect(second.created).toBe(false);
			expect(second.membership.id).toBe(first.membership.id);
			expect(membership).toMatchObject({
				membershipId: first.membership.id,
				membershipRole: "member",
				householdId: "hh_avery",
				householdName: "Avery",
			});
			await expect(
				directory.db.select().from(memberships),
			).resolves.toHaveLength(2);
		} finally {
			dateNow.mockRestore();
			await directory.close();
		}
	});

	it("lets an Owner remove a plain Member", async () => {
		const directory = await createTestDirectoryDb();
		const analytics = analyticsFixture();
		const service = memberService(directory.db, analytics);
		const dateNow = jest.spyOn(Date, "now").mockReturnValue(100);

		try {
			await seedMembers(directory.db, [
				{ id: "mbr_owner", userId: "usr_owner", role: "owner", joinedAt: 1 },
				{ id: "mbr_member", userId: "usr_member", role: "member", joinedAt: 2 },
			]);

			await service.removeMember({
				householdId: "hh_1",
				membershipId: "mbr_member",
				requestedByUserId: "usr_owner",
			});

			const [removed] = await directory.db
				.select()
				.from(memberships)
				.where(eq(memberships.id, "mbr_member"));
			expect(removed?.removedAt).toBe(100);
			await expect(service.listHouseholdMembers("hh_1")).resolves.toEqual([
				{
					membershipId: "mbr_owner",
					userId: "usr_owner",
					role: "owner",
					displayName: "Owner",
				},
			]);
			expect(analytics.track).toHaveBeenCalledWith("member_removed", {
				household_id: "hh_1",
				membership_id: "mbr_member",
				requested_by_user_id: "usr_owner",
			});
		} finally {
			dateNow.mockRestore();
			await directory.close();
		}
	});

	it("locks Household lifecycle inside the public remove Member command before policy reads", async () => {
		const events: string[] = [];
		let readCount = 0;
		let updateCount = 0;
		const requester = {
			id: "mbr_owner",
			householdId: "hh_1",
			userId: "usr_owner",
			role: "owner" as const,
			joinedAt: 1,
			removedAt: null,
		};
		const target = {
			id: "mbr_member",
			householdId: "hh_1",
			userId: "usr_member",
			role: "member" as const,
			joinedAt: 2,
			removedAt: null,
		};
		const selectBuilder = {
			from: () => selectBuilder,
			innerJoin: () => selectBuilder,
			where: () => selectBuilder,
			limit: async () => {
				events.push("read");
				readCount += 1;
				if (readCount === 1) return [{ memberships: requester }];
				if (readCount === 2) return [{ memberships: target }];
				return [];
			},
			orderBy: async () => {
				events.push("read");
				return [{ memberships: requester }, { memberships: target }];
			},
		};
		const tx = {
			select: () => selectBuilder,
			update: () => {
				updateCount += 1;
				return {
					set: () => ({
						where: async () => {
							events.push(updateCount === 1 ? "lock" : "mutate");
						},
					}),
				};
			},
		};
		const directory = {
			transaction: async <T>(
				operation: (transaction: typeof tx) => Promise<T>,
			) => operation(tx),
		};
		const service = memberService(directory as unknown as DirectoryDb);

		await service.removeMember({
			householdId: "hh_1",
			membershipId: "mbr_member",
			requestedByUserId: "usr_owner",
		});

		expect(events).toEqual(["lock", "read", "read", "read", "mutate"]);
	});

	it("rejects removal by a plain Member and self-removal by an Owner", async () => {
		const directory = await createTestDirectoryDb();
		const service = memberService(directory.db);

		try {
			await seedMembers(directory.db, [
				{ id: "mbr_owner", userId: "usr_owner", role: "owner", joinedAt: 1 },
				{ id: "mbr_member", userId: "usr_member", role: "member", joinedAt: 2 },
			]);

			await expect(
				service.removeMember({
					householdId: "hh_1",
					membershipId: "mbr_owner",
					requestedByUserId: "usr_member",
				}),
			).rejects.toBeInstanceOf(MemberManagementForbiddenError);
			await expect(
				service.removeMember({
					householdId: "hh_1",
					membershipId: "mbr_owner",
					requestedByUserId: "usr_owner",
				}),
			).rejects.toBeInstanceOf(MemberManagementInvalidError);
		} finally {
			await directory.close();
		}
	});

	it("allows removing an Owner only when another active Owner remains", async () => {
		const directory = await createTestDirectoryDb();
		const service = memberService(directory.db);

		try {
			await seedMembers(directory.db, [
				{
					id: "mbr_owner_a",
					userId: "usr_owner_a",
					role: "owner",
					joinedAt: 1,
				},
				{
					id: "mbr_owner_b",
					userId: "usr_owner_b",
					role: "owner",
					joinedAt: 2,
				},
				{ id: "mbr_member", userId: "usr_member", role: "member", joinedAt: 3 },
			]);

			await service.removeMember({
				householdId: "hh_1",
				membershipId: "mbr_owner_b",
				requestedByUserId: "usr_owner_a",
			});
			await expect(
				service.removeMember({
					householdId: "hh_1",
					membershipId: "mbr_owner_a",
					requestedByUserId: "usr_owner_a",
				}),
			).rejects.toBeInstanceOf(MemberManagementInvalidError);
			await expect(
				service.changeMemberRole({
					householdId: "hh_1",
					membershipId: "mbr_owner_a",
					role: "member",
					requestedByUserId: "usr_owner_a",
				}),
			).rejects.toBeInstanceOf(LastOwnerError);
		} finally {
			await directory.close();
		}
	});

	it("changes roles with last Owner protection and same-role no-op", async () => {
		const directory = await createTestDirectoryDb();
		const analytics = analyticsFixture();
		const service = memberService(directory.db, analytics);

		try {
			await seedMembers(directory.db, [
				{
					id: "mbr_owner_a",
					userId: "usr_owner_a",
					role: "owner",
					joinedAt: 1,
				},
				{
					id: "mbr_owner_b",
					userId: "usr_owner_b",
					role: "owner",
					joinedAt: 2,
				},
				{ id: "mbr_member", userId: "usr_member", role: "member", joinedAt: 3 },
			]);

			await service.changeMemberRole({
				householdId: "hh_1",
				membershipId: "mbr_owner_b",
				role: "member",
				requestedByUserId: "usr_owner_a",
			});
			await service.changeMemberRole({
				householdId: "hh_1",
				membershipId: "mbr_member",
				role: "owner",
				requestedByUserId: "usr_owner_a",
			});
			await service.changeMemberRole({
				householdId: "hh_1",
				membershipId: "mbr_member",
				role: "owner",
				requestedByUserId: "usr_owner_a",
			});

			const rows = await directory.db.select().from(memberships);
			expect(rows).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ id: "mbr_owner_b", role: "member" }),
					expect.objectContaining({ id: "mbr_member", role: "owner" }),
				]),
			);
			expect(analytics.track).toHaveBeenCalledTimes(2);
			expect(analytics.track).toHaveBeenNthCalledWith(
				1,
				"member_role_changed",
				{
					household_id: "hh_1",
					membership_id: "mbr_owner_b",
					role: "member",
					requested_by_user_id: "usr_owner_a",
				},
			);
			expect(analytics.track).toHaveBeenNthCalledWith(
				2,
				"member_role_changed",
				{
					household_id: "hh_1",
					membership_id: "mbr_member",
					role: "owner",
					requested_by_user_id: "usr_owner_a",
				},
			);
		} finally {
			await directory.close();
		}
	});

	it("lets a plain Member leave without promotion", async () => {
		const directory = await createTestDirectoryDb();
		const service = memberService(directory.db);

		try {
			await seedMembers(directory.db, [
				{ id: "mbr_owner", userId: "usr_owner", role: "owner", joinedAt: 1 },
				{ id: "mbr_member", userId: "usr_member", role: "member", joinedAt: 2 },
			]);

			await expect(
				service.leaveHousehold({ householdId: "hh_1", userId: "usr_member" }),
			).resolves.toEqual({ promotedMembershipId: null });
			await expect(service.listHouseholdMembers("hh_1")).resolves.toHaveLength(
				1,
			);
		} finally {
			await directory.close();
		}
	});

	it("promotes the longest-tenured remaining Member when the last Owner leaves", async () => {
		const directory = await createTestDirectoryDb();
		const analytics = analyticsFixture();
		const service = memberService(directory.db, analytics);

		try {
			await seedMembers(directory.db, [
				{ id: "mbr_owner", userId: "usr_owner", role: "owner", joinedAt: 1 },
				{ id: "mbr_newer", userId: "usr_newer", role: "member", joinedAt: 30 },
				{
					id: "mbr_older_b",
					userId: "usr_older_b",
					role: "member",
					joinedAt: 10,
				},
				{
					id: "mbr_older_a",
					userId: "usr_older_a",
					role: "member",
					joinedAt: 10,
				},
			]);

			await expect(
				service.leaveHousehold({ householdId: "hh_1", userId: "usr_owner" }),
			).resolves.toEqual({ promotedMembershipId: "mbr_older_a" });

			const [promoted] = await directory.db
				.select()
				.from(memberships)
				.where(eq(memberships.id, "mbr_older_a"));
			expect(promoted?.role).toBe("owner");
			expect(analytics.track).toHaveBeenCalledWith("household_left", {
				household_id: "hh_1",
				user_id: "usr_owner",
				promoted_membership_id: "mbr_older_a",
			});
		} finally {
			await directory.close();
		}
	});

	it("rejects leaving as the sole Member", async () => {
		const directory = await createTestDirectoryDb();
		const service = memberService(directory.db);

		try {
			await seedMembers(directory.db, [
				{ id: "mbr_owner", userId: "usr_owner", role: "owner", joinedAt: 1 },
			]);

			await expect(
				service.leaveHousehold({ householdId: "hh_1", userId: "usr_owner" }),
			).rejects.toBeInstanceOf(SoleMemberError);
		} finally {
			await directory.close();
		}
	});

	it("ignores removed Memberships when computing last Owner and promotion tenure", async () => {
		const directory = await createTestDirectoryDb();
		const service = memberService(directory.db);

		try {
			await seedMembers(directory.db, [
				{ id: "mbr_owner", userId: "usr_owner", role: "owner", joinedAt: 1 },
				{
					id: "mbr_removed_owner",
					userId: "usr_removed_owner",
					role: "owner",
					joinedAt: 2,
					removedAt: 5,
				},
				{
					id: "mbr_removed_old",
					userId: "usr_removed_old",
					role: "member",
					joinedAt: 3,
					removedAt: 5,
				},
				{ id: "mbr_active", userId: "usr_active", role: "member", joinedAt: 4 },
			]);

			await expect(
				service.changeMemberRole({
					householdId: "hh_1",
					membershipId: "mbr_owner",
					role: "member",
					requestedByUserId: "usr_owner",
				}),
			).rejects.toBeInstanceOf(LastOwnerError);
			await expect(
				service.leaveHousehold({ householdId: "hh_1", userId: "usr_owner" }),
			).resolves.toEqual({ promotedMembershipId: "mbr_active" });
		} finally {
			await directory.close();
		}
	});

	it("does not list or mutate Memberships for deleted Households", async () => {
		const directory = await createTestDirectoryDb();
		const service = memberService(directory.db);

		try {
			await seedMembers(directory.db, [
				{ id: "mbr_owner", userId: "usr_owner", role: "owner", joinedAt: 1 },
				{ id: "mbr_member", userId: "usr_member", role: "member", joinedAt: 2 },
			]);
			await directory.db
				.update(households)
				.set({ deletedAt: 50 })
				.where(eq(households.id, "hh_1"));

			await expect(service.listHouseholdMembers("hh_1")).resolves.toEqual([]);
			await expect(
				service.removeMember({
					householdId: "hh_1",
					membershipId: "mbr_member",
					requestedByUserId: "usr_owner",
				}),
			).rejects.toBeInstanceOf(MemberManagementForbiddenError);
			await expect(
				service.changeMemberRole({
					householdId: "hh_1",
					membershipId: "mbr_member",
					role: "owner",
					requestedByUserId: "usr_owner",
				}),
			).rejects.toBeInstanceOf(MemberManagementForbiddenError);
			await expect(
				service.leaveHousehold({ householdId: "hh_1", userId: "usr_owner" }),
			).rejects.toThrow("Member not found.");
		} finally {
			await directory.close();
		}
	});
});

async function seedMembers(
	directory: DirectoryDb,
	membershipRows: {
		id: string;
		userId: string;
		role: "owner" | "member";
		joinedAt: number;
		removedAt?: number;
	}[],
) {
	await directory.insert(users).values(
		membershipRows.map((membership) => ({
			id: membership.userId,
			clerkUserId: membership.userId.replace("usr_", "clerk_"),
			displayName: displayName(membership.userId),
		})),
	);
	await directory.insert(households).values({
		id: "hh_1",
		name: "River House",
		tursoDbName: "db-river",
		createdByUserId: membershipRows[0]?.userId ?? "usr_owner",
		provisioningCompletedAt: 1,
		createdAt: 1,
	});
	await directory.insert(memberships).values(
		membershipRows.map((membership) => ({
			id: membership.id,
			householdId: "hh_1",
			userId: membership.userId,
			role: membership.role,
			joinedAt: membership.joinedAt,
			removedAt: membership.removedAt ?? null,
		})),
	);
}

function displayName(userId: string): string {
	return userId
		.replace("usr_", "")
		.split("_")
		.map((part) => part[0]?.toUpperCase() + part.slice(1))
		.join(" ");
}

function analyticsFixture() {
	return { track: jest.fn() };
}

function memberService(directory: DirectoryDb, analytics = analyticsFixture()) {
	return createMemberService({ directory, analytics });
}
