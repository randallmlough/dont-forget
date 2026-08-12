import { ApiUnauthorizedError } from "@api/http";
import { createTestDirectoryDb } from "@dont-forget/db/test";
import { handleUpdateUserName } from "./api";

jest.mock("@clerk/backend", () => ({
	createClerkClient: jest.fn(),
	verifyToken: jest.fn(),
}));

const testUser = {
	id: "usr_avery",
	clerkUserId: "clerk_avery",
	email: "avery@example.com",
	firstName: "Avery",
	lastName: "Chen",
	displayName: "Avery Chen",
	activeHouseholdId: null,
	createdAt: 1,
	updatedAt: 1,
};

describe("Users API handlers", () => {
	it("requires authentication for User name updates", async () => {
		const directory = await createTestDirectoryDb();
		try {
			const response = await handleUpdateUserName(
				jsonRequest({ firstName: "Avery", lastName: "Lough" }),
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

	it("updates the authenticated User name", async () => {
		const directory = await createTestDirectoryDb();
		const updateClerkUserName = jest.fn(async () => ({
			clerkUserId: "clerk_avery",
			email: "avery@example.com",
			firstName: "Avery",
			lastName: "Lough",
			displayName: "Avery Lough",
		}));

		try {
			const response = await handleUpdateUserName(
				jsonRequest({ firstName: " Avery ", lastName: " Lough " }),
				{
					directory: directory.db,
					authenticate: async () => testUser,
					updateClerkUserName,
				},
			);

			expect(response.status).toBe(200);
			expect(updateClerkUserName).toHaveBeenCalledWith({
				clerkUserId: "clerk_avery",
				firstName: "Avery",
				lastName: "Lough",
			});
			await expect(response.json()).resolves.toEqual({
				user: {
					id: expect.any(String),
					email: "avery@example.com",
					displayName: "Avery Lough",
					firstName: "Avery",
					lastName: "Lough",
				},
			});
		} finally {
			await directory.close();
		}
	});

	it("rejects empty and overlong User names", async () => {
		const directory = await createTestDirectoryDb();
		try {
			const emptyResponse = await handleUpdateUserName(
				jsonRequest({ firstName: " ", lastName: null }),
				{
					directory: directory.db,
					authenticate: async () => testUser,
				},
			);
			const longResponse = await handleUpdateUserName(
				jsonRequest({ firstName: "A".repeat(51), lastName: null }),
				{
					directory: directory.db,
					authenticate: async () => testUser,
				},
			);

			expect(emptyResponse.status).toBe(400);
			await expect(emptyResponse.json()).resolves.toEqual({
				error: "Provide a first or last name",
			});
			expect(longResponse.status).toBe(400);
			await expect(longResponse.json()).resolves.toEqual({
				error: "First name must be 50 characters or fewer.",
			});
		} finally {
			await directory.close();
		}
	});
});

function jsonRequest(body: unknown): Request {
	return new Request("http://test", {
		method: "PATCH",
		body: JSON.stringify(body),
		headers: { "content-type": "application/json" },
	});
}
