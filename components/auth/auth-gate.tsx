import { useAuth } from "@clerk/clerk-expo";
import { Stack, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { useAnalyticsIdentity } from "@/lib/analytics";
import { readCachedHouseholdSession } from "@/lib/services/household";

const AUTH_PATHS = new Set(["/sign-in", "/sign-up"]);

type CachedSessionStatus = "checking" | "available" | "unavailable";

export function AuthGate({ pathname }: { pathname: string }) {
	const { isSignedIn, isLoaded } = useAuth();
	const router = useRouter();
	const onAuthScreen = AUTH_PATHS.has(pathname);
	const [cachedSessionStatus, setCachedSessionStatus] =
		useState<CachedSessionStatus>("checking");
	const hasCachedHouseholdSession = cachedSessionStatus === "available";
	const checkedCachedHouseholdSession = cachedSessionStatus !== "checking";

	useAnalyticsIdentity();

	// biome-ignore lint/correctness/useExhaustiveDependencies: isSignedIn intentionally retriggers cached Household session checks after auth state changes.
	useEffect(() => {
		let cancelled = false;
		setCachedSessionStatus("checking");

		void readCachedHouseholdSession()
			.then((cached) => {
				if (!cancelled) {
					setCachedSessionStatus(cached ? "available" : "unavailable");
				}
			})
			.catch(() => {
				if (!cancelled) {
					setCachedSessionStatus("unavailable");
				}
			});

		return () => {
			cancelled = true;
		};
	}, [isSignedIn]);

	useEffect(() => {
		if (isSignedIn) {
			if (onAuthScreen) {
				router.replace("/");
			}
			return;
		}

		if (!checkedCachedHouseholdSession) return;

		if (hasCachedHouseholdSession) {
			if (onAuthScreen) {
				router.replace("/");
			}
			return;
		}

		if (isLoaded && !onAuthScreen) {
			router.replace("/sign-in");
		}
	}, [
		checkedCachedHouseholdSession,
		hasCachedHouseholdSession,
		isLoaded,
		isSignedIn,
		onAuthScreen,
		router,
	]);

	// Warm up the OAuth browser once while truly signed-out so the first SSO tap is snappy.
	// Hoisted out of the auth screens so swapping sign-in ↔ sign-up doesn't thrash.
	useEffect(() => {
		if (
			!isLoaded ||
			isSignedIn ||
			!checkedCachedHouseholdSession ||
			hasCachedHouseholdSession
		)
			return;
		void WebBrowser.warmUpAsync();
		return () => {
			void WebBrowser.coolDownAsync();
		};
	}, [
		checkedCachedHouseholdSession,
		hasCachedHouseholdSession,
		isLoaded,
		isSignedIn,
	]);

	return (
		<Stack screenOptions={{ headerShown: false }}>
			<Stack.Screen name="(app)" />
			<Stack.Screen name="(auth)" />
		</Stack>
	);
}
