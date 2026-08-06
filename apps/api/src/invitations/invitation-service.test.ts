import { eq } from "drizzle-orm";
import type { DirectoryDb } from "@dont-forget/db";
import {
	householdFixture,
	invitationFixture,
	membershipFixture,
	PRIMARY_HOUSEHOLD_SEED,
	userFixture,
} from "@dont-forget/db/fixtures";
import {
	households,
	invitations,
	memberships,
	users,
} from "@dont-forget/db/schema";
import { createTestDirectoryDb } from "@dont-forget/db/test";
import {
	createInvitationService,
	InvitationInvalidEmailError,
	InvitationMembershipRequiredError,
	InvitationUnavailableError,
} from "./invitation-service";

function createTokenGenerator(tokens: string[]) {
	return jest.fn(async () => {
		const token = tokens.shift();
		if (!token) throw new Error("No token left");
		return token;
	});
}

describe("createInvitationService", () => {
	it("creates emailed Invitations, reuses duplicate pending Invitations, and keeps failed email Invitations", async () => {
		const directory = await createTestDirectoryDb();
		const dateNow = jest.spyOn(Date, "now").mockReturnValue(1_700_000_010_000);
		const analytics = { track: jest.fn() };
		const consoleError = jest
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const emailSender = {
			sendInvitationEmail: jest.fn(async () => {
				const error = new Error(
					"resend unavailable for New.Member@Example.COM",
				);
				(error as { cause?: unknown }).cause = new Error(
					"provider rejected new.member@example.com",
				);
				throw error;
			}),
		};

		try {
			await seedInvitationHousehold(directory.db);
			const service = createInvitationService({
				directory: directory.db,
				buildAcceptUrl: ({ token }) => `app://accept/${token}`,
				generateToken: createTokenGenerator([
					"email-token",
					"link-token-1",
					"link-token-2",
				]),
				emailSender,
				analytics,
			});

			const first = await service.createInvitation({
				householdId: PRIMARY_HOUSEHOLD_SEED.household.id,
				createdByUserId: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
				email: "  New.Member@Example.COM ",
			});
			const duplicate = await service.createInvitation({
				householdId: PRIMARY_HOUSEHOLD_SEED.household.id,
				createdByUserId: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
				email: "new.member@example.com",
			});
			const firstLinkOnly = await service.createInvitation({
				householdId: PRIMARY_HOUSEHOLD_SEED.household.id,
				createdByUserId: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
			});
			const secondLinkOnly = await service.createInvitation({
				householdId: PRIMARY_HOUSEHOLD_SEED.household.id,
				createdByUserId: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
			});

			expect(first.emailDelivery).toEqual({
				status: "failed",
				message: "Invitation email could not be delivered.",
			});
			expect(consoleError).toHaveBeenCalledWith(
				"Invitation email delivery failed",
				expect.objectContaining({
					error_message: "resend unavailable for [REDACTED_EMAIL]",
					error_cause: "provider rejected [REDACTED_EMAIL]",
					error_name: "Error",
					household_id: PRIMARY_HOUSEHOLD_SEED.household.id,
					invitation_id: first.invitation.id,
				}),
			);
			expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
				"new.member@example.com",
			);
			expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
				"New.Member@Example.COM",
			);
			expect(first.invitation).toMatchObject({
				email: "new.member@example.com",
				acceptUrl: "app://accept/email-token",
			});
			expect(duplicate.reusedExisting).toBe(true);
			expect(duplicate.invitation.id).toBe(first.invitation.id);
			expect(firstLinkOnly.invitation.id).not.toBe(
				secondLinkOnly.invitation.id,
			);
			expect(firstLinkOnly.emailDelivery).toEqual({ status: "not_requested" });
			expect(emailSender.sendInvitationEmail).toHaveBeenCalledTimes(1);
			await expect(
				directory.db.select().from(invitations),
			).resolves.toHaveLength(3);
			expect(analytics.track).toHaveBeenCalledWith("invitation_created", {
				household_id: PRIMARY_HOUSEHOLD_SEED.household.id,
				creator_user_id: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
				source: "email",
				reused_existing: false,
			});
			expect(analytics.track).toHaveBeenCalledWith("invitation_created", {
				household_id: PRIMARY_HOUSEHOLD_SEED.household.id,
				creator_user_id: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
				source: "email",
				reused_existing: true,
			});
		} finally {
			consoleError.mockRestore();
			dateNow.mockRestore();
			await directory.close();
		}
	});

	it("rejects non-email Invitation recipients", async () => {
		const directory = await createTestDirectoryDb();

		try {
			await seedInvitationHousehold(directory.db);
			const service = createInvitationService({
				directory: directory.db,
				buildAcceptUrl: ({ token }) => `app://accept/${token}`,
				generateToken: createTokenGenerator(["invalid-email-token"]),
			});

			await expect(
				service.createInvitation({
					householdId: PRIMARY_HOUSEHOLD_SEED.household.id,
					createdByUserId: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
					email: "qa-hh-join-20260601-0105",
				}),
			).rejects.toBeInstanceOf(InvitationInvalidEmailError);
			await expect(
				directory.db.select().from(invitations),
			).resolves.toHaveLength(0);
		} finally {
			await directory.close();
		}
	});

	it("previews, accepts, lists, and revokes Invitations with Membership validation", async () => {
		const directory = await createTestDirectoryDb();
		const dateNow = jest.spyOn(Date, "now").mockReturnValue(1_700_000_020_000);
		const analytics = { track: jest.fn() };

		try {
			await seedInvitationHousehold(directory.db);
			await directory.db.insert(invitations).values([
				invitationFixture({
					id: "inv_pending",
					token: "pending-token",
					email: "pending@example.com",
					createdAt: 1_700_000_000_000,
					expiresAt: 1_700_000_030_000,
				}),
				invitationFixture({
					id: "inv_revoke",
					token: "revoke-token",
					email: null,
					createdAt: 1_700_000_000_001,
					expiresAt: 1_700_000_030_000,
				}),
			]);
			const service = createInvitationService({
				directory: directory.db,
				buildAcceptUrl: ({ token }) => `app://accept/${token}`,
				analytics,
			});

			await expect(
				service.listPendingInvitations({
					householdId: PRIMARY_HOUSEHOLD_SEED.household.id,
					requestedByUserId: "usr_nonmember",
				}),
			).rejects.toBeInstanceOf(InvitationMembershipRequiredError);
			await expect(service.previewInvitation("pending-token")).resolves.toEqual(
				{
					available: true,
					householdName: PRIMARY_HOUSEHOLD_SEED.household.name,
					inviterDisplayName: PRIMARY_HOUSEHOLD_SEED.users.avery.displayName,
				},
			);
			await directory.db
				.update(users)
				.set({ displayName: "avery@example.com" })
				.where(eq(users.id, PRIMARY_HOUSEHOLD_SEED.users.avery.id));
			await expect(service.previewInvitation("pending-token")).resolves.toEqual(
				{
					available: true,
					householdName: PRIMARY_HOUSEHOLD_SEED.household.name,
					inviterDisplayName: "A Member",
				},
			);

			const pending = await service.listPendingInvitations({
				householdId: PRIMARY_HOUSEHOLD_SEED.household.id,
				requestedByUserId: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
			});
			expect(pending).toEqual([
				expect.objectContaining({
					id: "inv_pending",
					email: "pending@example.com",
					acceptUrl: "app://accept/pending-token",
				}),
				expect.objectContaining({
					id: "inv_revoke",
					email: null,
					acceptUrl: "app://accept/revoke-token",
				}),
			]);

			const accepted = await service.acceptInvitation({
				token: "pending-token",
				userId: PRIMARY_HOUSEHOLD_SEED.users.blake.id,
			});
			const revoked = await service.revokeInvitation({
				invitationId: "inv_revoke",
				revokedByUserId: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
			});

			expect(accepted).toMatchObject({
				householdId: PRIMARY_HOUSEHOLD_SEED.household.id,
				membershipRole: "member",
				membershipCreated: true,
				activeHouseholdId: PRIMARY_HOUSEHOLD_SEED.household.id,
			});
			expect(revoked).toMatchObject({
				id: "inv_revoke",
				revokedAt: 1_700_000_020_000,
			});
			await expect(
				service.acceptInvitation({
					token: "pending-token",
					userId: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
				}),
			).rejects.toBeInstanceOf(InvitationUnavailableError);
			const [blake] = await directory.db
				.select()
				.from(users)
				.where(eq(users.id, PRIMARY_HOUSEHOLD_SEED.users.blake.id));
			expect(blake?.activeHouseholdId).toBe(
				PRIMARY_HOUSEHOLD_SEED.household.id,
			);
			await expect(
				directory.db.select().from(memberships),
			).resolves.toHaveLength(2);
			expect(analytics.track).toHaveBeenCalledWith("invitation_accepted", {
				household_id: PRIMARY_HOUSEHOLD_SEED.household.id,
				user_id: PRIMARY_HOUSEHOLD_SEED.users.blake.id,
				membership_created: true,
			});
			expect(analytics.track).toHaveBeenCalledWith("invitation_revoked", {
				household_id: PRIMARY_HOUSEHOLD_SEED.household.id,
				revoked_by_user_id: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
			});
		} finally {
			dateNow.mockRestore();
			await directory.close();
		}
	});

	it("accepts a valid Invitation idempotently for an existing Member", async () => {
		const directory = await createTestDirectoryDb();
		const dateNow = jest.spyOn(Date, "now").mockReturnValue(1_700_000_020_000);

		try {
			await seedInvitationHousehold(directory.db);
			await directory.db.insert(invitations).values(
				invitationFixture({
					id: "inv_owner",
					token: "owner-token",
					email: null,
					expiresAt: 1_700_000_030_000,
				}),
			);
			const service = createInvitationService({
				directory: directory.db,
				buildAcceptUrl: testAcceptUrl,
				analytics: { track: jest.fn() },
			});

			const accepted = await service.acceptInvitation({
				token: "owner-token",
				userId: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
			});

			expect(accepted).toMatchObject({
				membershipId: PRIMARY_HOUSEHOLD_SEED.memberships.avery.id,
				membershipRole: "owner",
				membershipCreated: false,
			});
			await expect(
				directory.db.select().from(memberships),
			).resolves.toHaveLength(1);
		} finally {
			dateNow.mockRestore();
			await directory.close();
		}
	});

	it("retries Invitation token collisions", async () => {
		const directory = await createTestDirectoryDb();
		const dateNow = jest.spyOn(Date, "now").mockReturnValue(1_700_000_010_000);

		try {
			await seedInvitationHousehold(directory.db);
			await directory.db
				.insert(invitations)
				.values(
					invitationFixture({ id: "inv_existing", token: "duplicate-token" }),
				);
			const service = createInvitationService({
				directory: directory.db,
				buildAcceptUrl: testAcceptUrl,
				generateToken: createTokenGenerator([
					"duplicate-token",
					"unique-token",
				]),
				analytics: { track: jest.fn() },
			});

			const created = await service.createInvitation({
				householdId: PRIMARY_HOUSEHOLD_SEED.household.id,
				createdByUserId: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
			});

			expect(created.invitation.acceptUrl).toContain("unique-token");
		} finally {
			dateNow.mockRestore();
			await directory.close();
		}
	});
});

async function seedInvitationHousehold(directory: DirectoryDb) {
	await directory.insert(users).values([
		userFixture({ ...PRIMARY_HOUSEHOLD_SEED.users.avery }),
		userFixture({
			...PRIMARY_HOUSEHOLD_SEED.users.blake,
			activeHouseholdId: null,
		}),
	]);
	await directory.insert(households).values(householdFixture());
	await directory.insert(memberships).values(
		membershipFixture({
			id: PRIMARY_HOUSEHOLD_SEED.memberships.avery.id,
			userId: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
			role: "owner",
		}),
	);
}

function testAcceptUrl(input: { token: string }): string {
	return `app://accept/${input.token}`;
}
