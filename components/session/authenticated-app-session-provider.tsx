import { useAuth } from "@clerk/clerk-expo";
import {
	createContext,
	type PropsWithChildren,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { reset, track } from "@/lib/analytics";
import { useLogger } from "@/lib/logger";
import {
	type AuthenticatedAppSession,
	type AuthenticatedAppSessionActivation,
	type AuthenticatedAppSessionController,
	type AuthenticatedAppSessionSignOut,
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
	retry: () => void;
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
}: AuthenticatedAppSessionProviderProps) {
	const clerkAuth = useAuth();
	const logger = useLogger();
	const auth = useMemo(
		() =>
			authProp ?? {
				getToken: clerkAuth.getToken,
				authReady: clerkAuth.isLoaded,
				signedIn: Boolean(clerkAuth.isSignedIn),
				signOut: clerkAuth.signOut,
			},
		[
			authProp,
			clerkAuth.getToken,
			clerkAuth.isLoaded,
			clerkAuth.isSignedIn,
			clerkAuth.signOut,
		],
	);
	const controllerRef = useRef<AuthenticatedAppSessionController | null>(null);
	controllerRef.current ??=
		controllerProp ?? createAuthenticatedAppSessionController();
	const controller = controllerRef.current;
	const [snapshot, setSnapshot] =
		useState<AuthenticatedAppSessionStateSnapshot>(() =>
			controller.getSnapshot(),
		);
	const [retryAttempt, setRetryAttempt] = useState(0);
	const authRef = useRef(auth);
	useEffect(() => {
		authRef.current = auth;
	}, [auth]);
	const signOutFlowRef = useRef<AuthenticatedAppSessionSignOut | null>(null);
	signOutFlowRef.current ??= createAuthenticatedAppSessionSignOut({
		controller,
		getAuth: () => authRef.current,
		analytics,
		clearSignedOutSessionData: clearSignedOutSessionDataProp,
		logger,
	});
	const signOutFlow = signOutFlowRef.current;
	const getTokenRef = useRef(auth.getToken);
	useEffect(() => {
		getTokenRef.current = auth.getToken;
	}, [auth.getToken]);
	const getToken = useCallback(() => getTokenRef.current(), []);

	useEffect(() => {
		const subscription = controller.subscribe(setSnapshot);
		setSnapshot(controller.getSnapshot());
		return () => subscription.remove();
	}, [controller]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: retryAttempt intentionally retriggers authenticated app session activation.
	useEffect(() => {
		if (signOutFlow.isRunning()) return;
		void controller.activate({
			getToken,
			authReady: auth.authReady,
			signedIn: auth.signedIn,
		});
	}, [
		auth.authReady,
		auth.signedIn,
		controller,
		getToken,
		retryAttempt,
		signOutFlow,
	]);

	useEffect(() => {
		return () => {
			void controller.dispose().catch(() => undefined);
		};
	}, [controller]);

	const retry = useCallback(() => {
		setRetryAttempt((attempt) => attempt + 1);
	}, []);

	const value = useMemo<AuthenticatedAppSessionContextValue>(
		() => ({
			...publicStateFromSnapshot(snapshot),
			retry,
			signOut: signOutFlow.run,
		}),
		[retry, signOutFlow, snapshot],
	);

	return (
		<AuthenticatedAppSessionContext.Provider value={value}>
			{children}
		</AuthenticatedAppSessionContext.Provider>
	);
}

export function useAuthenticatedAppSession(): AuthenticatedAppSessionContextValue {
	const value = useContext(AuthenticatedAppSessionContext);
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
