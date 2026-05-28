import { households, memberships, users } from "@/db/schema/directory";
import { createTestDirectoryDb } from "@/db/test";
import { createMemberService } from "./member-service";

describe("createMemberService", () => {
	it("finds the oldest active Membership and lists authenticated app session Members", async () => {
		const directory = await createTestDirectoryDb();
		const service = createMemberService({ directory: directory.db });

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

	it("creates one Owner Membership for a pending Household", async () => {
		const directory = await createTestDirectoryDb();
		const service = createMemberService({ directory: directory.db });
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
});
