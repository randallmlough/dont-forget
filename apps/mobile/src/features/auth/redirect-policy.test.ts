import {
	authHrefWithIntent,
	authRedirectTarget,
	internalNextPath,
} from "@mobile/features/auth/redirect-policy";

describe("authRedirectTarget", () => {
	it("forces the blocked local-data recovery state to Home before public-route intent", () => {
		expect(
			authRedirectTarget({
				pathname: "/invitations/accept",
				params: { token: "tok_123" },
				isSignedIn: true,
				isAuthLoaded: true,
				cachedSessionStatus: "differentUserBlocked",
			}),
		).toBe("/");
	});

	it("keeps public Invitation routes reachable for signed-out Users", () => {
		expect(
			authRedirectTarget({
				pathname: "/invitations/accept",
				params: { token: "tok_123" },
				isSignedIn: false,
				isAuthLoaded: true,
				cachedSessionStatus: "unavailable",
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
				cachedSessionStatus: "unavailable",
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
				cachedSessionStatus: "unavailable",
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
				cachedSessionStatus: "unavailable",
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
				cachedSessionStatus: "unavailable",
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
				cachedSessionStatus: "available",
			}),
		).toBe("/invitations/accept?token=tok_123");

		expect(
			authRedirectTarget({
				pathname: "/sign-up",
				params: { next: "/households/join", code: "ABCDEFGH" },
				isSignedIn: false,
				isAuthLoaded: false,
				cachedSessionStatus: "available",
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
				cachedSessionStatus: "available",
			}),
		).toBe("/");
	});

	it("keeps sign-in reachable after cached restore failed", () => {
		expect(
			authRedirectTarget({
				pathname: "/sign-in",
				isSignedIn: false,
				isAuthLoaded: true,
				cachedSessionStatus: "restoreFailed",
			}),
		).toBeNull();
	});

	it("keeps sign-in reachable when sign-in is required", () => {
		expect(
			authRedirectTarget({
				pathname: "/sign-in",
				isSignedIn: false,
				isAuthLoaded: true,
				cachedSessionStatus: "signInRequired",
			}),
		).toBeNull();
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
				cachedSessionStatus: "unavailable",
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
