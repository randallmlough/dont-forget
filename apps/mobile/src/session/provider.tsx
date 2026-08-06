import { useAuth } from "@clerk/clerk-expo";
import { asError } from "@dont-forget/shared";
import type { clearUserCurrentListSelections } from "@mobile/features/list/current-selection";
import { reset, track } from "@mobile/lib/analytics";
import { readApiBaseUrl } from "@mobile/lib/api-base-url";
import { useLogger } from "@mobile/lib/logger";
import {
	createSessionBootstrapService,
	type GetSessionToken,
	type SessionBootstrap,
	type SessionBootstrapService,
	sessionAnalyticsProperties,
} from "@mobile/session/bootstrap";
import { db, PowerSyncConnector } from "@mobile/session/powersync";
import { readPowerSyncUrl } from "@mobile/session/powersync/powersync-url";
import {
	type AuthenticatedAppSessionSignOutAnalytics,
	createAuthenticatedAppSessionSignOut,
} from "@mobile/session/sign-out";
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
import {
	clearAuthenticatedAppSessionPresent,
	persistAuthenticatedAppSession,
	readPersistedAuthenticatedAppSession,
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
	meta?: AuthenticatedAppSessionMeta;
	retry: () => void;
	reloadSession: (options?: AuthenticatedAppSessionReloadOptions) => void;
	signOut: () => Promise<void>;
};

export type AuthenticatedAppSessionMeta = {
	restore: {
		status: "idle" | "restoring" | "failed" | "signInRequired";
	};
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
	persistAuthenticatedAppSession?: typeof persistAuthenticatedAppSession;
	readPersistedAuthenticatedAppSession?: typeof readPersistedAuthenticatedAppSession;
	activationEnabled?: boolean;
	bootstrapService?: SessionBootstrapService;
	connectDatabase?: AuthenticatedAppSessionConnectDatabase;
	disconnect?: () => Promise<void>;
	disconnectAndClear?: () => Promise<void>;
}>;

type DispatchOptions = {
	awaitActivation?: boolean;
};

const defaultAnalytics: AuthenticatedAppSessionSignOutAnalytics = {
	track,
	reset,
};

let databaseOperationChain: Promise<void> = Promise.resolve();

const AuthenticatedAppSessionContext =
	createContext<AuthenticatedAppSessionContextValue | null>(null);

export function AuthenticatedAppSessionProvider({
	children,
	auth: authProp,
	analytics = defaultAnalytics,
	clearAuthenticatedAppSessionPresent:
		clearAuthenticatedAppSessionPresentProp = clearAuthenticatedAppSessionPresent,
	clearCurrentListSelectionsForUser,
	persistAuthenticatedAppSession:
		persistAuthenticatedAppSessionProp = persistAuthenticatedAppSession,
	readPersistedAuthenticatedAppSession:
		readPersistedAuthenticatedAppSessionProp = readPersistedAuthenticatedAppSession,
	activationEnabled = true,
	bootstrapService: bootstrapServiceProp,
	connectDatabase = defaultConnectDatabase,
	disconnect = defaultDisconnect,
	disconnectAndClear = defaultDisconnectAndClear,
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
	const analyticsRef = useRef(analytics);
	const machineRef = useRef(initialSessionMachineState);
	const [publishedSession, setPublishedSession] = useState(
		sessionProviderSnapshot(initialSessionMachineState),
	);
	const getToken = useCallback(() => authRef.current.getToken(), []);
	const getPowerSyncToken = useCallback(
		() => (authRef.current.getPowerSyncToken ?? authRef.current.getToken)(),
		[],
	);

	// The auth observation effect depends on dispatch, so keep it intentionally stable while preserving honest hook deps.
	const dispatch = useCallback(
		(event: SessionMachineEvent, options: DispatchOptions = {}) => {
			const activationEffects: Promise<void>[] = [];

			function applyResult(result: ReturnType<typeof reduceSessionMachine>) {
				machineRef.current = result.state;
				setPublishedSession((current) =>
					samePublishedSession(current, result.state)
						? current
						: sessionProviderSnapshot(result.state),
				);
				for (const effect of result.effects) {
					const effectResult = runEffect(effect);
					if (options.awaitActivation && effect.type === "activate") {
						activationEffects.push(effectResult);
					}
				}
			}

			function runEffect(effect: SessionMachineEffect): Promise<void> {
				if (effect.type === "activate") {
					return executeActivation(effect.attempt, effect.allowCached);
				}
				if (effect.type === "restoreSession") {
					return executeRestore(effect.attempt, effect.session);
				}
				if (effect.type === "clearSessionHint") {
					return clearAuthenticatedAppSessionPresentProp()
						.catch(() => undefined)
						.then(() => undefined);
				}
				if (effect.type === "disconnect") {
					return enqueueDatabaseOperation(disconnect).catch((error) => {
						logger.error(
							"authenticated app session stale connect disconnect failed",
							{
								error: asError(error),
							},
						);
					});
				}
				if (effect.type === "disconnectAndClear") {
					return enqueueDatabaseOperation(disconnectAndClear).catch((error) => {
						logger.error(
							"authenticated app session stale connect cleanup failed",
							{
								error: asError(error),
							},
						);
					});
				}
				if (effect.type === "trackSessionLoaded") {
					analyticsRef.current.track("authenticated_app_session_loaded", {
						...sessionAnalyticsProperties(effect.session),
						source: effect.source,
					});
					return Promise.resolve();
				}
				return persistAuthenticatedAppSessionProp(effect.session)
					.catch(() => undefined)
					.then(() => undefined);
			}

			function activationSuperseded(attempt: number): boolean {
				return machineRef.current.attempt !== attempt;
			}

			function restoredUserIdForActivation(attempt: number): string | null {
				const machine = machineRef.current;
				if (machine.pendingActivationAttempt !== attempt) return null;
				return machine.pendingActivationRestoredUserId;
			}

			async function prepareRestoredUserReplacement(
				attempt: number,
				session: SessionBootstrap,
			) {
				const restoredUserId = restoredUserIdForActivation(attempt);
				if (!restoredUserId || restoredUserId === session.user.id) return;
				if (activationSuperseded(attempt)) return;
				await clearAuthenticatedAppSessionPresentProp();
				if (activationSuperseded(attempt)) return;
				await enqueueDatabaseOperation(disconnectAndClear);
			}

			// Waits on the chain but deliberately does not extend it: a hung
			// connect (PowerSync retries on bad networks) must never block a
			// later cleanup wipe. Safe because a later disconnect aborts an
			// in-flight connect for good (@powersync/common ConnectionManager);
			// re-verify that guarantee when upgrading the SDK.
			function connectDatabaseForAttempt(attempt: number): Promise<boolean> {
				return databaseOperationChain.then(async () => {
					if (activationSuperseded(attempt)) return false;
					await connectDatabase({ getToken, getPowerSyncToken });
					return true;
				});
			}

			async function executeActivation(attempt: number, allowCached: boolean) {
				try {
					const session = await bootstrapService.getSession(getToken);
					// `attempt` is the machine's only cancellation token: consult it before
					// starting the next side effect; terminal results are always dispatched
					// and the reducer alone decides what a stale one means (including
					// undoing a stale connect).
					if (activationSuperseded(attempt)) return;
					await prepareRestoredUserReplacement(attempt, session);
					const connected = await connectDatabaseForAttempt(attempt);
					if (!connected) return;
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

			async function executeRestore(
				attempt: number,
				session: SessionBootstrap,
			) {
				try {
					if (activationSuperseded(attempt)) return;
					const connected = await connectDatabaseForAttempt(attempt);
					if (!connected) return;
					applyResult(
						reduceSessionMachine(machineRef.current, {
							type: "sessionRestoreSucceeded",
							attempt,
							session,
						}),
					);
				} catch (error) {
					logger.error("authenticated app session restore failed", {
						error: asError(error),
					});
					applyResult(
						reduceSessionMachine(machineRef.current, {
							type: "sessionRestoreFailed",
							attempt,
						}),
					);
				}
			}

			applyResult(reduceSessionMachine(machineRef.current, event));
			if (!options.awaitActivation) return Promise.resolve();
			return Promise.all(activationEffects).then(() => undefined);
		},
		[
			bootstrapService,
			clearAuthenticatedAppSessionPresentProp,
			connectDatabase,
			disconnect,
			disconnectAndClear,
			getPowerSyncToken,
			getToken,
			logger,
			persistAuthenticatedAppSessionProp,
		],
	);

	useEffect(() => {
		void dispatch({
			type: "authStateChanged",
			authReady,
			signedIn,
			activationEnabled,
		});
		if (!authReady || signedIn) return;
		let cancelled = false;

		void readPersistedAuthenticatedAppSessionProp()
			.then((session) => {
				if (cancelled || !session) return;
				void dispatch({ type: "sessionRestoreRequested", session });
			})
			.catch((error) => {
				if (cancelled) return;
				logger.error("authenticated app session restore read failed", {
					error: asError(error),
				});
			});

		return () => {
			cancelled = true;
		};
	}, [
		authReady,
		signedIn,
		activationEnabled,
		dispatch,
		logger,
		readPersistedAuthenticatedAppSessionProp,
	]);

	useEffect(() => {
		authRef.current = auth;
	}, [auth]);

	useEffect(() => {
		analyticsRef.current = analytics;
	}, [analytics]);

	function retry() {
		void dispatch({
			type: "reloadRequested",
			mode: "normal",
			authReady: authRef.current.authReady,
			signedIn: authRef.current.signedIn,
		});
	}

	function reloadSession(options?: AuthenticatedAppSessionReloadOptions) {
		void dispatch({
			type: "reloadRequested",
			mode: options?.mode ?? "normal",
			authReady: authRef.current.authReady,
			signedIn: authRef.current.signedIn,
		});
	}

	async function runSignOut() {
		if (machineRef.current.signingOut) return;
		void dispatch({ type: "signOutRequested" });
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
			void dispatch({
				type: "signOutSucceeded",
				signedIn: authRef.current.signedIn,
			});
		} catch (error) {
			await dispatch(
				{
					type: "signOutFailed",
					authReady: authRef.current.authReady,
					signedIn: authRef.current.signedIn,
				},
				{ awaitActivation: true },
			);
			throw error;
		}
	}

	const value: AuthenticatedAppSessionContextValue = {
		...publishedSession.view,
		meta: publishedSession.meta,
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

export function useAuthenticatedAppSessionMeta(): AuthenticatedAppSessionMeta {
	return use(AuthenticatedAppSessionContext)?.meta ?? INITIAL_SESSION_META;
}

function sessionProviderSnapshot(state: typeof initialSessionMachineState): {
	view: SessionView;
	meta: AuthenticatedAppSessionMeta;
} {
	return {
		view: state.view,
		meta: sessionMetaForState(state),
	};
}

function samePublishedSession(
	current: ReturnType<typeof sessionProviderSnapshot>,
	state: typeof initialSessionMachineState,
): boolean {
	return (
		current.view === state.view &&
		current.meta.restore.status === sessionMetaForState(state).restore.status
	);
}

const INITIAL_SESSION_META = sessionMetaForState(initialSessionMachineState);

function sessionMetaForState(
	state: typeof initialSessionMachineState,
): AuthenticatedAppSessionMeta {
	if (state.signInRequired) return { restore: { status: "signInRequired" } };
	if (state.restoreFailed) return { restore: { status: "failed" } };
	if (state.pendingRestoreAttempt === state.attempt) {
		return { restore: { status: "restoring" } };
	}
	return { restore: { status: "idle" } };
}

function defaultDisconnect() {
	return db.disconnect();
}

function defaultDisconnectAndClear() {
	return db.disconnectAndClear();
}

function enqueueDatabaseOperation<T>(operation: () => Promise<T>): Promise<T> {
	const result = databaseOperationChain.then(operation, operation);
	databaseOperationChain = result.then(
		() => undefined,
		() => undefined,
	);
	return result;
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
