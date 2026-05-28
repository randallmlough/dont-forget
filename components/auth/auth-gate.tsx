import { useAuth } from "@clerk/clerk-expo";
import { Stack, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { useAnalyticsIdentity } from "@/lib/analytics";
import { readCachedSessionBootstrap } from "@/lib/services/session";

const AUTH_PATHS = new Set(["/sign-in", "/sign-up"]);

type CachedSessionStatus = "checking" | "available" | "unavailable";

export function AuthGate({ pathname }: { pathname: string }) {
	const { isSignedIn, isLoaded } = useAuth();
	const router = useRouter();
	const onAuthScreen = AUTH_PATHS.has(pathname);
	const [cachedSessionStatus, setCachedSessionStatus] =
		useState<CachedSessionStatus>("checking");
	const hasCachedSessionBootstrap = cachedSessionStatus === "available";
	const checkedCachedSessionBootstrap = cachedSessionStatus !== "checking";

	useAnalyticsIdentity();

	useEffect(() => {
		let cancelled = false;
		setCachedSessionStatus("checking");
		if (isLoaded && !isSignedIn) {
			setCachedSessionStatus("unavailable");
			return;
		}

		void readCachedSessionBootstrap()
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
	}, [isLoaded, isSignedIn]);

	useEffect(() => {
		if (isSignedIn) {
			if (onAuthScreen) {
				router.replace("/");
			}
			return;
		}

		if (!checkedCachedSessionBootstrap) return;

		if (hasCachedSessionBootstrap) {
			if (onAuthScreen) {
				router.replace("/");
			}
			return;
		}

		if (isLoaded && !onAuthScreen) {
			router.replace("/sign-in");
		}
	}, [
		checkedCachedSessionBootstrap,
		hasCachedSessionBootstrap,
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
			!checkedCachedSessionBootstrap ||
			hasCachedSessionBootstrap
		)
			return;
		void WebBrowser.warmUpAsync();
		return () => {
			void WebBrowser.coolDownAsync();
		};
	}, [
		checkedCachedSessionBootstrap,
		hasCachedSessionBootstrap,
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
