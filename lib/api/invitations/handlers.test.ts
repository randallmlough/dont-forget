import {
	PRIMARY_HOUSEHOLD_SEED,
	seedInvitationVariantsScenario,
} from "@/db/fixtures";
import { createTestDirectoryDb } from "@/db/test";
import { createInvitationService } from "@/lib/services/invitation/server";
import { createApiRequest, readJsonResponse } from "@/lib/test/api";
import { ApiUnauthorizedError, upsertAuthenticatedUser } from "../shared";
import {
	handleAcceptInvitation,
	handleCreateInvitation,
	handleListInvitations,
	handlePreviewInvitation,
	handleRevokeInvitation,
	type InvitationApiDeps,
} from "./handlers";

const now = PRIMARY_HOUSEHOLD_SEED.now + 100_000;

describe("Invitation API handlers", () => {
	it("requires auth for Invitation creation", async () => {
		const directory = await createTestDirectoryDb();
		try {
			const response = await handleCreateInvitation(
				createApiRequest({ body: { householdId: "hh_avery" } }),
				{
					directory: directory.db,
					authenticate: async () => {
						throw new ApiUnauthorizedError("Missing bearer token");
					},
				},
			);

			await expect(readJsonResponse(response)).resolves.toMatchObject({
				status: 401,
				body: { error: "Missing bearer token" },
			});
		} finally {
			await directory.close();
		}
	});

	it("creates, lists, previews, accepts, and revokes Invitations", async () => {
		const directory = await createTestDirectoryDb();
		const dateNow = jest.spyOn(Date, "now").mockReturnValue(now);
		const analytics = { track: jest.fn() };

		try {
			const scenario = await seedInvitationVariantsScenario({
				directory: directory.db,
				now: PRIMARY_HOUSEHOLD_SEED.now,
			});
			const deps = invitationDeps({
				directory: directory.db,
				clerkUserId: scenario.users.avery.clerkUserId,
				analytics,
			});

			const created = await readJsonResponse(
				await handleCreateInvitation(
					createApiRequest({
						body: {
							householdId: scenario.household.id,
							email: " Stage5@Example.COM ",
						},
					}),
					deps,
				),
			);
			expect(created).toMatchObject({
				status: 201,
				body: {
					invitation: {
						householdId: scenario.household.id,
						email: "stage5@example.com",
						acceptUrl: "app://accept/api-token",
					},
					emailDelivery: { status: "sent" },
					reusedExisting: false,
				},
			});

			const listed = await readJsonResponse(
				await handleListInvitations(
					createApiRequest(),
					{ householdId: scenario.household.id },
					deps,
				),
			);
			expect(listed.status).toBe(200);
			expect(listed.body).toMatchObject({
				invitations: expect.arrayContaining([
					expect.objectContaining({
						id: scenario.invitations.pendingEmail.id,
						email: "new-member@example.com",
						acceptUrl: `app://accept/${scenario.invitations.pendingEmail.token}`,
					}),
				]),
			});

			await expect(
				readJsonResponse(
					await handlePreviewInvitation(
						createApiRequest({
							method: "GET",
							path: `/api/invitations/preview?token=${scenario.invitations.pendingEmail.token}`,
						}),
						deps,
					),
				),
			).resolves.toMatchObject({
				status: 200,
				body: {
					available: true,
					householdName: scenario.household.name,
					inviterDisplayName: scenario.users.avery.displayName,
				},
			});

			await expect(
				readJsonResponse(
					await handlePreviewInvitation(
						createApiRequest({
							method: "GET",
							path: `/api/invitations/preview?token=${scenario.invitations.revoked.token}`,
						}),
						deps,
					),
				),
			).resolves.toMatchObject({
				status: 404,
				body: { available: false },
			});

			const accepted = await readJsonResponse(
				await handleAcceptInvitation(
					createApiRequest({
						body: { token: scenario.invitations.pendingLink.token },
					}),
					invitationDeps({
						directory: directory.db,
						clerkUserId: "user_casey",
						analytics,
					}),
				),
			);
			expect(accepted).toMatchObject({
				status: 200,
				body: {
					invitationId: scenario.invitations.pendingLink.id,
					householdId: scenario.household.id,
					membershipRole: "member",
					membershipCreated: true,
					activeHouseholdId: scenario.household.id,
				},
			});

			const revoked = await readJsonResponse(
				await handleRevokeInvitation(
					createApiRequest({ method: "PATCH", body: { revoked: true } }),
					{ invitationId: scenario.invitations.pendingEmail.id },
					deps,
				),
			);
			expect(revoked).toMatchObject({
				status: 200,
				body: {
					invitation: {
						id: scenario.invitations.pendingEmail.id,
						revokedAt: now,
					},
				},
			});
		} finally {
			dateNow.mockRestore();
			await directory.close();
		}
	});

	it("returns forbidden when a User manages another Household's Invitations", async () => {
		const directory = await createTestDirectoryDb();
		const dateNow = jest.spyOn(Date, "now").mockReturnValue(now);

		try {
			const scenario = await seedInvitationVariantsScenario({
				directory: directory.db,
				now: PRIMARY_HOUSEHOLD_SEED.now,
			});
			const response = await handleCreateInvitation(
				createApiRequest({
					body: {
						householdId: scenario.household.id,
						email: "outsider@example.com",
					},
				}),
				invitationDeps({
					directory: directory.db,
					clerkUserId: "user_casey",
				}),
			);

			await expect(readJsonResponse(response)).resolves.toMatchObject({
				status: 403,
				body: { error: "Forbidden" },
			});
		} finally {
			dateNow.mockRestore();
			await directory.close();
		}
	});
});

function invitationDeps(input: {
	directory: InvitationApiDeps["directory"];
	clerkUserId: string;
	analytics?: { track: jest.Mock };
}): InvitationApiDeps {
	const emailSender = {
		sendInvitationEmail: jest.fn(async () => ({ status: "sent" as const })),
	};
	return {
		directory: input.directory,
		authenticate: async (_request, directory) => {
			return upsertAuthenticatedUser(
				{
					clerkUserId: input.clerkUserId,
					email: `${input.clerkUserId}@example.com`,
					firstName: "API",
					lastName: "User",
					displayName:
						input.clerkUserId === PRIMARY_HOUSEHOLD_SEED.users.avery.clerkUserId
							? PRIMARY_HOUSEHOLD_SEED.users.avery.displayName
							: "API User",
				},
				directory,
			);
		},
		createInvitationService: (directory) =>
			createInvitationService({
				directory,
				buildAcceptUrl: ({ token }) => `app://accept/${token}`,
				generateToken: async () => "api-token",
				emailSender,
				analytics: input.analytics ?? { track: jest.fn() },
			}),
	};
}
