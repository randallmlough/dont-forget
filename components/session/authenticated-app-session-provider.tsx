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
import { clearSignedOutSessionData } from "@/lib/services/session/cache";

export type AuthenticatedAppSessionState =
	| { status: "loading" }
	| { status: "ready"; refreshing: boolean }
	| { status: "error"; message: string };

export type AuthenticatedAppSessionContextValue = {
	state: AuthenticatedAppSessionState;
	session: AuthenticatedAppSession | null;
	markOnboardingComplete: () => void;
	retry: () => void;
	reloadSession: (options?: { retireCurrent?: boolean }) => void;
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
	const [activationRequest, requestActivation] = useReducer(
		(attempt: number) => attempt + 1,
		0,
	);
	const [retiredResourceKey, setRetiredResourceKey] = useState<string | null>(
		null,
	);
	const [localOnboardingCompletions, markLocalOnboardingComplete] = useReducer(
		localOnboardingCompletionReducer,
		new Map<string, number>(),
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
		if (signOutRunningState.running) return;
		if (!activationEnabled && activationRequest === 0) return;
		void controller.activate({
			getToken,
			authReady,
			signedIn,
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

	function reloadSession(options?: { retireCurrent?: boolean }) {
		if (options?.retireCurrent && snapshot.status === "ready") {
			setRetiredResourceKey(snapshot.session.resourceKey);
		}
		requestActivation();
	}

	function markOnboardingComplete() {
		const session = previousSessionFromSnapshot(snapshot);
		if (!session) return;
		markLocalOnboardingComplete({
			userId: session.user.id,
			completedAt: Date.now(),
		});
	}

	const value: AuthenticatedAppSessionContextValue = {
		...publicStateFromSnapshot(
			snapshot,
			retiredResourceKey,
			localOnboardingCompletions,
		),
		markOnboardingComplete,
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
	retiredResourceKey: string | null = null,
	localOnboardingCompletions: ReadonlyMap<string, number> = new Map(),
): {
	state: AuthenticatedAppSessionState;
	session: AuthenticatedAppSession | null;
} {
	if (snapshot.status === "ready") {
		if (snapshot.session.resourceKey === retiredResourceKey) {
			return { state: { status: "loading" }, session: null };
		}
		return {
			state: { status: "ready", refreshing: false },
			session: sessionWithLocalOnboardingCompletion(
				snapshot.session,
				localOnboardingCompletions,
			),
		};
	}

	if (snapshot.status === "loading" && snapshot.previous) {
		if (snapshot.previous.resourceKey === retiredResourceKey) {
			return { state: { status: "loading" }, session: null };
		}
		return {
			state: { status: "ready", refreshing: true },
			session: sessionWithLocalOnboardingCompletion(
				snapshot.previous,
				localOnboardingCompletions,
			),
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

function previousSessionFromSnapshot(
	snapshot: AuthenticatedAppSessionStateSnapshot,
): AuthenticatedAppSession | null {
	if (snapshot.status === "ready") return snapshot.session;
	if (snapshot.status === "loading" || snapshot.status === "error") {
		return snapshot.previous ?? null;
	}
	return null;
}

function sessionWithLocalOnboardingCompletion(
	session: AuthenticatedAppSession,
	localOnboardingCompletions: ReadonlyMap<string, number>,
): AuthenticatedAppSession {
	if (session.user.onboardingCompletedAt !== null) return session;
	const completedAt = localOnboardingCompletions.get(session.user.id);
	if (completedAt === undefined) return session;

	return {
		...session,
		user: {
			...session.user,
			onboardingCompletedAt: completedAt,
		},
	};
}

function localOnboardingCompletionReducer(
	current: ReadonlyMap<string, number>,
	completion: { userId: string; completedAt: number },
): ReadonlyMap<string, number> {
	if (current.has(completion.userId)) return current;
	const next = new Map(current);
	next.set(completion.userId, completion.completedAt);
	return next;
}
