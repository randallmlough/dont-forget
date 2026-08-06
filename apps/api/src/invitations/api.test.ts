import {
	PRIMARY_HOUSEHOLD_SEED,
	seedInvitationVariantsScenario,
} from "@dont-forget/db/fixtures";
import { createTestDirectoryDb } from "@dont-forget/db/test";
import { ApiUnauthorizedError, upsertAuthenticatedUser } from "@api/http";
import {
	createInvitationService,
	type InvitationService,
} from "@api/invitations/invitation-service";
import { createApiRequest, readJsonResponse } from "@api/test/api";
import {
	handleAcceptInvitation,
	handleCreateInvitation,
	handleListInvitations,
	handlePreviewInvitation,
	handleRevokeInvitation,
	type InvitationApiDeps,
} from "./api";

jest.mock("@clerk/backend", () => ({
	createClerkClient: jest.fn(),
	verifyToken: jest.fn(),
}));

const now = PRIMARY_HOUSEHOLD_SEED.now + 100_000;
const TEST_PUBLIC_WEB_BASE_URL = "https://app.invalid";

describe("Invitation API handlers", () => {
	it("requires auth for Invitation creation", async () => {
		const directory = await createTestDirectoryDb();
		try {
			const response = await handleCreateInvitation(
				createApiRequest({ body: { householdId: "hh_avery" } }),
				{
					directory: directory.db,
					publicWebBaseUrl: TEST_PUBLIC_WEB_BASE_URL,
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
			for (const token of [
				scenario.invitations.accepted.token,
				scenario.invitations.expired.token,
				"missing-token",
			]) {
				await expect(
					readJsonResponse(
						await handlePreviewInvitation(
							createApiRequest({
								method: "GET",
								path: `/api/invitations/preview?token=${token}`,
							}),
							deps,
						),
					),
				).resolves.toMatchObject({
					status: 404,
					body: { available: false },
				});
			}

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
			await expect(
				readJsonResponse(
					await handleAcceptInvitation(
						createApiRequest({
							body: { token: scenario.invitations.revoked.token },
						}),
						invitationDeps({
							directory: directory.db,
							clerkUserId: "user_casey",
							analytics,
						}),
					),
				),
			).resolves.toMatchObject({
				status: 404,
				body: { error: "This Invitation is no longer available." },
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

	it("redacts thrown service errors before logging generic server failures", async () => {
		const directory = await createTestDirectoryDb();
		const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
		const thrownError = new Error(
			"boom https://db.example.com?authToken=secret-token-value user@example.com",
		);
		const service: InvitationService = {
			createInvitation: jest.fn(async () => {
				throw thrownError;
			}),
			previewInvitation: jest.fn(),
			acceptInvitation: jest.fn(),
			listPendingInvitations: jest.fn(),
			revokeInvitation: jest.fn(),
		};

		try {
			const response = await handleCreateInvitation(
				createApiRequest({ body: { householdId: "hh_avery" } }),
				{
					directory: directory.db,
					publicWebBaseUrl: TEST_PUBLIC_WEB_BASE_URL,
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
					createInvitationService: () => service,
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
		publicWebBaseUrl: TEST_PUBLIC_WEB_BASE_URL,
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
