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
	type DatabasePreparation,
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

type AuthenticatedAppSessionProviderAuthBase = {
	getToken: GetSessionToken;
	getPowerSyncToken?: GetSessionToken;
	signOut: () => Promise<void>;
};

export type AuthenticatedAppSessionProviderAuth =
	| (AuthenticatedAppSessionProviderAuthBase & {
			authReady: false;
			signedIn: false;
			clerkUserId: null;
	  })
	| (AuthenticatedAppSessionProviderAuthBase & {
			authReady: true;
			signedIn: false;
			clerkUserId: null;
	  })
	| (AuthenticatedAppSessionProviderAuthBase & {
			authReady: true;
			signedIn: true;
			clerkUserId: string;
	  });

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
	const defaultAuth = useMemo<AuthenticatedAppSessionProviderAuth>(() => {
		const base: AuthenticatedAppSessionProviderAuthBase = {
			getToken: clerkGetToken,
			getPowerSyncToken: () => clerkGetToken({ template: "powersync" }),
			signOut: clerkSignOut,
		};
		if (!clerkAuth.isLoaded) {
			return {
				...base,
				authReady: false,
				signedIn: false,
				clerkUserId: null,
			};
		}
		if (!clerkAuth.isSignedIn || !clerkAuth.userId) {
			return {
				...base,
				authReady: true,
				signedIn: false,
				clerkUserId: null,
			};
		}
		return {
			...base,
			authReady: true,
			signedIn: true,
			clerkUserId: clerkAuth.userId,
		};
	}, [
		clerkAuth.isLoaded,
		clerkAuth.isSignedIn,
		clerkAuth.userId,
		clerkGetToken,
		clerkSignOut,
	]);
	const auth = authProp ?? defaultAuth;
	const authRef = useRef(auth);
	const analyticsRef = useRef(analytics);
	const machineRef = useRef(initialSessionMachineState);
	const [publishedSession, setPublishedSession] = useState(
		sessionProviderSnapshot(initialSessionMachineState),
	);
	const getToken = useCallback(() => authRef.current.getToken(), []);
	const sessionForCurrentAuth =
		auth.authReady &&
		auth.signedIn &&
		publishedSession.observedClerkUserId !== auth.clerkUserId
			? INITIAL_PROVIDER_SNAPSHOT
			: publishedSession;

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
				if (effect.type === "resetAnalytics") {
					analyticsRef.current.reset();
					return Promise.resolve();
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
				const expectedClerkUserId =
					machineRef.current.lastObservedAuth?.clerkUserId ?? null;
				const sessionToken = tokenGetterForAttempt(
					attempt,
					expectedClerkUserId,
					"session",
				);
				const powerSyncToken = tokenGetterForAttempt(
					attempt,
					expectedClerkUserId,
					"powersync",
				);
				return databaseOperationChain.then(async () => {
					if (activationSuperseded(attempt)) return false;
					await connectDatabase({
						getToken: sessionToken,
						getPowerSyncToken: powerSyncToken,
					});
					return true;
				});
			}

			function tokenGetterForAttempt(
				attempt: number,
				expectedClerkUserId: string | null,
				tokenType: "session" | "powersync",
			): GetSessionToken {
				return async () => {
					const currentAuth = authRef.current;
					if (
						activationSuperseded(attempt) ||
						currentAuth.clerkUserId !== expectedClerkUserId
					) {
						return null;
					}
					const tokenGetter =
						tokenType === "powersync"
							? (currentAuth.getPowerSyncToken ?? currentAuth.getToken)
							: currentAuth.getToken;
					const token = await tokenGetter();
					return activationSuperseded(attempt) ||
						authRef.current.clerkUserId !== expectedClerkUserId
						? null
						: token;
				};
			}

			async function prepareForAttempt(
				attempt: number,
				session: SessionBootstrap,
			): Promise<DatabasePreparation | null> {
				const preparation = await enqueueDatabaseOperation(async () => {
					if (activationSuperseded(attempt)) return null;
					const result = await databaseOwnership.prepareForUser(
						session.user.id,
					);
					return activationSuperseded(attempt) ? null : result;
				});
				return preparation;
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

				let preparation: DatabasePreparation | null;
				try {
					preparation = await prepareForAttempt(attempt, session);
				} catch (error) {
					logger.error("authenticated app session activation failed", {
						error: asError(error),
					});
					applyResult(
						reduceSessionMachine(machineRef.current, {
							type: "activationFailed",
							attempt,
							allowCached: false,
						}),
					);
					return;
				}
				if (preparation === null) return;
				if (preparation.status === "differentUserBlocked") {
					const currentAuth = authRef.current;
					if (!currentAuth.authReady || !currentAuth.signedIn) return;
					applyResult(
						reduceSessionMachine(machineRef.current, {
							type: "activationBlocked",
							attempt,
							clerkUserId: currentAuth.clerkUserId,
							session,
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
					if (!(await connectDatabaseForAttempt(attempt))) return;
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
					const preparation = await prepareForAttempt(attempt, session);
					if (preparation === null) return;
					if (preparation.status === "differentUserBlocked") {
						const currentAuth = authRef.current;
						applyResult(
							currentAuth.authReady && currentAuth.signedIn
								? reduceSessionMachine(machineRef.current, {
										type: "activationBlocked",
										attempt,
										clerkUserId: currentAuth.clerkUserId,
										session,
									})
								: reduceSessionMachine(machineRef.current, {
										type: "sessionRestoreFailed",
										attempt,
									}),
						);
						return;
					}
					if (!(await connectDatabaseForAttempt(attempt))) return;
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
		void dispatch(authStateChangedEvent(auth, activationEnabled));
		if (!auth.authReady || auth.signedIn) return;
		if (
			machineRef.current.restoreSuppressedUntilSignedIn ||
			machineRef.current.pendingBlockedIncomingUserSignOutAttempt !== null
		) {
			return;
		}
		let cancelled = false;

		void readPersistedAuthenticatedAppSessionProp()
			.then(async (persistedSession) => {
				if (cancelled || !persistedSession) return;
				await clearAuthenticatedAppSessionPresentProp().catch(() => undefined);
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
		auth,
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
			disconnect: () => enqueueDatabaseOperation(disconnect),
			getSessionUserId: () => machineRef.current.lastKnownUserId,
		});
		try {
			await signOutFlow.run();
			void dispatch({ type: "signOutSucceeded" });
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
		if (
			!blocked ||
			!blockedActivationIsCurrent(blocked) ||
			machineRef.current.pendingBlockedIncomingUserSignOutAttempt !== null
		) {
			return;
		}
		void dispatch({
			type: "blockedIncomingUserSignOutRequested",
			attempt: blocked.attempt,
		});
		try {
			await authRef.current.signOut();
			if (!blockedIncomingUserSignOutIsPending(blocked)) return;
			void dispatch({
				type: "blockedIncomingUserSignOutSucceeded",
				attempt: blocked.attempt,
				signedIn: authRef.current.signedIn,
			});
		} catch (error) {
			if (!blockedIncomingUserSignOutIsPending(blocked)) return;
			const currentSignedIn = authRef.current.signedIn;
			logger.error(
				"authenticated app session blocked incoming User sign-out failed",
				{ error: asError(error) },
			);
			void dispatch({
				type: "blockedIncomingUserSignOutFailed",
				attempt: blocked.attempt,
				signedIn: currentSignedIn,
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
			machineRef.current.localData.phase === "removing" ||
			machineRef.current.pendingBlockedIncomingUserSignOutAttempt !== null
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
		const currentAuth = authRef.current;
		return (
			machineRef.current.attempt === blocked.attempt &&
			current?.attempt === blocked.attempt &&
			current.clerkUserId === blocked.clerkUserId &&
			current.session.user.id === blocked.session.user.id &&
			currentAuth.authReady &&
			currentAuth.signedIn &&
			currentAuth.clerkUserId === blocked.clerkUserId
		);
	}

	function blockedIncomingUserSignOutIsPending(
		blocked: NonNullable<
			(typeof initialSessionMachineState)["blockedActivation"]
		>,
	): boolean {
		const current = machineRef.current;
		return (
			current.attempt === blocked.attempt &&
			current.blockedActivation?.attempt === blocked.attempt &&
			current.blockedActivation.clerkUserId === blocked.clerkUserId &&
			current.pendingBlockedIncomingUserSignOutAttempt === blocked.attempt
		);
	}

	const value: AuthenticatedAppSessionContextValue = {
		...sessionForCurrentAuth.view,
		localData: sessionForCurrentAuth.localData,
		meta: sessionForCurrentAuth.meta,
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

function authStateChangedEvent(
	auth: AuthenticatedAppSessionProviderAuth,
	activationEnabled: boolean,
): Extract<SessionMachineEvent, { type: "authStateChanged" }> {
	if (!auth.authReady) {
		return {
			type: "authStateChanged",
			authReady: false,
			signedIn: false,
			clerkUserId: null,
			activationEnabled,
		};
	}
	if (!auth.signedIn) {
		return {
			type: "authStateChanged",
			authReady: true,
			signedIn: false,
			clerkUserId: null,
			activationEnabled,
		};
	}
	return {
		type: "authStateChanged",
		authReady: true,
		signedIn: true,
		clerkUserId: auth.clerkUserId,
		activationEnabled,
	};
}

function sessionProviderSnapshot(state: typeof initialSessionMachineState): {
	view: SessionView;
	localData: LocalDataState;
	meta: AuthenticatedAppSessionMeta;
	observedSignedIn: boolean;
	observedClerkUserId: string | null;
} {
	return {
		view: state.view,
		localData: state.localData,
		meta: sessionMetaForState(state),
		observedSignedIn: state.lastObservedAuth?.signedIn === true,
		observedClerkUserId: state.lastObservedAuth?.clerkUserId ?? null,
	};
}

function samePublishedSession(
	current: ReturnType<typeof sessionProviderSnapshot>,
	state: typeof initialSessionMachineState,
): boolean {
	return (
		current.view === state.view &&
		current.localData === state.localData &&
		current.meta.restore.status === sessionMetaForState(state).restore.status &&
		current.observedSignedIn === (state.lastObservedAuth?.signedIn === true) &&
		current.observedClerkUserId ===
			(state.lastObservedAuth?.clerkUserId ?? null)
	);
}

const INITIAL_SESSION_META = sessionMetaForState(initialSessionMachineState);
const INITIAL_PROVIDER_SNAPSHOT = sessionProviderSnapshot(
	initialSessionMachineState,
);

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
