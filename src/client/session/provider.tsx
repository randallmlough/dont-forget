import { useAuth } from "@clerk/clerk-expo";
import {
	createContext,
	type PropsWithChildren,
	use,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { clearUserCurrentListSelections } from "@/client/features/list/current-selection";
import { reset, track } from "@/client/lib/analytics";
import { readApiBaseUrl } from "@/client/lib/api-base-url";
import { useLogger } from "@/client/lib/logger";
import {
	createSessionBootstrapService,
	type GetSessionToken,
	type SessionBootstrap,
	type SessionBootstrapService,
} from "@/client/session/bootstrap";
import { db, PowerSyncConnector } from "@/client/session/powersync";
import { readPowerSyncUrl } from "@/client/session/powersync/powersync-url";
import {
	type AuthenticatedAppSessionSignOutAnalytics,
	createAuthenticatedAppSessionSignOut,
} from "@/client/session/sign-out";
import { asError } from "@/shared/errors";
import {
	clearAuthenticatedAppSessionPresent,
	markAuthenticatedAppSessionPresent,
} from "./session-hint";
import {
	type AuthenticatedAppSessionState,
	initialSessionMachineState,
	reduceSessionMachine,
	type SessionMachineEffect,
	type SessionMachineEvent,
	type SessionView,
} from "./session-machine";

export type AuthenticatedAppSession = SessionBootstrap;

export type { AuthenticatedAppSessionState } from "./session-machine";

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

export type AuthenticatedAppSessionProviderAuth = {
	getToken: GetSessionToken;
	getPowerSyncToken?: GetSessionToken;
	authReady: boolean;
	signedIn: boolean;
	signOut: () => Promise<void>;
};

export type AuthenticatedAppSessionConnectDatabase = (input: {
	getToken: GetSessionToken;
	getPowerSyncToken: GetSessionToken;
}) => Promise<void>;

type AuthenticatedAppSessionProviderProps = PropsWithChildren<{
	auth?: AuthenticatedAppSessionProviderAuth;
	analytics?: AuthenticatedAppSessionSignOutAnalytics;
	clearAuthenticatedAppSessionPresent?: typeof clearAuthenticatedAppSessionPresent;
	clearCurrentListSelectionsForUser?: typeof clearUserCurrentListSelections;
	activationEnabled?: boolean;
	bootstrapService?: SessionBootstrapService;
	connectDatabase?: AuthenticatedAppSessionConnectDatabase;
	disconnectAndClear?: () => Promise<void>;
}>;

const defaultAnalytics: AuthenticatedAppSessionSignOutAnalytics = {
	track,
	reset,
};

const AuthenticatedAppSessionContext =
	createContext<AuthenticatedAppSessionContextValue | null>(null);

export function AuthenticatedAppSessionProvider({
	children,
	auth: authProp,
	analytics = defaultAnalytics,
	clearAuthenticatedAppSessionPresent:
		clearAuthenticatedAppSessionPresentProp = clearAuthenticatedAppSessionPresent,
	clearCurrentListSelectionsForUser,
	activationEnabled = true,
	bootstrapService: bootstrapServiceProp,
	connectDatabase = defaultConnectDatabase,
	disconnectAndClear = () => db.disconnectAndClear(),
}: AuthenticatedAppSessionProviderProps) {
	const clerkAuth = useAuth();
	const logger = useLogger();
	const [defaultBootstrapService] = useState(() =>
		createSessionBootstrapService(),
	);
	const bootstrapService = bootstrapServiceProp ?? defaultBootstrapService;
	const clerkGetToken = clerkAuth.getToken;
	const clerkSignOut = clerkAuth.signOut;
	const defaultAuth = useMemo(
		() => ({
			getToken: clerkGetToken,
			getPowerSyncToken: () => clerkGetToken({ template: "powersync" }),
			authReady: clerkAuth.isLoaded,
			signedIn: Boolean(clerkAuth.isSignedIn),
			signOut: clerkSignOut,
		}),
		[clerkAuth.isLoaded, clerkAuth.isSignedIn, clerkGetToken, clerkSignOut],
	);
	const auth = authProp ?? defaultAuth;
	const authReady = auth.authReady;
	const signedIn = auth.signedIn;
	const authRef = useRef(auth);
	const machineRef = useRef(initialSessionMachineState);
	const [view, setViewState] = useState<SessionView>(
		initialSessionMachineState.view,
	);
	const getToken = useCallback(() => authRef.current.getToken(), []);
	const getPowerSyncToken = useCallback(
		() => (authRef.current.getPowerSyncToken ?? authRef.current.getToken)(),
		[],
	);

	// The auth observation effect depends on dispatch, so keep it intentionally stable while preserving honest hook deps.
	const dispatch = useCallback(
		(event: SessionMachineEvent) => {
			function applyResult(result: ReturnType<typeof reduceSessionMachine>) {
				machineRef.current = result.state;
				setViewState(result.state.view);
				for (const effect of result.effects) {
					runEffect(effect);
				}
			}

			function runEffect(effect: SessionMachineEffect) {
				if (effect.type === "activate") {
					void executeActivation(effect.attempt, effect.allowCached);
					return;
				}
				void markAuthenticatedAppSessionPresent().catch(() => undefined);
			}

			async function executeActivation(attempt: number, allowCached: boolean) {
				try {
					const session = await bootstrapService.getSession(getToken);
					if (machineRef.current.attempt !== attempt) return;
					await connectDatabase({ getToken, getPowerSyncToken });
					applyResult(
						reduceSessionMachine(machineRef.current, {
							type: "activationSucceeded",
							attempt,
							session,
						}),
					);
				} catch (error) {
					logger.error("authenticated app session activation failed", {
						error: asError(error),
					});
					applyResult(
						reduceSessionMachine(machineRef.current, {
							type: "activationFailed",
							attempt,
							allowCached,
						}),
					);
				}
			}

			applyResult(reduceSessionMachine(machineRef.current, event));
		},
		[bootstrapService, connectDatabase, getPowerSyncToken, getToken, logger],
	);

	useEffect(() => {
		dispatch({
			type: "authStateChanged",
			authReady,
			signedIn,
			activationEnabled,
		});
	}, [authReady, signedIn, activationEnabled, dispatch]);

	useEffect(() => {
		authRef.current = auth;
	}, [auth]);

	function retry() {
		dispatch({
			type: "reloadRequested",
			mode: "normal",
			authReady: authRef.current.authReady,
			signedIn: authRef.current.signedIn,
		});
	}

	function reloadSession(options?: AuthenticatedAppSessionReloadOptions) {
		dispatch({
			type: "reloadRequested",
			mode: options?.mode ?? "normal",
			authReady: authRef.current.authReady,
			signedIn: authRef.current.signedIn,
		});
	}

	async function runSignOut() {
		if (machineRef.current.signingOut) return;
		dispatch({ type: "signOutRequested" });
		const signOutFlow = createAuthenticatedAppSessionSignOut({
			getAuth: () => authRef.current,
			analytics,
			clearAuthenticatedAppSessionPresent:
				clearAuthenticatedAppSessionPresentProp,
			clearCurrentListSelectionsForUser,
			logger,
			disconnectAndClear,
			getSessionUserId: () => machineRef.current.lastKnownUserId,
		});
		try {
			await signOutFlow.run();
			dispatch({
				type: "signOutSucceeded",
				signedIn: authRef.current.signedIn,
			});
		} catch (error) {
			dispatch({
				type: "signOutFailed",
				authReady: authRef.current.authReady,
				signedIn: authRef.current.signedIn,
			});
			throw error;
		}
	}

	const value: AuthenticatedAppSessionContextValue = {
		...view,
		retry,
		reloadSession,
		signOut: runSignOut,
	};

	return (
		<AuthenticatedAppSessionContext.Provider value={value}>
			{children}
		</AuthenticatedAppSessionContext.Provider>
	);
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

async function defaultConnectDatabase({
	getToken,
	getPowerSyncToken,
}: {
	getToken: GetSessionToken;
	getPowerSyncToken: GetSessionToken;
}) {
	await db.connect(
		new PowerSyncConnector({
			powersyncGetToken: getPowerSyncToken,
			sessionGetToken: getToken,
			apiBaseUrl: readApiBaseUrl,
			powersyncUrl: readPowerSyncUrl(),
		}),
	);
}
