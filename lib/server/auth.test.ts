jest.mock("@clerk/backend", () => ({
	createClerkClient: jest.fn(),
	verifyToken: jest.fn(),
}));

import { bearerToken, UnauthorizedError } from "@/lib/server/auth";

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
