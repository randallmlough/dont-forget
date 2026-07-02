import { createUsersApiClient } from "./users";

describe("createUsersApiClient", () => {
	it("updates the authenticated User name", async () => {
		const fetcher = jest.fn(async () =>
			Response.json({
				user: {
					id: "usr_avery",
					email: "avery@example.com",
					displayName: "Avery Lough",
					firstName: "Avery",
					lastName: "Lough",
				},
			}),
		);
		const client = createUsersApiClient({
			getToken: async () => "session-token",
			fetcher,
			apiBaseUrl: () => "https://api.example.test",
		});

		await expect(
			client.updateUserName({ firstName: "Avery", lastName: "Lough" }),
		).resolves.toEqual({
			id: "usr_avery",
			email: "avery@example.com",
			displayName: "Avery Lough",
			firstName: "Avery",
			lastName: "Lough",
		});
		expect(fetcher).toHaveBeenCalledWith(
			"https://api.example.test/api/users/me",
			expect.objectContaining({
				method: "PATCH",
				body: JSON.stringify({ firstName: "Avery", lastName: "Lough" }),
			}),
		);
	});

	it("surfaces API error messages", async () => {
		const client = createUsersApiClient({
			getToken: async () => "session-token",
			fetcher: jest.fn(async () =>
				Response.json(
					{ error: "First name must be 50 characters or fewer." },
					{ status: 400 },
				),
			),
			apiBaseUrl: () => "https://api.example.test",
		});

		await expect(
			client.updateUserName({ firstName: "A".repeat(51), lastName: null }),
		).rejects.toThrow("First name must be 50 characters or fewer.");
	});
});
