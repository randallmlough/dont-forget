import { createClerkClient } from "@clerk/backend";
import {
	bearerToken,
	deleteClerkUser,
	UnauthorizedError,
	updateClerkUserName,
} from "@/lib/server/auth";

jest.mock("@clerk/backend", () => ({
	createClerkClient: jest.fn(),
	verifyToken: jest.fn(),
}));

jest.mock("@clerk/backend/errors", () => ({
	isClerkAPIResponseError: (error: unknown) =>
		typeof error === "object" &&
		error !== null &&
		"isClerkAPIResponseError" in error,
}));

jest.mock("@/lib/env", () => ({
	readClerkServerConfig: () => ({ appEnv: "test", secretKey: "sk_test_jest" }),
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
	it("updates Clerk first and last name and returns the derived User record", async () => {
		const updateUser = jest.fn(async () =>
			clerkUser({
				firstName: "Avery",
				lastName: "Chen",
				emailAddress: "avery@example.com",
			}),
		);
		jest
			.mocked(createClerkClient)
			.mockReturnValue(clerkClientWithUpdateUser(updateUser));

		const userRecord = await updateClerkUserName({
			clerkUserId: "user_123",
			firstName: "Avery",
			lastName: "Chen",
		});

		expect(updateUser).toHaveBeenCalledWith("user_123", {
			firstName: "Avery",
			lastName: "Chen",
		});
		expect(userRecord).toEqual({
			clerkUserId: "user_123",
			email: "avery@example.com",
			firstName: "Avery",
			lastName: "Chen",
			displayName: "Avery Chen",
		});
	});

	it("sends empty strings to Clerk when a name part is cleared", async () => {
		const updateUser = jest.fn(async () =>
			clerkUser({
				firstName: "Avery",
				lastName: null,
				emailAddress: "avery@example.com",
			}),
		);
		jest
			.mocked(createClerkClient)
			.mockReturnValue(clerkClientWithUpdateUser(updateUser));

		const userRecord = await updateClerkUserName({
			clerkUserId: "user_123",
			firstName: "Avery",
			lastName: null,
		});

		expect(updateUser).toHaveBeenCalledWith("user_123", {
			firstName: "Avery",
			lastName: "",
		});
		expect(userRecord.displayName).toBe("Avery");
	});
});

describe("deleteClerkUser", () => {
	it("deletes the Clerk User", async () => {
		const deleteUser = jest.fn(async () => clerkUser({}));
		jest
			.mocked(createClerkClient)
			.mockReturnValue(clerkClientWithUsers({ deleteUser }));

		await expect(deleteClerkUser("user_123")).resolves.toBeUndefined();

		expect(deleteUser).toHaveBeenCalledWith("user_123");
	});

	it("treats Clerk not found as already deleted", async () => {
		const deleteUser = jest.fn(async () => {
			throw clerkApiError(404);
		});
		jest
			.mocked(createClerkClient)
			.mockReturnValue(clerkClientWithUsers({ deleteUser }));

		await expect(deleteClerkUser("user_123")).resolves.toBeUndefined();
	});

	it("surfaces non-not-found Clerk delete failures", async () => {
		const deleteUser = jest.fn(async () => {
			throw clerkApiError(500);
		});
		jest
			.mocked(createClerkClient)
			.mockReturnValue(clerkClientWithUsers({ deleteUser }));

		await expect(deleteClerkUser("user_123")).rejects.toMatchObject({
			status: 500,
		});
	});
});

function clerkClientWithUpdateUser(
	updateUser: jest.Mock,
): ReturnType<typeof createClerkClient> {
	// Tests only exercise the `users.updateUser` call; the SDK client has a
	// large generated surface that is irrelevant to this boundary.
	return {
		users: { updateUser },
	} as unknown as ReturnType<typeof createClerkClient>;
}

function clerkClientWithUsers(users: {
	deleteUser?: jest.Mock;
	updateUser?: jest.Mock;
}): ReturnType<typeof createClerkClient> {
	return { users } as unknown as ReturnType<typeof createClerkClient>;
}

function clerkUser({
	firstName = null,
	lastName = null,
	emailAddress = "avery@example.com",
}: {
	firstName?: string | null;
	lastName?: string | null;
	emailAddress?: string;
}) {
	return {
		id: "user_123",
		firstName,
		lastName,
		primaryEmailAddressId: "email_123",
		emailAddresses: [{ id: "email_123", emailAddress }],
	};
}

function clerkApiError(status: number): Error & {
	isClerkAPIResponseError: true;
	status: number;
} {
	return Object.assign(new Error(`Clerk ${status}`), {
		isClerkAPIResponseError: true as const,
		status,
	});
}
