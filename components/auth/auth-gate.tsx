import { useAuth } from "@clerk/clerk-expo";
import { Stack, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useReducer } from "react";
import { useAnalyticsIdentity } from "@/lib/analytics";
import { hasCachedAuthenticatedAppSession } from "@/lib/services/session";

const AUTH_PATHS = new Set(["/sign-in", "/sign-up"]);

type CachedSessionStatus = "checking" | "available" | "unavailable";

export function AuthGate({ pathname }: { pathname: string }) {
	const { isSignedIn, isLoaded } = useAuth();
	const { replace } = useRouter();
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
		const onAuthScreen = AUTH_PATHS.has(pathname);

		if (isSignedIn) {
			if (onAuthScreen) {
				replace("/");
			}
			return;
		}

		if (!checkedCachedSession) return;

		if (hasCachedSession) {
			if (onAuthScreen) {
				replace("/");
			}
			return;
		}

		if (isLoaded && !onAuthScreen) {
			replace("/sign-in");
		}
	}, [
		checkedCachedSession,
		hasCachedSession,
		isLoaded,
		isSignedIn,
		pathname,
		replace,
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
		</Stack>
	);
}

function cachedSessionStatusReducer(
	_status: CachedSessionStatus,
	nextStatus: CachedSessionStatus,
): CachedSessionStatus {
	return nextStatus;
}
