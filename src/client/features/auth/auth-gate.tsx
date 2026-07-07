import { useAuth } from "@clerk/clerk-expo";
import { Stack, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useReducer } from "react";
import { useAnalyticsIdentity } from "@/client/lib/analytics";
import { useAuthenticatedAppSessionMeta } from "@/client/session";
import { hasAuthenticatedAppSessionHint } from "@/client/session/session-hint";
import {
	type AuthRedirectParams,
	authRedirectTarget,
	type CachedSessionRedirectStatus,
} from "./redirect-policy";

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
	const sessionMeta = useAuthenticatedAppSessionMeta();
	const [cachedSessionStatus, dispatchCachedSessionStatus] = useReducer(
		cachedSessionStatusReducer,
		"checking",
	);
	const cachedSessionRedirectStatus = cachedSessionRedirectStatusFor({
		cachedSessionStatus,
		restoreStatus: sessionMeta.restore.status,
	});

	useAnalyticsIdentity();

	useEffect(() => {
		if (isSignedIn) return;
		let cancelled = false;

		void hasAuthenticatedAppSessionHint()
			.then((hasSession) => {
				if (!cancelled) {
					dispatchCachedSessionStatus(hasSession ? "available" : "unavailable");
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
	}, [isSignedIn]);

	useEffect(() => {
		const target = authRedirectTarget({
			pathname,
			params,
			isSignedIn: Boolean(isSignedIn),
			isAuthLoaded: Boolean(isLoaded),
			cachedSessionStatus: cachedSessionRedirectStatus,
		});
		if (target) replace(target);
	}, [
		cachedSessionRedirectStatus,
		isLoaded,
		isSignedIn,
		params,
		pathname,
		replace,
	]);

	// Warm up the OAuth browser once while truly signed-out so the first SSO tap is snappy.
	// Hoisted out of the auth screens so swapping sign-in ↔ sign-up doesn't thrash.
	useEffect(() => {
		if (
			!isLoaded ||
			isSignedIn ||
			cachedSessionRedirectStatus === "checking" ||
			cachedSessionRedirectStatus === "available"
		) {
			return;
		}
		void WebBrowser.warmUpAsync();
		return () => {
			void WebBrowser.coolDownAsync();
		};
	}, [cachedSessionRedirectStatus, isLoaded, isSignedIn]);

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

function cachedSessionRedirectStatusFor({
	cachedSessionStatus,
	restoreStatus,
}: {
	cachedSessionStatus: CachedSessionStatus;
	restoreStatus: "idle" | "restoring" | "failed" | "signInRequired";
}): CachedSessionRedirectStatus {
	if (restoreStatus === "signInRequired") return "signInRequired";
	if (restoreStatus === "failed") return "restoreFailed";
	if (restoreStatus === "restoring") return "available";
	if (cachedSessionStatus === "checking") return "checking";
	if (cachedSessionStatus === "available") return "available";
	return "unavailable";
}
