import { createUsersApiClient } from "./users";

describe("createUsersApiClient", () => {
	it("DELETEs the current User account and parses the deleted Household count", async () => {
		let capturedInput: string | undefined;
		let capturedInit: RequestInit | undefined;
		const fetcher: typeof globalThis.fetch = async (input, init) => {
			capturedInput = input.toString();
			capturedInit = init;
			return Response.json({
				deleted: true,
				deletedHouseholdCount: 2,
			});
		};
		const client = createUsersApiClient({
			getToken: async () => "session-token",
			fetcher,
			apiBaseUrl: () => "https://api.example.test",
		});

		await expect(client.deleteAccount()).resolves.toEqual({
			deletedHouseholdCount: 2,
		});

		expect(capturedInput).toBe("https://api.example.test/api/users/me");
		expect(capturedInit).toMatchObject({ method: "DELETE" });
		const headers = capturedInit?.headers;
		expect(headers).toBeInstanceOf(Headers);
		expect((headers as Headers).get("authorization")).toBe(
			"Bearer session-token",
		);
	});

	it("PATCHes the current User profile and parses the returned profile", async () => {
		let capturedInput: string | undefined;
		let capturedInit: RequestInit | undefined;
		const fetcher: typeof globalThis.fetch = async (input, init) => {
			capturedInput = input.toString();
			capturedInit = init;
			return Response.json({
				user: {
					id: "usr_123",
					email: "avery@example.com",
					displayName: "Avery Chen",
					firstName: "Avery",
					lastName: "Chen",
				},
			});
		};
		const client = createUsersApiClient({
			getToken: async () => "session-token",
			fetcher,
			apiBaseUrl: () => "https://api.example.test",
		});

		await expect(
			client.updateProfile({ firstName: "Avery", lastName: "Chen" }),
		).resolves.toEqual({
			id: "usr_123",
			email: "avery@example.com",
			displayName: "Avery Chen",
			firstName: "Avery",
			lastName: "Chen",
		});

		expect(capturedInput).toBe("https://api.example.test/api/users/me");
		expect(capturedInit).toMatchObject({
			method: "PATCH",
			body: JSON.stringify({ firstName: "Avery", lastName: "Chen" }),
		});
		const headers = capturedInit?.headers;
		expect(headers).toBeInstanceOf(Headers);
		expect((headers as Headers).get("authorization")).toBe(
			"Bearer session-token",
		);
	});

	it("throws API error messages", async () => {
		const client = createUsersApiClient({
			getToken: async () => "session-token",
			fetcher: async () =>
				Response.json(
					{ error: "Provide a first or last name" },
					{ status: 400 },
				),
			apiBaseUrl: () => "https://api.example.test",
		});

		await expect(
			client.updateProfile({ firstName: null, lastName: null }),
		).rejects.toThrow("Provide a first or last name");
	});
});
