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
import { asError } from "@/lib/errors";
import { useLogger } from "@/lib/logger";
import {
	type AuthenticatedAppSession,
	type AuthenticatedAppSessionActivation,
	type AuthenticatedAppSessionController,
	type AuthenticatedAppSessionDisposal,
	type AuthenticatedAppSessionStateSnapshot,
	clearSignedOutSessionData,
	createAuthenticatedAppSessionController,
} from "@/lib/services/session";

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

type AuthenticatedAppSessionProviderAnalytics = {
	track: typeof track;
	reset: typeof reset;
};

type AuthenticatedAppSessionProviderProps = PropsWithChildren<{
	controller?: AuthenticatedAppSessionController;
	auth?: AuthenticatedAppSessionProviderAuth;
	analytics?: AuthenticatedAppSessionProviderAnalytics;
	clearSignedOutSessionData?: typeof clearSignedOutSessionData;
}>;

const defaultAnalytics: AuthenticatedAppSessionProviderAnalytics = {
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
	const signingOutRef = useRef(false);
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
		if (signingOutRef.current) return;
		void controller.activate({
			getToken,
			authReady: auth.authReady,
			signedIn: auth.signedIn,
		});
	}, [auth.authReady, auth.signedIn, controller, getToken, retryAttempt]);

	useEffect(() => {
		return () => {
			void controller.dispose().catch(() => undefined);
		};
	}, [controller]);

	const retry = useCallback(() => {
		setRetryAttempt((attempt) => attempt + 1);
	}, []);

	const signOutAction = auth.signOut;
	const signOut = useCallback(async () => {
		if (signingOutRef.current) return;
		signingOutRef.current = true;

		analytics.track("user_signed_out", {});
		analytics.reset();
		let disposal: AuthenticatedAppSessionDisposal = {
			householdIdsForLocalDataDeletion: [],
		};
		await controller
			.dispose()
			.then((nextDisposal) => {
				disposal = nextDisposal;
			})
			.catch((error) => {
				logger.error("authenticated app session sign-out dispose failed", {
					error: asError(error),
				});
			});

		try {
			await clearSignedOutSessionDataProp(
				disposal.householdIdsForLocalDataDeletion,
			);
		} catch (error) {
			logger.error("authenticated app session sign-out local cleanup failed", {
				error: asError(error),
			});
		}

		try {
			await signOutAction();
		} catch (error) {
			if (auth.authReady && auth.signedIn) {
				await controller
					.activate({
						getToken,
						authReady: auth.authReady,
						signedIn: auth.signedIn,
					})
					.catch((activationError) => {
						logger.error("authenticated app session sign-out recovery failed", {
							error: asError(activationError),
						});
					});
			}
			throw error;
		} finally {
			signingOutRef.current = false;
		}
	}, [
		analytics,
		auth.authReady,
		auth.signedIn,
		clearSignedOutSessionDataProp,
		controller,
		getToken,
		logger,
		signOutAction,
	]);

	const value = useMemo<AuthenticatedAppSessionContextValue>(
		() => ({
			...publicStateFromSnapshot(snapshot),
			retry,
			signOut,
		}),
		[retry, signOut, snapshot],
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
