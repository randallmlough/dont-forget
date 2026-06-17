import { useAuth } from "@clerk/clerk-expo";
import { Stack, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useReducer } from "react";
import { useAuthenticatedAppSession } from "@/components/session";
import { useAnalyticsIdentity } from "@/lib/analytics";
import { hasCachedAuthenticatedAppSession } from "@/lib/services/session";
import { type AuthRedirectParams, authRedirectTarget } from "./redirect-policy";

type CachedSessionStatus = "checking" | "available" | "unavailable";

export function AuthGate({
	pathname,
	params,
}: {
	pathname: string;
	params?: AuthRedirectParams;
}) {
	const { isSignedIn, isLoaded } = useAuth();
	const { replace } = useRouter();
	const { state: sessionState, session } = useAuthenticatedAppSession();
	const [cachedSessionStatus, dispatchCachedSessionStatus] = useReducer(
		cachedSessionStatusReducer,
		"checking",
	);
	const effectiveCachedSessionStatus = isLoaded
		? "unavailable"
		: cachedSessionStatus;
	const hasCachedSession = effectiveCachedSessionStatus === "available";
	const checkedCachedSession = effectiveCachedSessionStatus !== "checking";

	useAnalyticsIdentity();

	useEffect(() => {
		if (isLoaded) return;
		let cancelled = false;

		void hasCachedAuthenticatedAppSession()
			.then((hasCachedSession) => {
				if (!cancelled) {
					dispatchCachedSessionStatus(
						hasCachedSession ? "available" : "unavailable",
					);
				}
			})
			.catch(() => {
				if (!cancelled) {
					dispatchCachedSessionStatus("unavailable");
				}
			});

		return () => {
			cancelled = true;
		};
	}, [isLoaded]);

	useEffect(() => {
		const target = authRedirectTarget({
			pathname,
			params,
			isSignedIn: Boolean(isSignedIn),
			isAuthLoaded: Boolean(isLoaded),
			checkedCachedSession,
			hasCachedSession,
			isAuthenticatedAppSessionReady: sessionState.status === "ready",
			onboardingCompletedAt: session?.user.onboardingCompletedAt,
		});
		if (target) replace(target);
	}, [
		checkedCachedSession,
		hasCachedSession,
		isLoaded,
		isSignedIn,
		params,
		pathname,
		replace,
		session,
		sessionState.status,
	]);

	// Warm up the OAuth browser once while truly signed-out so the first SSO tap is snappy.
	// Hoisted out of the auth screens so swapping sign-in ↔ sign-up doesn't thrash.
	useEffect(() => {
		if (!isLoaded || isSignedIn || !checkedCachedSession || hasCachedSession)
			return;
		void WebBrowser.warmUpAsync();
		return () => {
			void WebBrowser.coolDownAsync();
		};
	}, [checkedCachedSession, hasCachedSession, isLoaded, isSignedIn]);

	return (
		<Stack screenOptions={{ headerShown: false }}>
			<Stack.Screen name="(app)" />
			<Stack.Screen name="(auth)" />
			<Stack.Screen name="invitations/accept" />
			<Stack.Screen name="households/join" />
		</Stack>
	);
}

function cachedSessionStatusReducer(
	_status: CachedSessionStatus,
	nextStatus: CachedSessionStatus,
): CachedSessionStatus {
	return nextStatus;
}
