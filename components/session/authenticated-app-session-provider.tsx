import { useAuth } from "@clerk/clerk-expo";
import {
	createContext,
	type PropsWithChildren,
	use,
	useEffect,
	useEffectEvent,
	useReducer,
	useRef,
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
import { clearSignedOutSessionData } from "@/lib/services/session/cache";

export type AuthenticatedAppSessionState =
	| { status: "loading" }
	| { status: "ready"; refreshing: boolean }
	| { status: "error"; message: string };

export type AuthenticatedAppSessionReloadOptions = {
	activeHouseholdChanged?: boolean;
};

export type AuthenticatedAppSessionContextValue = {
	state: AuthenticatedAppSessionState;
	session: AuthenticatedAppSession | null;
	retry: () => void;
	reloadSession: (options?: AuthenticatedAppSessionReloadOptions) => void;
	signOut: () => Promise<void>;
};

type AuthenticatedAppSessionProviderAuth = AuthenticatedAppSessionActivation & {
	signOut: () => Promise<void>;
};

type AuthenticatedAppSessionProviderProps = PropsWithChildren<{
	controller?: AuthenticatedAppSessionController;
	auth?: AuthenticatedAppSessionProviderAuth;
	analytics?: AuthenticatedAppSessionSignOutAnalytics;
	clearSignedOutSessionData?: typeof clearSignedOutSessionData;
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
	clearSignedOutSessionData:
		clearSignedOutSessionDataProp = clearSignedOutSessionData,
	activationEnabled = true,
}: AuthenticatedAppSessionProviderProps) {
	const clerkAuth = useAuth();
	const logger = useLogger();
	const clerkGetToken = clerkAuth.getToken;
	const clerkAuthReady = clerkAuth.isLoaded;
	const clerkSignedIn = Boolean(clerkAuth.isSignedIn);
	const clerkSignOut = clerkAuth.signOut;
	const auth = providerAuthFromClerk(authProp, {
		getToken: clerkGetToken,
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
	const [activeHouseholdChangeBoundary, setActiveHouseholdChangeBoundary] =
		useState<ActiveHouseholdChangeBoundary | null>(null);
	const activeHouseholdChangedRef = useRef(false);
	const [activationRequest, requestActivation] = useReducer(
		(attempt: number) => attempt + 1,
		0,
	);
	const [signOutRunningState] = useState(() => ({ running: false }));
	const getToken = useEffectEvent(() => auth.getToken());
	const signOutFlow = createAuthenticatedAppSessionSignOut({
		controller,
		getAuth: () => auth,
		analytics,
		clearSignedOutSessionData: clearSignedOutSessionDataProp,
		logger,
		runningState: signOutRunningState,
	});

	useEffect(() => {
		const subscription = controller.subscribe(setSnapshot);
		return () => subscription.remove();
	}, [controller]);

	useEffect(() => {
		if (
			!activeHouseholdChangeBoundary &&
			activeHouseholdChangedRef.current &&
			(snapshot.status === "idle" || snapshot.status === "ready")
		) {
			activeHouseholdChangedRef.current = false;
		}
		if (!activeHouseholdChangeBoundary) return;
		if (snapshot.status === "idle") {
			activeHouseholdChangedRef.current = false;
			setActiveHouseholdChangeBoundary(null);
			return;
		}
		if (
			snapshot.status === "ready" &&
			snapshot.session.resourceKey !==
				activeHouseholdChangeBoundary.previousResourceKey
		) {
			activeHouseholdChangedRef.current = false;
			setActiveHouseholdChangeBoundary(null);
		}
	}, [activeHouseholdChangeBoundary, snapshot]);

	useEffect(() => {
		if (signOutRunningState.running) return;
		if (!activationEnabled && activationRequest === 0) return;
		void controller.activate({
			getToken,
			authReady,
			signedIn,
			activeHouseholdChanged: activeHouseholdChangedRef.current,
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps -- getToken is a React Effect Event that supplies the latest token callback without reactivating on token identity changes.
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
		requestSessionActivation(
			activeHouseholdChangeBoundary
				? { activeHouseholdChanged: true }
				: undefined,
		);
	}

	function reloadSession(options?: AuthenticatedAppSessionReloadOptions) {
		if (options?.activeHouseholdChanged) {
			const currentSession = currentSessionFromSnapshot(snapshot);
			setActiveHouseholdChangeBoundary(
				currentSession
					? { previousResourceKey: currentSession.resourceKey }
					: null,
			);
		}
		requestSessionActivation(options);
	}

	function requestSessionActivation(
		options: AuthenticatedAppSessionReloadOptions | undefined,
	) {
		activeHouseholdChangedRef.current =
			options?.activeHouseholdChanged === true;
		requestActivation();
	}

	const value: AuthenticatedAppSessionContextValue = {
		...publicStateFromSnapshot(snapshot, activeHouseholdChangeBoundary),
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
	activeHouseholdChangeBoundary: ActiveHouseholdChangeBoundary | null,
): {
	state: AuthenticatedAppSessionState;
	session: AuthenticatedAppSession | null;
} {
	if (
		activeHouseholdChangeBoundary &&
		snapshotReferencesPreviousActiveHousehold(
			snapshot,
			activeHouseholdChangeBoundary,
		)
	) {
		return { state: { status: "loading" }, session: null };
	}

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

type ActiveHouseholdChangeBoundary = {
	previousResourceKey: string;
};

function snapshotReferencesPreviousActiveHousehold(
	snapshot: AuthenticatedAppSessionStateSnapshot,
	boundary: ActiveHouseholdChangeBoundary,
): boolean {
	if (snapshot.status === "ready") {
		return snapshot.session.resourceKey === boundary.previousResourceKey;
	}
	if (snapshot.status === "loading") {
		return snapshot.previous?.resourceKey === boundary.previousResourceKey;
	}
	return false;
}

function currentSessionFromSnapshot(
	snapshot: AuthenticatedAppSessionStateSnapshot,
): AuthenticatedAppSession | undefined {
	if (snapshot.status === "ready") return snapshot.session;
	if (snapshot.status === "loading" || snapshot.status === "error") {
		return snapshot.previous;
	}
	return undefined;
}
