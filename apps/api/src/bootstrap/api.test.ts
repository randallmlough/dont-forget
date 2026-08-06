import type { AuthenticatedAppSessionBootstrapDeps } from "@api/bootstrap/bootstrap-service";
import {
	bootstrapAuthenticatedAppSession,
	createProductionAuthenticatedAppSessionBootstrapDeps,
} from "@api/bootstrap/bootstrap-service";
import {
	type ServerUserProfile,
	UnauthorizedError,
	verifyClerkRequest,
} from "@api/http";
import { type DirectoryDb, postgresPool } from "@dont-forget/db";
import type { BootstrapResponse } from "@dont-forget/shared";
import { handleBootstrap } from "./api";

jest.mock("@api/bootstrap/bootstrap-service", () => ({
	bootstrapAuthenticatedAppSession: jest.fn(),
	createProductionAuthenticatedAppSessionBootstrapDeps: jest.fn(),
}));
jest.mock("@dont-forget/db", () => ({
	postgresPool: jest.fn(),
}));
jest.mock("@api/http", () => ({
	UnauthorizedError: class UnauthorizedError extends Error {},
	verifyClerkRequest: jest.fn(),
}));

const profile = {
	clerkUserId: "clerk_user_1",
	email: "member@example.com",
	firstName: "Avery",
	lastName: "Chen",
	displayName: "Avery Chen",
} satisfies ServerUserProfile;

const bootstrapResponse = {
	user: {
		id: "user_1",
		email: profile.email,
		displayName: profile.displayName,
		firstName: profile.firstName,
		lastName: profile.lastName,
	},
	activeHousehold: { id: "household_1", name: "Home" },
	households: [
		{ id: "household_1", name: "Home", role: "owner", isActive: true },
	],
	activeMember: {
		id: "membership_1",
		userId: "user_1",
		role: "owner",
		displayName: profile.displayName,
	},
	members: [
		{
			membershipId: "membership_1",
			userId: "user_1",
			role: "owner",
			displayName: profile.displayName,
		},
	],
} satisfies BootstrapResponse;

describe("bootstrap API handler", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		jest.mocked(verifyClerkRequest).mockResolvedValue(profile);
		jest
			.mocked(bootstrapAuthenticatedAppSession)
			.mockResolvedValue(bootstrapResponse);
	});

	it("uses the injected directory to build the Authenticated App Session", async () => {
		// This inert adapter is sufficient because the mocked bootstrap module only
		// verifies dependency identity at this handler seam.
		const directory = Object.freeze({}) as DirectoryDb;
		const bootstrapDeps = Object.freeze(
			{},
		) as AuthenticatedAppSessionBootstrapDeps;
		jest
			.mocked(createProductionAuthenticatedAppSessionBootstrapDeps)
			.mockReturnValue(bootstrapDeps);

		const response = await handleBootstrap(
			new Request("https://api.invalid/api/bootstrap", { method: "POST" }),
			{ directory },
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual(bootstrapResponse);
		expect(
			createProductionAuthenticatedAppSessionBootstrapDeps,
		).toHaveBeenCalledWith(directory);
		expect(bootstrapAuthenticatedAppSession).toHaveBeenCalledWith(
			profile,
			bootstrapDeps,
		);
		expect(postgresPool).not.toHaveBeenCalled();
	});

	it("returns 401 for an invalid Clerk session", async () => {
		jest
			.mocked(verifyClerkRequest)
			.mockRejectedValue(new UnauthorizedError("Invalid Clerk session token"));
		const directory = Object.freeze({}) as DirectoryDb;

		const response = await handleBootstrap(
			new Request("https://api.invalid/api/bootstrap", { method: "POST" }),
			{ directory },
		);

		expect(response.status).toBe(401);
		await expect(response.json()).resolves.toEqual({
			error: "Invalid Clerk session token",
		});
		expect(bootstrapAuthenticatedAppSession).not.toHaveBeenCalled();
	});

	it("has no Pool fallback when required dependencies are absent at runtime", async () => {
		const consoleError = jest
			.spyOn(console, "error")
			.mockImplementation(() => {});
		jest.mocked(postgresPool).mockImplementation(() => {
			throw new Error("legacy Pool fallback reached");
		});

		try {
			const response = await Reflect.apply(handleBootstrap, undefined, [
				new Request("https://api.invalid/api/bootstrap", { method: "POST" }),
			]);

			expect(response.status).toBe(500);
			expect(postgresPool).not.toHaveBeenCalled();
		} finally {
			consoleError.mockRestore();
		}
	});
});
