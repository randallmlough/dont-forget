import { useAuth } from "@clerk/clerk-expo";
import {
	createContext,
	type PropsWithChildren,
	use,
	useEffect,
	useEffectEvent,
	useReducer,
	useState,
} from "react";
import { reset, track } from "@/lib/analytics";
import { useLogger } from "@/lib/logger";
import {
	type AuthenticatedAppSession,
	type AuthenticatedAppSessionActivation,
	type AuthenticatedAppSessionController,
	type AuthenticatedAppSessionSignOutAnalytics,
	type AuthenticatedAppSessionStateSnapshot,
	createAuthenticatedAppSessionController,
	createAuthenticatedAppSessionSignOut,
} from "@/lib/services/session";
import { clearAuthenticatedAppSessionAvailability } from "@/lib/services/session/session-hint";

export type AuthenticatedAppSessionState =
	| { status: "loading" }
	| { status: "ready"; refreshing: boolean }
	| { status: "error"; message: string };

export type AuthenticatedAppSessionContextValue = {
	state: AuthenticatedAppSessionState;
	session: AuthenticatedAppSession | null;
	retry: () => void;
	reloadSession: (options?: AuthenticatedAppSessionReloadOptions) => void;
	signOut: () => Promise<void>;
};

export type AuthenticatedAppSessionReloadOptions =
	| { mode: "freshOnly" }
	| { mode: "retireCurrent" };

type AuthenticatedAppSessionProviderAuth = AuthenticatedAppSessionActivation & {
	signOut: () => Promise<void>;
};

type AuthenticatedAppSessionProviderProps = PropsWithChildren<{
	controller?: AuthenticatedAppSessionController;
	auth?: AuthenticatedAppSessionProviderAuth;
	analytics?: AuthenticatedAppSessionSignOutAnalytics;
	clearAuthenticatedAppSessionAvailability?: typeof clearAuthenticatedAppSessionAvailability;
	activationEnabled?: boolean;
}>;

const defaultAnalytics: AuthenticatedAppSessionSignOutAnalytics = {
	track,
	reset,
};

const AuthenticatedAppSessionContext =
	createContext<AuthenticatedAppSessionContextValue | null>(null);

export function AuthenticatedAppSessionProvider({
	children,
	controller: controllerProp,
	auth: authProp,
	analytics = defaultAnalytics,
	clearAuthenticatedAppSessionAvailability:
		clearAuthenticatedAppSessionAvailabilityProp = clearAuthenticatedAppSessionAvailability,
	activationEnabled = true,
}: AuthenticatedAppSessionProviderProps) {
	const clerkAuth = useAuth();
	const logger = useLogger();
	const clerkGetToken = clerkAuth.getToken;
	const clerkGetPowerSyncToken = () =>
		clerkAuth.getToken({ template: "powersync" });
	const clerkAuthReady = clerkAuth.isLoaded;
	const clerkSignedIn = Boolean(clerkAuth.isSignedIn);
	const clerkSignOut = clerkAuth.signOut;
	const auth = providerAuthFromClerk(authProp, {
		getToken: clerkGetToken,
		getPowerSyncToken: clerkGetPowerSyncToken,
		authReady: clerkAuthReady,
		signedIn: clerkSignedIn,
		signOut: clerkSignOut,
	});
	const authReady = auth.authReady;
	const signedIn = auth.signedIn;
	const [controller] = useState<AuthenticatedAppSessionController>(
		() => controllerProp ?? createAuthenticatedAppSessionController(),
	);
	const [snapshot, setSnapshot] =
		useState<AuthenticatedAppSessionStateSnapshot>(() =>
			controller.getSnapshot(),
		);
	const [activationRequest, requestActivation] = useReducer(
		(
			_request: { attempt: number; mode: "normal" | "freshOnly" },
			mode: "normal" | "freshOnly" = "normal",
		) => ({
			attempt: _request.attempt + 1,
			mode,
		}),
		{ attempt: 0, mode: "normal" as const },
	);
	const [signOutRunningState] = useState(() => ({ running: false }));
	const getToken = useEffectEvent(() => auth.getToken());
	const getPowerSyncToken = useEffectEvent(() =>
		(auth.getPowerSyncToken ?? auth.getToken)(),
	);
	const signOutFlow = createAuthenticatedAppSessionSignOut({
		controller,
		getAuth: () => auth,
		analytics,
		clearAuthenticatedAppSessionAvailability:
			clearAuthenticatedAppSessionAvailabilityProp,
		logger,
		runningState: signOutRunningState,
	});

	useEffect(() => {
		const subscription = controller.subscribe(setSnapshot);
		return () => subscription.remove();
	}, [controller]);

	useEffect(() => {
		if (signOutRunningState.running) return;
		if (!activationEnabled && activationRequest.attempt === 0) return;
		void controller.activate({
			getToken,
			getPowerSyncToken,
			authReady,
			signedIn,
			cachePolicy:
				activationRequest.mode === "freshOnly" ? "freshOnly" : "allowCached",
		});
	}, [
		activationEnabled,
		authReady,
		signedIn,
		controller,
		activationRequest,
		signOutRunningState,
	]);

	useEffect(() => {
		return () => {
			void controller.dispose().catch(() => undefined);
		};
	}, [controller]);

	function retry() {
		requestActivation();
	}

	function reloadSession(options?: AuthenticatedAppSessionReloadOptions) {
		if (options?.mode === "retireCurrent") {
			void controller
				.invalidateCurrentSession()
				.finally(() => requestActivation("normal"));
			return;
		}
		requestActivation(options?.mode === "freshOnly" ? "freshOnly" : "normal");
	}

	const value: AuthenticatedAppSessionContextValue = {
		...publicStateFromSnapshot(snapshot),
		retry,
		reloadSession,
		signOut: signOutFlow.run,
	};

	return (
		<AuthenticatedAppSessionContext.Provider value={value}>
			{children}
		</AuthenticatedAppSessionContext.Provider>
	);
}

function providerAuthFromClerk(
	authProp: AuthenticatedAppSessionProviderAuth | undefined,
	clerkAuth: AuthenticatedAppSessionProviderAuth,
): AuthenticatedAppSessionProviderAuth {
	return authProp ?? clerkAuth;
}

export function useAuthenticatedAppSession(): AuthenticatedAppSessionContextValue {
	const value = use(AuthenticatedAppSessionContext);
	if (!value) {
		throw new Error(
			"useAuthenticatedAppSession must be used inside AuthenticatedAppSessionProvider",
		);
	}
	return value;
}

function publicStateFromSnapshot(
	snapshot: AuthenticatedAppSessionStateSnapshot,
): {
	state: AuthenticatedAppSessionState;
	session: AuthenticatedAppSession | null;
} {
	if (snapshot.status === "ready") {
		return {
			state: { status: "ready", refreshing: false },
			session: snapshot.session,
		};
	}

	if (snapshot.status === "loading" && snapshot.previous) {
		return {
			state: { status: "ready", refreshing: true },
			session: snapshot.previous,
		};
	}

	if (snapshot.status === "error") {
		return {
			state: { status: "error", message: snapshot.message },
			session: null,
		};
	}

	return { state: { status: "loading" }, session: null };
}
