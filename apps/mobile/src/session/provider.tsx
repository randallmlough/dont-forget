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
	type DatabaseOwnership,
	databaseOwnership as defaultDatabaseOwnership,
} from "./database-ownership";
import {
	clearAuthenticatedAppSessionPresent,
	persistAuthenticatedAppSession,
	readPersistedAuthenticatedAppSession,
} from "./session-hint";
import {
	type AuthenticatedAppSessionState,
	initialSessionMachineState,
	type LocalDataState,
	reduceSessionMachine,
	type SessionMachineEffect,
	type SessionMachineEvent,
	type SessionView,
} from "./session-machine";

export type AuthenticatedAppSession = SessionBootstrap;

export type {
	AuthenticatedAppSessionState,
	LocalDataState,
} from "./session-machine";

export type AuthenticatedAppSessionContextValue = {
	state: AuthenticatedAppSessionState;
	session: AuthenticatedAppSession | null;
	localData: LocalDataState;
	meta?: AuthenticatedAppSessionMeta;
	retry: () => void;
	reloadSession: (options?: AuthenticatedAppSessionReloadOptions) => void;
	signOut: () => Promise<void>;
	signInAsPreviousUser: () => Promise<void>;
	removePreviousUserDataAndContinue: () => Promise<void>;
};

export type AuthenticatedAppSessionMeta = {
	restore: {
		status: "idle" | "restoring" | "failed" | "signInRequired";
	};
	localDataStatus: LocalDataState["status"];
};

export type AuthenticatedAppSessionReloadOptions =
	| { mode: "freshOnly" }
	| { mode: "retireCurrent" };

export type AuthenticatedAppSessionProviderAuth = {
	getToken: GetSessionToken;
	getPowerSyncToken?: GetSessionToken;
	authReady: boolean;
	signedIn: boolean;
	clerkUserId: string | null;
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
	databaseOwnership?: DatabaseOwnership;
	disconnect?: () => Promise<void>;
}>;

type DispatchOptions = {
	awaitActivation?: boolean;
};

const defaultAnalytics: AuthenticatedAppSessionSignOutAnalytics = {
	track,
	reset,
};

const REMOVE_PREVIOUS_USER_DATA_ERROR =
	"Unable to remove the previous User's data. Please try again.";
const RETURN_TO_PREVIOUS_USER_ERROR =
	"Unable to return to sign in. Please try again.";

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
	databaseOwnership = defaultDatabaseOwnership,
	disconnect = defaultDisconnect,
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
			clerkUserId: clerkAuth.userId ?? null,
			signOut: clerkSignOut,
		}),
		[
			clerkAuth.isLoaded,
			clerkAuth.isSignedIn,
			clerkAuth.userId,
			clerkGetToken,
			clerkSignOut,
		],
	);
	const auth = authProp ?? defaultAuth;
	const authReady = auth.authReady;
	const signedIn = auth.signedIn;
	const clerkUserId = auth.clerkUserId;
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
				if (effect.type === "trackSessionLoaded") {
					analyticsRef.current.track("authenticated_app_session_loaded", {
						...sessionAnalyticsProperties(effect.session),
						source: effect.source,
					});
					return Promise.resolve();
				}
				const currentClerkUserId = authRef.current.clerkUserId;
				if (!currentClerkUserId) {
					return clearAuthenticatedAppSessionPresentProp()
						.catch(() => undefined)
						.then(() => undefined);
				}
				return persistAuthenticatedAppSessionProp({
					clerkUserId: currentClerkUserId,
					session: effect.session,
				})
					.catch(() => undefined)
					.then(() => undefined);
			}

			function activationSuperseded(attempt: number): boolean {
				return machineRef.current.attempt !== attempt;
			}

			// Waits on the chain but deliberately does not extend it: a hung
			// connect (PowerSync retries on bad networks) must never block a
			// later cleanup disconnect. Safe because a later disconnect aborts an
			// in-flight connect for good (@powersync/common ConnectionManager);
			// re-verify that guarantee when upgrading the SDK.
			function connectDatabaseForAttempt(attempt: number): Promise<boolean> {
				return databaseOperationChain.then(async () => {
					if (activationSuperseded(attempt)) return false;
					await connectDatabase({ getToken, getPowerSyncToken });
					return true;
				});
			}

			async function prepareAndConnectForAttempt(
				attempt: number,
				session: SessionBootstrap,
			): Promise<"blocked" | "connected" | "stale"> {
				const preparation = await enqueueDatabaseOperation(async () => {
					if (activationSuperseded(attempt)) return null;
					const result = await databaseOwnership.prepareForUser(
						session.user.id,
					);
					return activationSuperseded(attempt) ? null : result;
				});
				if (preparation === null) return "stale";
				if (preparation.status === "differentUserBlocked") return "blocked";
				return (await connectDatabaseForAttempt(attempt))
					? "connected"
					: "stale";
			}

			async function executeActivation(attempt: number, allowCached: boolean) {
				let session: SessionBootstrap;
				try {
					session = await bootstrapService.getSession(getToken);
				} catch (error) {
					if (allowCached) {
						try {
							const persistedSession =
								await readPersistedAuthenticatedAppSessionProp();
							if (persistedSession && !activationSuperseded(attempt)) {
								if (
									!authRef.current.clerkUserId ||
									persistedSession.clerkUserId !== authRef.current.clerkUserId
								) {
									await clearAuthenticatedAppSessionPresentProp().catch(
										() => undefined,
									);
								} else {
									applyResult(
										reduceSessionMachine(machineRef.current, {
											type: "activationFallbackRequested",
											attempt,
											session: persistedSession.session,
										}),
									);
									return;
								}
							}
						} catch (readError) {
							logger.error("authenticated app session restore read failed", {
								error: asError(readError),
							});
						}
					}
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
					return;
				}

				try {
					// `attempt` is the machine's only cancellation token: consult it before
					// starting the next side effect; terminal results are always dispatched
					// and the reducer alone decides what a stale one means (including
					// undoing a stale connect).
					if (activationSuperseded(attempt)) return;
					const outcome = await prepareAndConnectForAttempt(attempt, session);
					if (outcome === "stale") return;
					if (outcome === "blocked") {
						applyResult(
							reduceSessionMachine(machineRef.current, {
								type: "activationBlocked",
								attempt,
								clerkUserId: authRef.current.clerkUserId,
								session,
								source: "online",
							}),
						);
						return;
					}
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
					const outcome = await prepareAndConnectForAttempt(attempt, session);
					if (outcome === "stale") return;
					if (outcome === "blocked") {
						const currentAuth = authRef.current;
						applyResult(
							currentAuth.signedIn && currentAuth.clerkUserId
								? reduceSessionMachine(machineRef.current, {
										type: "activationBlocked",
										attempt,
										clerkUserId: currentAuth.clerkUserId,
										session,
										source: "restored",
									})
								: reduceSessionMachine(machineRef.current, {
										type: "sessionRestoreFailed",
										attempt,
									}),
						);
						return;
					}
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
			databaseOwnership,
			disconnect,
			getPowerSyncToken,
			getToken,
			logger,
			persistAuthenticatedAppSessionProp,
			readPersistedAuthenticatedAppSessionProp,
		],
	);

	useEffect(() => {
		authRef.current = auth;
	}, [auth]);

	useEffect(() => {
		void dispatch({
			type: "authStateChanged",
			authReady,
			signedIn,
			clerkUserId,
			activationEnabled,
		});
		if (!authReady || signedIn) return;
		let cancelled = false;

		void readPersistedAuthenticatedAppSessionProp()
			.then(async (persistedSession) => {
				if (cancelled || !persistedSession) return;
				if (!clerkUserId || persistedSession.clerkUserId !== clerkUserId) {
					await clearAuthenticatedAppSessionPresentProp().catch(
						() => undefined,
					);
					return;
				}
				if (cancelled) return;
				void dispatch({
					type: "sessionRestoreRequested",
					session: persistedSession.session,
				});
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
		clerkUserId,
		activationEnabled,
		clearAuthenticatedAppSessionPresentProp,
		dispatch,
		logger,
		readPersistedAuthenticatedAppSessionProp,
	]);

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
			disconnect,
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

	async function signInAsPreviousUser() {
		const blocked = machineRef.current.blockedActivation;
		if (!blocked || !blockedActivationIsCurrent(blocked)) return;
		try {
			await authRef.current.signOut();
			void dispatch({
				type: "blockedIncomingUserSignOutSucceeded",
				attempt: blocked.attempt,
				signedIn: authRef.current.signedIn,
			});
		} catch (error) {
			logger.error(
				"authenticated app session blocked incoming User sign-out failed",
				{ error: asError(error) },
			);
			void dispatch({
				type: "localDataRemovalFailed",
				attempt: blocked.attempt,
				message: RETURN_TO_PREVIOUS_USER_ERROR,
			});
		}
	}

	async function removePreviousUserDataAndContinue() {
		const blocked = machineRef.current.blockedActivation;
		if (
			!blocked ||
			!blockedActivationIsCurrent(blocked) ||
			machineRef.current.localData.status !== "differentUserBlocked" ||
			machineRef.current.localData.isRemoving
		) {
			return;
		}
		void dispatch({
			type: "localDataRemovalRequested",
			attempt: blocked.attempt,
		});
		try {
			const removed = await enqueueDatabaseOperation(async () => {
				if (!blockedActivationIsCurrent(blocked)) return false;
				await databaseOwnership.removePreviousUserDataAndPrepare(
					blocked.session.user.id,
				);
				return true;
			});
			if (!removed || !blockedActivationIsCurrent(blocked)) return;
			void dispatch({
				type: "localDataRemovalSucceeded",
				attempt: blocked.attempt,
			});
		} catch (error) {
			logger.error(
				"authenticated app session previous User data removal failed",
				{ error: asError(error) },
			);
			void dispatch({
				type: "localDataRemovalFailed",
				attempt: blocked.attempt,
				message: REMOVE_PREVIOUS_USER_DATA_ERROR,
			});
		}
	}

	function blockedActivationIsCurrent(
		blocked: NonNullable<
			(typeof initialSessionMachineState)["blockedActivation"]
		>,
	): boolean {
		const current = machineRef.current.blockedActivation;
		return (
			blocked.clerkUserId !== null &&
			machineRef.current.attempt === blocked.attempt &&
			current?.attempt === blocked.attempt &&
			current.clerkUserId === blocked.clerkUserId &&
			current.session.user.id === blocked.session.user.id &&
			authRef.current.signedIn &&
			authRef.current.clerkUserId === blocked.clerkUserId &&
			authRef.current.clerkUserId !== null
		);
	}

	const value: AuthenticatedAppSessionContextValue = {
		...publishedSession.view,
		localData: publishedSession.localData,
		meta: publishedSession.meta,
		retry,
		reloadSession,
		signOut: runSignOut,
		signInAsPreviousUser,
		removePreviousUserDataAndContinue,
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
	localData: LocalDataState;
	meta: AuthenticatedAppSessionMeta;
} {
	return {
		view: state.view,
		localData: state.localData,
		meta: sessionMetaForState(state),
	};
}

function samePublishedSession(
	current: ReturnType<typeof sessionProviderSnapshot>,
	state: typeof initialSessionMachineState,
): boolean {
	return (
		current.view === state.view &&
		current.localData === state.localData &&
		current.meta.restore.status === sessionMetaForState(state).restore.status
	);
}

const INITIAL_SESSION_META = sessionMetaForState(initialSessionMachineState);

function sessionMetaForState(
	state: typeof initialSessionMachineState,
): AuthenticatedAppSessionMeta {
	const localDataStatus = state.localData.status;
	if (state.signInRequired) {
		return { restore: { status: "signInRequired" }, localDataStatus };
	}
	if (state.restoreFailed) {
		return { restore: { status: "failed" }, localDataStatus };
	}
	if (state.pendingRestoreAttempt === state.attempt) {
		return { restore: { status: "restoring" }, localDataStatus };
	}
	return { restore: { status: "idle" }, localDataStatus };
}

function defaultDisconnect() {
	return db.disconnect();
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
