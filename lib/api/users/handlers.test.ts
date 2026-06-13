import { eq } from "drizzle-orm";

import { pushTokens, users } from "@/db/schema/directory";
import { createTestDirectoryDb } from "@/db/server/test";
import type { PushTokenService } from "@/lib/services/push/server";
import { ApiUnauthorizedError } from "../shared";
import {
	handleRegisterPushToken,
	handleSendTestNotification,
	handleUnregisterPushToken,
} from "./handlers";

const testUser = {
	id: "usr_avery",
	clerkUserId: "clerk_avery",
	email: null,
	firstName: null,
	lastName: null,
	displayName: "Avery",
	activeHouseholdId: null,
	createdAt: 1,
	updatedAt: 1,
};

describe("Users API handlers", () => {
	it("requires authentication for push token registration", async () => {
		const directory = await createTestDirectoryDb();
		try {
			const response = await handleRegisterPushToken(
				jsonRequest({ expoPushToken: "ExponentPushToken[one]" }),
				{
					directory: directory.db,
					authenticate: async () => {
						throw new ApiUnauthorizedError();
					},
				},
			);

			expect(response.status).toBe(401);
		} finally {
			await directory.close();
		}
	});

	it("rejects malformed Expo push tokens", async () => {
		const directory = await createTestDirectoryDb();
		try {
			const response = await handleRegisterPushToken(
				jsonRequest({ expoPushToken: "not-a-token" }),
				{
					directory: directory.db,
					authenticate: async () => testUser,
				},
			);

			expect(response.status).toBe(400);
			await expect(response.json()).resolves.toEqual({
				error: "Invalid expoPushToken",
			});
		} finally {
			await directory.close();
		}
	});

	it("registers and unregisters the authenticated User token", async () => {
		const directory = await createTestDirectoryDb();
		try {
			await directory.db.insert(users).values({
				id: testUser.id,
				clerkUserId: testUser.clerkUserId,
				displayName: testUser.displayName,
			});

			const registerResponse = await handleRegisterPushToken(
				jsonRequest({
					expoPushToken: "ExponentPushToken[one]",
					deviceName: "Avery's iPhone",
				}),
				{
					directory: directory.db,
					authenticate: async () => testUser,
				},
			);

			expect(registerResponse.status).toBe(200);
			await expect(registerResponse.json()).resolves.toEqual({
				registered: true,
			});

			const unregisterResponse = await handleUnregisterPushToken(
				jsonRequest({ expoPushToken: "ExponentPushToken[one]" }),
				{
					directory: directory.db,
					authenticate: async () => testUser,
				},
			);

			expect(unregisterResponse.status).toBe(200);
			const [row] = await directory.db
				.select()
				.from(pushTokens)
				.where(eq(pushTokens.expoPushToken, "ExponentPushToken[one]"));
			expect(row.disabledAt).toEqual(expect.any(Number));
		} finally {
			await directory.close();
		}
	});

	it("redacts thrown push token errors before logging generic server failures", async () => {
		const directory = await createTestDirectoryDb();
		const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
		const rawExpoPushToken = "ExponentPushToken[secret-push-token]";
		const rawAuthToken = "secret-auth-token-value";
		const thrownError = new Error(
			`boom https://push.example.test/register?expoPushToken=${rawExpoPushToken}&authToken=${rawAuthToken}`,
		);
		const service: PushTokenService = {
			registerToken: jest.fn(async () => {
				throw thrownError;
			}),
			disableToken: jest.fn(),
			disableTokens: jest.fn(),
			listActiveTokensForUsers: jest.fn(),
		};

		try {
			const response = await handleRegisterPushToken(
				jsonRequest({ expoPushToken: rawExpoPushToken }),
				{
					directory: directory.db,
					authenticate: async () => testUser,
					createPushTokenService: () => service,
				},
			);

			expect(response.status).toBe(500);
			await expect(response.json()).resolves.toEqual({
				error: "Something went wrong.",
			});
			expect(errorSpy).toHaveBeenCalledWith(
				"Register push token API failed",
				expect.objectContaining({
					error_message: expect.stringContaining("[REDACTED]"),
				}),
			);
			const loggedAttributes = JSON.stringify(errorSpy.mock.calls[0]?.[1]);
			expect(loggedAttributes).not.toContain(rawExpoPushToken);
			expect(loggedAttributes).not.toContain(rawAuthToken);
			expect(loggedAttributes).toContain("error_message");
		} finally {
			errorSpy.mockRestore();
			await directory.close();
		}
	});

	it("returns 404 for test notifications in production", async () => {
		const response = await handleSendTestNotification(
			new Request("http://test"),
			{
				appEnv: "production",
			},
		);

		expect(response.status).toBe(404);
	});

	it("sends test notifications and disables dead tokens outside production", async () => {
		const directory = await createTestDirectoryDb();
		const sendPushNotifications = jest.fn(async () => ({
			deadTokens: ["ExponentPushToken[one]"],
		}));

		try {
			await directory.db.insert(users).values({
				id: testUser.id,
				clerkUserId: testUser.clerkUserId,
			});
			await directory.db.insert(pushTokens).values({
				id: "pst_one",
				userId: testUser.id,
				expoPushToken: "ExponentPushToken[one]",
				platform: "ios",
				createdAt: 1,
				updatedAt: 1,
			});

			const response = await handleSendTestNotification(
				new Request("http://test"),
				{
					appEnv: "local",
					directory: directory.db,
					authenticate: async () => testUser,
					sendPushNotifications,
				},
			);

			expect(response.status).toBe(200);
			await expect(response.json()).resolves.toEqual({ sent: 1, disabled: 1 });
			expect(sendPushNotifications).toHaveBeenCalledWith([
				{
					to: "ExponentPushToken[one]",
					title: "Don't Forget",
					body: "Test notification from Don't Forget",
				},
			]);
		} finally {
			await directory.close();
		}
	});
});

function jsonRequest(body: unknown): Request {
	return new Request("http://test", {
		method: "POST",
		body: JSON.stringify(body),
		headers: { "Content-Type": "application/json" },
	});
}
