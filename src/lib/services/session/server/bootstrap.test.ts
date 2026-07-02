import { eq } from "drizzle-orm";
import { households, memberships, users } from "@/server/db/schema/postgres";
import { createTestDirectoryDb } from "@/server/db/test";
import type { ServerUserProfile } from "@/server/http";
import {
	type AuthenticatedAppSessionBootstrapDeps,
	bootstrapAuthenticatedAppSession,
} from "./bootstrap";

describe("bootstrapAuthenticatedAppSession", () => {
	it("creates a first-run User, Household, Owner Membership, and active selection", async () => {
		const harness = await createBootstrapHarness();
		const random = jest.spyOn(Math, "random").mockReturnValue(0);

		try {
			const response = await bootstrapAuthenticatedAppSession(
				averyProfile,
				harness.deps,
			);

			expect(response.user).toMatchObject({
				id: expect.stringMatching(/^usr_/),
				displayName: "Avery Chen",
			});
			expect(response.activeHousehold).toEqual({
				id: expect.stringMatching(/^hh_/),
				name: "Blue Basket",
			});
			expect(response.activeMember).toMatchObject({
				id: expect.stringMatching(/^mbr_/),
				userId: response.user.id,
				role: "owner",
			});
			expect(response.households).toEqual([
				{
					id: response.activeHousehold.id,
					name: "Blue Basket",
					role: "owner",
					isActive: true,
				},
			]);

			const directoryUsers = await harness.directory.db.select().from(users);
			const directoryHouseholds = await harness.directory.db
				.select()
				.from(households);
			const directoryMemberships = await harness.directory.db
				.select()
				.from(memberships);

			expect(directoryUsers).toHaveLength(1);
			expect(directoryUsers[0]?.activeHouseholdId).toBe(
				response.activeHousehold.id,
			);
			expect(directoryHouseholds).toMatchObject([
				{
					id: response.activeHousehold.id,
					name: "Blue Basket",
					createdByUserId: response.user.id,
				},
			]);
			expect(directoryMemberships).toMatchObject([
				{
					id: response.activeMember.id,
					householdId: response.activeHousehold.id,
					userId: response.user.id,
					role: "owner",
				},
			]);
		} finally {
			random.mockRestore();
			await harness.close();
		}
	});

	it("is idempotent for repeated calls from the same Clerk User", async () => {
		const harness = await createBootstrapHarness();

		try {
			const response = await bootstrapAuthenticatedAppSession(
				averyProfile,
				harness.deps,
			);
			await bootstrapAuthenticatedAppSession(averyProfile, harness.deps);

			expect(await harness.directory.db.select().from(users)).toHaveLength(1);
			expect(await harness.directory.db.select().from(households)).toHaveLength(
				1,
			);
			expect(
				await harness.directory.db.select().from(memberships),
			).toHaveLength(1);
			expect(await activeHouseholdIdFor(harness, response.user.id)).toBe(
				response.activeHousehold.id,
			);
		} finally {
			await harness.close();
		}
	});

	it("uses the stored active Household when it is an active Membership", async () => {
		const harness = await createBootstrapHarness();

		try {
			await seedTwoHouseholds(harness, { activeHouseholdId: "hh_newer" });

			const response = await bootstrapAuthenticatedAppSession(
				averyProfile,
				harness.deps,
			);

			expect(response.activeHousehold).toEqual({
				id: "hh_newer",
				name: "Newer",
			});
			expect(response.activeMember).toMatchObject({
				id: "mbr_newer",
				role: "member",
			});
			expect(response.households).toEqual([
				{ id: "hh_older", name: "Older", role: "owner", isActive: false },
				{ id: "hh_newer", name: "Newer", role: "member", isActive: true },
			]);
			expect(await activeHouseholdIdFor(harness, "usr_existing")).toBe(
				"hh_newer",
			);
		} finally {
			await harness.close();
		}
	});

	it("repairs inactive active Household selection with the oldest active Membership", async () => {
		const harness = await createBootstrapHarness();

		try {
			await seedTwoHouseholds(harness, {
				activeHouseholdId: "hh_newer",
				newerRemovedAt: 30,
			});

			const response = await bootstrapAuthenticatedAppSession(
				averyProfile,
				harness.deps,
			);

			expect(response.activeHousehold).toEqual({
				id: "hh_older",
				name: "Older",
			});
			expect(response.activeMember).toMatchObject({
				id: "mbr_older",
				role: "owner",
			});
			expect(response.households).toEqual([
				{ id: "hh_older", name: "Older", role: "owner", isActive: true },
			]);
			expect(await activeHouseholdIdFor(harness, "usr_existing")).toBe(
				"hh_older",
			);
		} finally {
			await harness.close();
		}
	});

	it("repairs missing active Household selection with the oldest active Membership", async () => {
		const harness = await createBootstrapHarness();

		try {
			await seedTwoHouseholds(harness, {});

			const response = await bootstrapAuthenticatedAppSession(
				averyProfile,
				harness.deps,
			);

			expect(response.activeHousehold).toEqual({
				id: "hh_older",
				name: "Older",
			});
			expect(response.households).toEqual([
				{ id: "hh_older", name: "Older", role: "owner", isActive: true },
				{ id: "hh_newer", name: "Newer", role: "member", isActive: false },
			]);
			expect(await activeHouseholdIdFor(harness, "usr_existing")).toBe(
				"hh_older",
			);
		} finally {
			await harness.close();
		}
	});
});

const averyProfile: ServerUserProfile = {
	clerkUserId: "clerk_avery",
	email: "avery@example.com",
	firstName: "Avery",
	lastName: "Chen",
	displayName: "Avery Chen",
};

async function createBootstrapHarness() {
	const directory = await createTestDirectoryDb();

	const deps: AuthenticatedAppSessionBootstrapDeps = {
		directory: directory.db,
	};

	return {
		directory,
		deps,
		async close() {
			await directory.close();
		},
	};
}

async function seedTwoHouseholds(
	harness: Awaited<ReturnType<typeof createBootstrapHarness>>,
	options: { activeHouseholdId?: string; newerRemovedAt?: number },
): Promise<void> {
	await harness.directory.db.insert(users).values({
		id: "usr_existing",
		clerkUserId: "clerk_avery",
		displayName: "Old Name",
	});
	await harness.directory.db.insert(households).values([
		{
			id: "hh_newer",
			name: "Newer",
			createdByUserId: "usr_existing",
			createdAt: 1,
		},
		{
			id: "hh_older",
			name: "Older",
			createdByUserId: "usr_existing",
			createdAt: 1,
		},
	]);
	await harness.directory.db.insert(memberships).values([
		{
			id: "mbr_newer",
			householdId: "hh_newer",
			userId: "usr_existing",
			role: "member",
			joinedAt: 20,
			removedAt: options.newerRemovedAt,
		},
		{
			id: "mbr_older",
			householdId: "hh_older",
			userId: "usr_existing",
			role: "owner",
			joinedAt: 10,
		},
	]);
	if (options.activeHouseholdId) {
		await harness.directory.db
			.update(users)
			.set({ activeHouseholdId: options.activeHouseholdId })
			.where(eq(users.id, "usr_existing"));
	}
}

async function activeHouseholdIdFor(
	harness: Awaited<ReturnType<typeof createBootstrapHarness>>,
	userId: string,
): Promise<string | null | undefined> {
	const [user] = await harness.directory.db
		.select({ activeHouseholdId: users.activeHouseholdId })
		.from(users)
		.where(eq(users.id, userId));

	return user?.activeHouseholdId;
}
