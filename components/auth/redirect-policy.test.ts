import {
	authHrefWithIntent,
	authRedirectTarget,
	internalNextPath,
} from "@/components/auth/redirect-policy";

describe("authRedirectTarget", () => {
	it("keeps public Invitation routes reachable for signed-out Users", () => {
		expect(
			authRedirectTarget({
				pathname: "/invitations/accept",
				params: { token: "tok_123" },
				isSignedIn: false,
				isAuthLoaded: true,
				checkedCachedSession: true,
				hasCachedSession: false,
			}),
		).toBeNull();
	});

	it("keeps public Household Join Code routes reachable for signed-out Users", () => {
		expect(
			authRedirectTarget({
				pathname: "/households/join",
				params: { code: "ABCDEFGH" },
				isSignedIn: false,
				isAuthLoaded: true,
				checkedCachedSession: true,
				hasCachedSession: false,
			}),
		).toBeNull();
	});

	it("redirects a signed-in User from Home to onboarding when a fresh Authenticated App Session is incomplete", () => {
		expect(
			authRedirectTarget({
				pathname: "/",
				isSignedIn: true,
				isAuthLoaded: true,
				checkedCachedSession: true,
				hasCachedSession: false,
				isAuthenticatedAppSessionReady: true,
				onboardingCompletedAt: null,
			}),
		).toBe("/onboarding");
	});

	it("does not redirect a signed-in User after onboarding is complete", () => {
		expect(
			authRedirectTarget({
				pathname: "/",
				isSignedIn: true,
				isAuthLoaded: true,
				checkedCachedSession: true,
				hasCachedSession: false,
				isAuthenticatedAppSessionReady: true,
				onboardingCompletedAt: 1_700_000_000_000,
			}),
		).toBeNull();
	});

	it("does not redirect from cached Authenticated App Session startup", () => {
		expect(
			authRedirectTarget({
				pathname: "/",
				isSignedIn: false,
				isAuthLoaded: false,
				checkedCachedSession: true,
				hasCachedSession: true,
				isAuthenticatedAppSessionReady: true,
				onboardingCompletedAt: null,
			}),
		).toBeNull();
	});

	it("does not redirect while already on onboarding", () => {
		expect(
			authRedirectTarget({
				pathname: "/onboarding",
				isSignedIn: true,
				isAuthLoaded: true,
				checkedCachedSession: true,
				hasCachedSession: false,
				isAuthenticatedAppSessionReady: true,
				onboardingCompletedAt: null,
			}),
		).toBeNull();
	});

	it("preserves safe internal next targets for signed-in Users on auth routes", () => {
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

	it("preserves public Invitation intent for signed-in Users on auth routes", () => {
		expect(
			authRedirectTarget({
				pathname: "/sign-in",
				params: { next: "/invitations/accept", token: "tok_123" },
				isSignedIn: true,
				isAuthLoaded: true,
				checkedCachedSession: true,
				hasCachedSession: false,
			}),
		).toBe("/invitations/accept?token=tok_123");
	});

	it("preserves public Household Join Code intent for signed-in Users on auth routes", () => {
		expect(
			authRedirectTarget({
				pathname: "/sign-up",
				params: { next: "/households/join", code: "ABCDEFGH" },
				isSignedIn: true,
				isAuthLoaded: true,
				checkedCachedSession: true,
				hasCachedSession: false,
			}),
		).toBe("/households/join?code=ABCDEFGH");
	});

	it("preserves public route intent for Users with cached Authenticated App Sessions", () => {
		expect(
			authRedirectTarget({
				pathname: "/sign-in",
				params: { next: "/invitations/accept", token: "tok_123" },
				isSignedIn: false,
				isAuthLoaded: false,
				checkedCachedSession: true,
				hasCachedSession: true,
			}),
		).toBe("/invitations/accept?token=tok_123");

		expect(
			authRedirectTarget({
				pathname: "/sign-up",
				params: { next: "/households/join", code: "ABCDEFGH" },
				isSignedIn: false,
				isAuthLoaded: false,
				checkedCachedSession: true,
				hasCachedSession: true,
			}),
		).toBe("/households/join?code=ABCDEFGH");
	});

	it("sends Users with cached Authenticated App Sessions from auth routes to Home", () => {
		expect(
			authRedirectTarget({
				pathname: "/sign-up",
				params: { next: "/household/settings" },
				isSignedIn: false,
				isAuthLoaded: false,
				checkedCachedSession: true,
				hasCachedSession: true,
			}),
		).toBe("/");
	});

	it("rejects external and malformed next targets", () => {
		expect(internalNextPath("https://example.com")).toBeNull();
		expect(internalNextPath("//example.com")).toBeNull();
		expect(internalNextPath("household/settings")).toBeNull();
	});

	it("strips nested bearer params from next targets", () => {
		expect(
			internalNextPath("/invitations/accept?token=tok_123&tab=preview"),
		).toBe("/invitations/accept?tab=preview");
		expect(internalNextPath("/households/join?code=ABCDEFGH")).toBe(
			"/households/join",
		);
		expect(internalNextPath("/household/settings?tab=members")).toBe(
			"/household/settings?tab=members",
		);
		expect(
			internalNextPath(
				"/household/settings?tab=members&access_token=secret-token&api_key=key-secret",
			),
		).toBe("/household/settings?tab=members");
	});

	it("ignores nested public route secrets when signed-in Users leave auth routes", () => {
		expect(
			authRedirectTarget({
				pathname: "/sign-in",
				params: { next: "/invitations/accept?token=tok_123" },
				isSignedIn: true,
				isAuthLoaded: true,
				checkedCachedSession: true,
				hasCachedSession: false,
			}),
		).toBe("/invitations/accept");
	});

	it("preserves safe intent when linking between auth screens", () => {
		expect(
			authHrefWithIntent("/sign-up", {
				next: "/invitations/accept",
				token: "tok_123",
			}),
		).toBe("/sign-up?next=%2Finvitations%2Faccept&token=tok_123");
	});
});
