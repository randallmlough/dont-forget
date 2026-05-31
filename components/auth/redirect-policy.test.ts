import {
	authRedirectTarget,
	internalNextPath,
} from "@/components/auth/redirect-policy";

describe("authRedirectTarget", () => {
	it("preserves public Invitation intent for signed-out Users", () => {
		expect(
			authRedirectTarget({
				pathname: "/invitations/accept",
				params: { token: "tok_123" },
				isSignedIn: false,
				isAuthLoaded: true,
				checkedCachedSession: true,
				hasCachedSession: false,
			}),
		).toBe("/sign-in?next=%2Finvitations%2Faccept&token=tok_123");
	});

	it("preserves public Household Join Code intent for signed-out Users", () => {
		expect(
			authRedirectTarget({
				pathname: "/households/join",
				params: { code: "ABCDEFGH" },
				isSignedIn: false,
				isAuthLoaded: true,
				checkedCachedSession: true,
				hasCachedSession: false,
			}),
		).toBe("/sign-in?next=%2Fhouseholds%2Fjoin&code=ABCDEFGH");
	});

	it("sends signed-in Users from auth routes to safe internal next targets", () => {
		expect(
			authRedirectTarget({
				pathname: "/sign-in",
				params: { next: "/household/settings" },
				isSignedIn: true,
				isAuthLoaded: true,
				checkedCachedSession: true,
				hasCachedSession: false,
			}),
		).toBe("/household/settings");
	});

	it("rejects external and malformed next targets", () => {
		expect(internalNextPath("https://example.com")).toBeNull();
		expect(internalNextPath("//example.com")).toBeNull();
		expect(internalNextPath("household/settings")).toBeNull();
	});
});
