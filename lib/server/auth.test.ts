import { createClerkClient } from "@clerk/backend";
import {
	bearerToken,
	UnauthorizedError,
	updateClerkUserName,
} from "@/lib/server/auth";

jest.mock("@clerk/backend", () => ({
	createClerkClient: jest.fn(),
	verifyToken: jest.fn(),
}));

describe("bearerToken", () => {
	it("extracts a valid bearer token", () => {
		expect(bearerToken("Bearer session-token")).toBe("session-token");
	});

	it("rejects missing and malformed bearer tokens", () => {
		expect(() => bearerToken(null)).toThrow(UnauthorizedError);
		expect(() => bearerToken("Basic session-token")).toThrow(UnauthorizedError);
		expect(() => bearerToken("Bearer one two")).toThrow(UnauthorizedError);
	});
});

describe("updateClerkUserName", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		process.env = {
			...originalEnv,
			APP_ENV: "test",
			CLERK_SECRET_KEY: "sk_test_secret",
		};
	});

	afterEach(() => {
		process.env = originalEnv;
		jest.mocked(createClerkClient).mockReset();
	});

	it("updates Clerk and returns the normalized User profile", async () => {
		const updateUser = jest.fn(async () =>
			clerkUser({
				firstName: "Avery",
				lastName: "Lough",
			}),
		);
		const clerkClient = {
			users: { updateUser },
		};
		// @ts-expect-error Partial Clerk client mock for the updateUser seam.
		jest.mocked(createClerkClient).mockReturnValue(clerkClient);

		await expect(
			updateClerkUserName({
				clerkUserId: "clerk_avery",
				firstName: "Avery",
				lastName: "Lough",
			}),
		).resolves.toEqual({
			clerkUserId: "clerk_avery",
			email: "avery@example.com",
			firstName: "Avery",
			lastName: "Lough",
			displayName: "Avery Lough",
		});
		expect(updateUser).toHaveBeenCalledWith("clerk_avery", {
			firstName: "Avery",
			lastName: "Lough",
		});
	});

	it("sends empty strings to Clerk when clearing nullable name parts", async () => {
		const updateUser = jest.fn(async () =>
			clerkUser({
				firstName: null,
				lastName: "Lough",
			}),
		);
		const clerkClient = {
			users: { updateUser },
		};
		// @ts-expect-error Partial Clerk client mock for the updateUser seam.
		jest.mocked(createClerkClient).mockReturnValue(clerkClient);

		await updateClerkUserName({
			clerkUserId: "clerk_avery",
			firstName: null,
			lastName: "Lough",
		});

		expect(updateUser).toHaveBeenCalledWith("clerk_avery", {
			firstName: "",
			lastName: "Lough",
		});
	});
});

function clerkUser({
	firstName,
	lastName,
}: {
	firstName: string | null;
	lastName: string | null;
}) {
	return {
		id: "clerk_avery",
		firstName,
		lastName,
		primaryEmailAddressId: "email_primary",
		emailAddresses: [
			{ id: "email_primary", emailAddress: "avery@example.com" },
		],
	};
}
