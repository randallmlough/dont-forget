import type { SessionBootstrap } from "./bootstrap";

export type AuthenticatedAppSessionState =
	| { status: "loading" }
	| { status: "ready"; refreshing: boolean }
	| { status: "error"; message: string };

export type SessionView = {
	state: AuthenticatedAppSessionState;
	session: SessionBootstrap | null;
};

export type LocalDataState =
	| { status: "ready" }
	| {
			status: "differentUserBlocked";
			isRemoving: boolean;
			errorMessage: string | null;
	  };

export type BlockedActivation = {
	attempt: number;
	clerkUserId: string | null;
	session: SessionBootstrap;
	source: "online" | "restored";
};

type ObservedAuth = {
	authReady: boolean;
	signedIn: boolean;
	clerkUserId: string | null;
	activationEnabled: boolean;
};

export type SessionMachineState = {
	view: SessionView;
	localData: LocalDataState;
	blockedActivation: BlockedActivation | null;
	readySessionSource: "online" | "restored" | null;
	lastKnownUserId: string | null;
	attempt: number;
	// The attempt whose `activate` effect has been issued but not yet resolved
	// by a current-attempt terminal event. Stale terminals never clear it;
	// "a live activation owns the connection" means it equals `attempt`.
	pendingActivationAttempt: number | null;
	pendingActivationRestoredUserId: string | null;
	pendingRestoreAttempt: number | null;
	restorableSession: SessionBootstrap | null;
	restoreFailed: boolean;
	signInRequired: boolean;
	signingOut: boolean;
	suppressActivationUntilSignedOut: boolean;
	restoreSuppressedUntilSignedIn: boolean;
	queuedReloadMode: "normal" | "freshOnly" | null;
	lastObservedAuth: ObservedAuth | null;
};

export type SessionMachineEvent =
	| ({ type: "authStateChanged" } & ObservedAuth)
	| {
			type: "reloadRequested";
			mode: "normal" | "freshOnly" | "retireCurrent";
			authReady: boolean;
			signedIn: boolean;
	  }
	| { type: "signOutRequested" }
	| { type: "signOutSucceeded"; signedIn: boolean }
	| { type: "signOutFailed"; authReady: boolean; signedIn: boolean }
	| { type: "activationSucceeded"; attempt: number; session: SessionBootstrap }
	| ({ type: "activationBlocked" } & BlockedActivation)
	| { type: "localDataRemovalRequested"; attempt: number }
	| { type: "localDataRemovalSucceeded"; attempt: number }
	| {
			type: "localDataRemovalFailed";
			attempt: number;
			message: string;
	  }
	| {
			type: "blockedIncomingUserSignOutSucceeded";
			attempt: number;
			signedIn: boolean;
	  }
	| {
			type: "activationFallbackRequested";
			attempt: number;
			session: SessionBootstrap;
	  }
	| { type: "activationFailed"; attempt: number; allowCached: boolean }
	| { type: "sessionRestoreRequested"; session: SessionBootstrap }
	| {
			type: "sessionRestoreSucceeded";
			attempt: number;
			session: SessionBootstrap;
	  }
	| { type: "sessionRestoreFailed"; attempt: number };

export type SessionMachineEffect =
	| { type: "activate"; attempt: number; allowCached: boolean }
	| { type: "clearSessionHint" }
	| { type: "disconnect" }
	| { type: "markSessionHint"; session: SessionBootstrap }
	| { type: "restoreSession"; attempt: number; session: SessionBootstrap }
	| {
			type: "trackSessionLoaded";
			source: "cached";
			session: SessionBootstrap;
	  };

export type SessionMachineResult = {
	state: SessionMachineState;
	effects: SessionMachineEffect[];
};

export const GENERIC_ERROR_MESSAGE =
	"Unable to prepare your Household. Please try again.";

const LOADING_VIEW: SessionView = {
	state: { status: "loading" },
	session: null,
};
// Tests and no-op transitions rely on LOADING_VIEW referential identity.

export const initialSessionMachineState: SessionMachineState = {
	view: LOADING_VIEW,
	localData: { status: "ready" },
	blockedActivation: null,
	readySessionSource: null,
	lastKnownUserId: null,
	attempt: 0,
	pendingActivationAttempt: null,
	pendingActivationRestoredUserId: null,
	pendingRestoreAttempt: null,
	restorableSession: null,
	restoreFailed: false,
	signInRequired: false,
	signingOut: false,
	suppressActivationUntilSignedOut: false,
	restoreSuppressedUntilSignedIn: false,
	queuedReloadMode: null,
	lastObservedAuth: null,
};

export function reduceSessionMachine(
	state: SessionMachineState,
	event: SessionMachineEvent,
): SessionMachineResult {
	switch (event.type) {
		case "authStateChanged":
			return reduceAuthStateChanged(state, event);
		case "reloadRequested":
			return reduceReloadRequested(state, event);
		case "signOutRequested":
			if (state.signingOut) return noChange(state);
			return {
				state: {
					...state,
					signingOut: true,
					// This invalidates every in-flight activation before cleanup starts.
					attempt: state.attempt + 1,
					readySessionSource: null,
					pendingActivationRestoredUserId: null,
					pendingRestoreAttempt: null,
					restorableSession: null,
					restoreFailed: false,
					signInRequired: false,
					queuedReloadMode: null,
				},
				effects: [],
			};
		case "signOutSucceeded":
			return {
				state: {
					...state,
					localData: { status: "ready" },
					blockedActivation: null,
					signingOut: false,
					view: LOADING_VIEW,
					readySessionSource: null,
					lastKnownUserId: null,
					pendingActivationRestoredUserId: null,
					pendingRestoreAttempt: null,
					restorableSession: null,
					restoreFailed: false,
					signInRequired: false,
					queuedReloadMode: null,
					// Clerk may still report signed-in until its auth flip lands.
					suppressActivationUntilSignedOut: event.signedIn,
					restoreSuppressedUntilSignedIn: true,
				},
				effects: [],
			};
		case "signOutFailed": {
			const base: SessionMachineState = {
				...state,
				localData: { status: "ready" },
				blockedActivation: null,
				view: LOADING_VIEW,
				readySessionSource: null,
				pendingActivationRestoredUserId: null,
				pendingRestoreAttempt: null,
				restoreFailed: false,
				signInRequired: false,
				queuedReloadMode: null,
			};
			if (!event.authReady || !event.signedIn) {
				return {
					state: {
						...base,
						signingOut: false,
						lastKnownUserId: null,
						restorableSession: null,
						signInRequired: true,
						restoreSuppressedUntilSignedIn: true,
					},
					effects: [],
				};
			}
			const mode = state.queuedReloadMode ?? "freshOnly";
			return startActivation({ ...base, signingOut: true }, mode === "normal");
		}
		case "activationSucceeded": {
			if (event.attempt !== state.attempt) {
				return reduceStaleActivation(state, event);
			}
			return {
				state: {
					...state,
					localData: { status: "ready" },
					blockedActivation: null,
					pendingActivationAttempt: null,
					pendingActivationRestoredUserId: null,
					signingOut: false,
					view: {
						state: { status: "ready", refreshing: false },
						session: event.session,
					},
					readySessionSource: "online",
					lastKnownUserId: event.session.user.id,
					pendingRestoreAttempt: null,
					restorableSession: null,
					restoreFailed: false,
					signInRequired: false,
					restoreSuppressedUntilSignedIn: false,
				},
				effects: [{ type: "markSessionHint", session: event.session }],
			};
		}
		case "activationBlocked":
			if (event.attempt !== state.attempt) return noChange(state);
			return {
				state: {
					...state,
					view: LOADING_VIEW,
					readySessionSource: null,
					pendingActivationAttempt: null,
					pendingActivationRestoredUserId: null,
					pendingRestoreAttempt: null,
					restorableSession: null,
					restoreFailed: false,
					signInRequired: false,
					localData: {
						status: "differentUserBlocked",
						isRemoving: false,
						errorMessage: null,
					},
					blockedActivation: {
						attempt: event.attempt,
						clerkUserId: event.clerkUserId,
						session: event.session,
						source: event.source,
					},
				},
				effects: [],
			};
		case "localDataRemovalRequested":
			if (
				state.blockedActivation?.attempt !== event.attempt ||
				state.localData.status !== "differentUserBlocked" ||
				state.localData.isRemoving
			) {
				return noChange(state);
			}
			return {
				state: {
					...state,
					localData: {
						status: "differentUserBlocked",
						isRemoving: true,
						errorMessage: null,
					},
				},
				effects: [],
			};
		case "localDataRemovalFailed":
			if (
				state.blockedActivation?.attempt !== event.attempt ||
				state.localData.status !== "differentUserBlocked"
			) {
				return noChange(state);
			}
			return {
				state: {
					...state,
					localData: {
						status: "differentUserBlocked",
						isRemoving: false,
						errorMessage: event.message,
					},
				},
				effects: [],
			};
		case "localDataRemovalSucceeded": {
			if (
				state.blockedActivation?.attempt !== event.attempt ||
				state.localData.status !== "differentUserBlocked" ||
				!state.localData.isRemoving
			) {
				return noChange(state);
			}
			const prepared: SessionMachineState = {
				...state,
				localData: { status: "ready" },
				blockedActivation: null,
			};
			const auth = state.lastObservedAuth;
			if (auth?.authReady && auth.signedIn && auth.activationEnabled) {
				return startActivation(prepared, false);
			}
			return {
				state: {
					...prepared,
					attempt: state.attempt + 1,
					signInRequired: true,
					restoreSuppressedUntilSignedIn: true,
				},
				effects: [],
			};
		}
		case "blockedIncomingUserSignOutSucceeded":
			if (state.blockedActivation?.attempt !== event.attempt) {
				return noChange(state);
			}
			return {
				state: {
					...state,
					attempt: state.attempt + 1,
					view: LOADING_VIEW,
					localData: { status: "ready" },
					blockedActivation: null,
					signInRequired: true,
					suppressActivationUntilSignedOut: event.signedIn,
					restoreSuppressedUntilSignedIn: true,
				},
				effects: [],
			};
		case "activationFallbackRequested":
			if (
				event.attempt !== state.attempt ||
				state.pendingActivationAttempt !== event.attempt
			) {
				return noChange(state);
			}
			return startRestore(
				{
					...state,
					pendingActivationAttempt: null,
					pendingActivationRestoredUserId: null,
				},
				event.session,
			);
		case "activationFailed": {
			if (event.attempt !== state.attempt) {
				return reduceStaleActivation(state, event);
			}
			const cached = state.view.session;
			if (event.allowCached && cached) {
				return {
					state: {
						...state,
						localData: { status: "ready" },
						blockedActivation: null,
						pendingActivationAttempt: null,
						pendingActivationRestoredUserId: null,
						signingOut: false,
						view: {
							state: { status: "ready", refreshing: false },
							session: cached,
						},
					},
					effects: [],
				};
			}
			return {
				state: {
					...state,
					localData: { status: "ready" },
					blockedActivation: null,
					pendingActivationAttempt: null,
					pendingActivationRestoredUserId: null,
					signingOut: false,
					view: {
						state: { status: "error", message: GENERIC_ERROR_MESSAGE },
						session: null,
					},
					readySessionSource: null,
					restoreFailed: false,
				},
				effects: [],
			};
		}
		case "sessionRestoreRequested":
			if (!sessionCanBeRestored(state)) return noChange(state);
			return startRestore(state, event.session);
		case "sessionRestoreSucceeded": {
			if (
				event.attempt !== state.attempt ||
				state.pendingRestoreAttempt !== event.attempt
			) {
				return reduceStaleSessionConnection(state);
			}
			return {
				state: {
					...state,
					localData: { status: "ready" },
					blockedActivation: null,
					pendingActivationAttempt: null,
					pendingActivationRestoredUserId: null,
					pendingRestoreAttempt: null,
					signingOut: false,
					view: {
						state: { status: "ready", refreshing: false },
						session: event.session,
					},
					readySessionSource: "restored",
					lastKnownUserId: event.session.user.id,
					restorableSession: null,
					restoreFailed: false,
					signInRequired: false,
				},
				effects: [
					{
						type: "trackSessionLoaded",
						source: "cached",
						session: event.session,
					},
				],
			};
		}
		case "sessionRestoreFailed":
			if (
				event.attempt !== state.attempt ||
				state.pendingRestoreAttempt !== event.attempt
			) {
				return noChange(state);
			}
			return {
				state: {
					...state,
					pendingRestoreAttempt: null,
					signingOut: false,
					view: {
						state: { status: "error", message: GENERIC_ERROR_MESSAGE },
						session: null,
					},
					readySessionSource: null,
					restoreFailed: true,
				},
				effects: [],
			};
	}
}

function reduceAuthStateChanged(
	state: SessionMachineState,
	event: { type: "authStateChanged" } & ObservedAuth,
): SessionMachineResult {
	const observed: ObservedAuth = {
		authReady: event.authReady,
		signedIn: event.signedIn,
		clerkUserId: event.clerkUserId,
		activationEnabled: event.activationEnabled,
	};
	// Identical observations should not restart the session lifecycle.
	if (sameObservedAuth(state.lastObservedAuth, observed)) {
		return noChange(state);
	}
	if (
		event.authReady &&
		event.signedIn &&
		!event.activationEnabled &&
		!state.signingOut &&
		!state.suppressActivationUntilSignedOut
	) {
		return { state: { ...state, lastObservedAuth: observed }, effects: [] };
	}
	const next: SessionMachineState = { ...state, lastObservedAuth: observed };
	const previousAuth = state.lastObservedAuth;
	const directUserChange =
		previousAuth?.authReady === true &&
		previousAuth.signedIn &&
		previousAuth.clerkUserId !== null &&
		event.authReady &&
		event.signedIn &&
		event.clerkUserId !== null &&
		previousAuth.clerkUserId !== event.clerkUserId;
	if (directUserChange && !next.signingOut) {
		const activation = startActivation(
			{
				...next,
				localData: { status: "ready" },
				blockedActivation: null,
				view: LOADING_VIEW,
				readySessionSource: null,
				pendingActivationRestoredUserId: null,
				pendingRestoreAttempt: null,
				restorableSession: null,
				restoreFailed: false,
				signInRequired: false,
			},
			true,
		);
		return {
			state: activation.state,
			effects: [{ type: "disconnect" }, ...activation.effects],
		};
	}
	if (
		next.signingOut &&
		(!event.authReady || !event.signedIn) &&
		next.pendingActivationAttempt === next.attempt
	) {
		return {
			state: {
				...next,
				localData: { status: "ready" },
				blockedActivation: null,
				attempt: next.attempt + 1,
				signingOut: false,
				suppressActivationUntilSignedOut: false,
				restoreSuppressedUntilSignedIn: true,
				queuedReloadMode: null,
				view: LOADING_VIEW,
				readySessionSource: null,
				pendingActivationRestoredUserId: null,
				pendingRestoreAttempt: null,
				restorableSession: null,
				restoreFailed: false,
				signInRequired: true,
			},
			effects: [{ type: "disconnect" }],
		};
	}
	if (next.signingOut) {
		return { state: next, effects: [] };
	}
	if (next.suppressActivationUntilSignedOut) {
		if (event.signedIn) return { state: next, effects: [] };
		next.suppressActivationUntilSignedOut = false;
	}
	if (!event.authReady || !event.signedIn) {
		const authWasSignedIn =
			state.lastObservedAuth?.authReady === true &&
			state.lastObservedAuth.signedIn === true;
		const authLossRequiresSignIn =
			(next.view.session !== null && next.readySessionSource === "online") ||
			authWasSignedIn;
		return {
			state: {
				...next,
				localData: { status: "ready" },
				blockedActivation: null,
				attempt: next.attempt + 1,
				view: LOADING_VIEW,
				readySessionSource: null,
				pendingActivationRestoredUserId: null,
				pendingRestoreAttempt: null,
				restorableSession: authLossRequiresSignIn
					? null
					: next.restorableSession,
				restoreFailed: authLossRequiresSignIn ? false : next.restoreFailed,
				signInRequired: next.signInRequired || authLossRequiresSignIn,
				restoreSuppressedUntilSignedIn:
					next.restoreSuppressedUntilSignedIn || authLossRequiresSignIn,
			},
			effects: authLossRequiresSignIn
				? [{ type: "clearSessionHint" }, { type: "disconnect" }]
				: [],
		};
	}
	if (!event.activationEnabled) {
		return { state: next, effects: [] };
	}
	if (
		next.view.session !== null &&
		next.readySessionSource === "online" &&
		next.pendingActivationAttempt !== next.attempt
	) {
		return { state: next, effects: [] };
	}
	const replacesRestoredConnection =
		(next.readySessionSource === "restored" && next.view.session !== null) ||
		next.pendingRestoreAttempt === next.attempt;
	const activation = startActivation(next, true);
	return replacesRestoredConnection
		? {
				state: activation.state,
				effects: [{ type: "disconnect" }, ...activation.effects],
			}
		: activation;
}

function reduceReloadRequested(
	state: SessionMachineState,
	event: {
		mode: "normal" | "freshOnly" | "retireCurrent";
		authReady: boolean;
		signedIn: boolean;
	},
): SessionMachineResult {
	if (
		event.mode !== "retireCurrent" &&
		!event.signedIn &&
		state.readySessionSource === "restored" &&
		state.view.session !== null
	) {
		return noChange(state);
	}
	const next: SessionMachineState = { ...state };
	if (next.suppressActivationUntilSignedOut) {
		// Reload suppression belongs to the pending auth flip after sign-out.
		return { state: next, effects: [] };
	}
	if (event.mode === "retireCurrent") {
		// Keep lastKnownUserId so sign-out can clean up Current List selections.
		next.view = LOADING_VIEW;
		next.readySessionSource = null;
		next.restorableSession = null;
		next.restoreFailed = false;
		next.signInRequired = false;
	}
	if (next.signingOut) {
		next.queuedReloadMode = event.mode === "freshOnly" ? "freshOnly" : "normal";
		return { state: next, effects: [] };
	}
	if (!event.authReady || !event.signedIn) {
		if (
			event.mode !== "retireCurrent" &&
			event.authReady &&
			next.restorableSession &&
			sessionCanBeRestored(next)
		) {
			return startRestore(next, next.restorableSession);
		}
		return {
			state: {
				...next,
				attempt: next.attempt + 1,
				view: LOADING_VIEW,
				readySessionSource: null,
				pendingActivationRestoredUserId: null,
				pendingRestoreAttempt: null,
			},
			effects: [],
		};
	}
	return startActivation(next, event.mode !== "freshOnly");
}

function startActivation(
	state: SessionMachineState,
	allowCached: boolean,
): SessionMachineResult {
	const attempt = state.attempt + 1;
	const pendingActivationRestoredUserId =
		state.readySessionSource === "restored"
			? state.lastKnownUserId
			: state.pendingRestoreAttempt === state.attempt
				? (state.restorableSession?.user.id ?? null)
				: null;
	const cached =
		allowCached && state.readySessionSource !== "restored"
			? state.view.session
			: null;
	const view: SessionView = cached
		? { state: { status: "ready", refreshing: true }, session: cached }
		: LOADING_VIEW;
	return {
		state: {
			...state,
			attempt,
			pendingActivationAttempt: attempt,
			pendingActivationRestoredUserId,
			pendingRestoreAttempt: null,
			view,
			readySessionSource: cached ? state.readySessionSource : null,
			restorableSession: null,
			restoreFailed: false,
			signInRequired: false,
			restoreSuppressedUntilSignedIn: false,
		},
		effects: [{ type: "activate", attempt, allowCached }],
	};
}

function startRestore(
	state: SessionMachineState,
	session: SessionBootstrap,
): SessionMachineResult {
	return {
		state: {
			...state,
			pendingRestoreAttempt: state.attempt,
			restorableSession: session,
			restoreFailed: false,
			signInRequired: false,
			view: LOADING_VIEW,
			readySessionSource: null,
		},
		effects: [
			{
				type: "restoreSession",
				attempt: state.attempt,
				session,
			},
		],
	};
}

// The single rule for activation results that lost the race with a newer
// attempt, a sign-out, or an auth drop. State never changes (identity is
// preserved for React bail-out); the only question is whether a side effect
// already happened that must be undone: a stale *success* means the
// superseded activation connected the PowerSync database.
function reduceStaleActivation(
	state: SessionMachineState,
	event: Extract<
		SessionMachineEvent,
		{ type: "activationSucceeded" | "activationFailed" }
	>,
): SessionMachineResult {
	if (event.type === "activationSucceeded") {
		const cleanup = staleConnectionCleanupEffect(state);
		if (cleanup) return { state, effects: [cleanup] };
	}
	return noChange(state);
}

function reduceStaleSessionConnection(
	state: SessionMachineState,
): SessionMachineResult {
	const cleanup = staleConnectionCleanupEffect(state);
	if (cleanup) return { state, effects: [cleanup] };
	return noChange(state);
}

function staleConnectionCleanupEffect(
	state: SessionMachineState,
): Extract<SessionMachineEffect, { type: "disconnect" }> | null {
	if (databaseMustBeDisconnected(state)) {
		return { type: "disconnect" };
	}
	if (state.readySessionSource === "restored" && state.view.session !== null) {
		return { type: "disconnect" };
	}
	return null;
}

// True when the PowerSync database must not be connected and no live
// activation owns the connection. Deny-list on signed-out-ish states:
// connected-while-signed-in is never wrong (a cached session keeps syncing),
// and clearing local data for a signed-in User could drop queued writes.
function databaseMustBeDisconnected(state: SessionMachineState): boolean {
	// A live activation for the current attempt will connect (or already
	// has) — never disconnect underneath it.
	if (state.pendingActivationAttempt === state.attempt) return false;
	// A live restore for the current attempt owns the connection while it is
	// preparing the restored Authenticated App Session.
	if (state.pendingRestoreAttempt === state.attempt) return false;
	// Sign-out cleanup is running, or sign-out failed and recovery has not
	// started an activation.
	if (state.signingOut) return true;
	// Signed out; waiting for Clerk's auth flip to land.
	if (state.suppressActivationUntilSignedOut) return true;
	// A restored Authenticated App Session intentionally keeps local PowerSync
	// available even though Clerk could not confirm sign-in during cold start.
	if (state.readySessionSource === "restored" && state.view.session !== null) {
		return false;
	}
	// Post-sign-out resting state (view cleared, no known User) — covers the
	// beat where Clerk flipped before the next auth observation arrives.
	if (state.view.state.status === "loading" && state.lastKnownUserId === null) {
		return true;
	}
	// Auth was observed signed out / not ready.
	const auth = state.lastObservedAuth;
	return auth !== null && (!auth.authReady || !auth.signedIn);
}

function sessionCanBeRestored(state: SessionMachineState): boolean {
	const auth = state.lastObservedAuth;
	if (!auth?.authReady) return false;
	return (
		!auth.signedIn &&
		auth.activationEnabled &&
		!state.signingOut &&
		!state.signInRequired &&
		!state.restoreSuppressedUntilSignedIn &&
		state.view.session === null
	);
}

function sameObservedAuth(a: ObservedAuth | null, b: ObservedAuth): boolean {
	return (
		a !== null &&
		a.authReady === b.authReady &&
		a.signedIn === b.signedIn &&
		a.clerkUserId === b.clerkUserId &&
		a.activationEnabled === b.activationEnabled
	);
}

function noChange(state: SessionMachineState): SessionMachineResult {
	return { state, effects: [] };
}
