import type { SessionBootstrap } from "./bootstrap";

export type AuthenticatedAppSessionState =
	| { status: "loading" }
	| { status: "ready"; refreshing: boolean }
	| { status: "error"; message: string };

export type SessionView = {
	state: AuthenticatedAppSessionState;
	session: SessionBootstrap | null;
};

type ObservedAuth = {
	authReady: boolean;
	signedIn: boolean;
	activationEnabled: boolean;
};

export type SessionMachineState = {
	view: SessionView;
	lastKnownUserId: string | null;
	attempt: number;
	// The attempt whose `activate` effect has been issued but not yet resolved
	// by a current-attempt terminal event. Stale terminals never clear it;
	// "a live activation owns the connection" means it equals `attempt`.
	pendingActivationAttempt: number | null;
	signingOut: boolean;
	suppressActivationUntilSignedOut: boolean;
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
	| { type: "activationFailed"; attempt: number; allowCached: boolean };

export type SessionMachineEffect =
	| { type: "activate"; attempt: number; allowCached: boolean }
	| { type: "markSessionHint" }
	| { type: "disconnectAndClear" };

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
	lastKnownUserId: null,
	attempt: 0,
	pendingActivationAttempt: null,
	signingOut: false,
	suppressActivationUntilSignedOut: false,
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
					queuedReloadMode: null,
				},
				effects: [],
			};
		case "signOutSucceeded":
			return {
				state: {
					...state,
					signingOut: false,
					view: LOADING_VIEW,
					lastKnownUserId: null,
					queuedReloadMode: null,
					// Clerk may still report signed-in until its auth flip lands.
					suppressActivationUntilSignedOut: event.signedIn,
				},
				effects: [],
			};
		case "signOutFailed": {
			const base: SessionMachineState = {
				...state,
				view: LOADING_VIEW,
				queuedReloadMode: null,
			};
			if (!event.authReady || !event.signedIn) {
				return {
					state: { ...base, signingOut: false, lastKnownUserId: null },
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
					pendingActivationAttempt: null,
					signingOut: false,
					view: {
						state: { status: "ready", refreshing: false },
						session: event.session,
					},
					lastKnownUserId: event.session.user.id,
				},
				effects: [{ type: "markSessionHint" }],
			};
		}
		case "activationFailed": {
			if (event.attempt !== state.attempt) {
				return reduceStaleActivation(state, event);
			}
			const cached = state.view.session;
			if (event.allowCached && cached) {
				return {
					state: {
						...state,
						pendingActivationAttempt: null,
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
					pendingActivationAttempt: null,
					signingOut: false,
					view: {
						state: { status: "error", message: GENERIC_ERROR_MESSAGE },
						session: null,
					},
				},
				effects: [],
			};
		}
	}
}

function reduceAuthStateChanged(
	state: SessionMachineState,
	event: { type: "authStateChanged" } & ObservedAuth,
): SessionMachineResult {
	const observed: ObservedAuth = {
		authReady: event.authReady,
		signedIn: event.signedIn,
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
		return noChange(state);
	}
	const next: SessionMachineState = { ...state, lastObservedAuth: observed };
	if (
		next.signingOut &&
		(!event.authReady || !event.signedIn) &&
		next.pendingActivationAttempt === next.attempt
	) {
		return {
			state: {
				...next,
				attempt: next.attempt + 1,
				signingOut: false,
				suppressActivationUntilSignedOut: false,
				queuedReloadMode: null,
				view: LOADING_VIEW,
			},
			effects: [{ type: "disconnectAndClear" }],
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
		return {
			state: { ...next, attempt: next.attempt + 1, view: LOADING_VIEW },
			effects: [],
		};
	}
	if (!event.activationEnabled) {
		return { state: next, effects: [] };
	}
	return startActivation(next, true);
}

function reduceReloadRequested(
	state: SessionMachineState,
	event: {
		mode: "normal" | "freshOnly" | "retireCurrent";
		authReady: boolean;
		signedIn: boolean;
	},
): SessionMachineResult {
	const next: SessionMachineState = { ...state };
	if (next.suppressActivationUntilSignedOut) {
		// Reload suppression belongs to the pending auth flip after sign-out.
		return { state: next, effects: [] };
	}
	if (event.mode === "retireCurrent") {
		// Keep lastKnownUserId so sign-out can clean up Current List selections.
		next.view = LOADING_VIEW;
	}
	if (next.signingOut) {
		next.queuedReloadMode = event.mode === "freshOnly" ? "freshOnly" : "normal";
		return { state: next, effects: [] };
	}
	if (!event.authReady || !event.signedIn) {
		return {
			state: { ...next, attempt: next.attempt + 1, view: LOADING_VIEW },
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
	const cached = allowCached ? state.view.session : null;
	const view: SessionView = cached
		? { state: { status: "ready", refreshing: true }, session: cached }
		: LOADING_VIEW;
	return {
		state: { ...state, attempt, pendingActivationAttempt: attempt, view },
		effects: [{ type: "activate", attempt, allowCached }],
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
	if (
		event.type === "activationSucceeded" &&
		databaseMustBeDisconnected(state)
	) {
		return { state, effects: [{ type: "disconnectAndClear" }] };
	}
	return noChange(state);
}

// True when the PowerSync database must not be connected and no live
// activation owns the connection. Deny-list on signed-out-ish states:
// connected-while-signed-in is never wrong (a cached session keeps syncing),
// and clearing local data for a signed-in User could drop queued writes.
function databaseMustBeDisconnected(state: SessionMachineState): boolean {
	// A live activation for the current attempt will connect (or already
	// has) — never disconnect underneath it.
	if (state.pendingActivationAttempt === state.attempt) return false;
	// Sign-out cleanup is running, or sign-out failed and recovery has not
	// started an activation.
	if (state.signingOut) return true;
	// Signed out; waiting for Clerk's auth flip to land.
	if (state.suppressActivationUntilSignedOut) return true;
	// Post-sign-out resting state (view cleared, no known User) — covers the
	// beat where Clerk flipped before the next auth observation arrives.
	if (state.view.state.status === "loading" && state.lastKnownUserId === null) {
		return true;
	}
	// Auth was observed signed out / not ready.
	const auth = state.lastObservedAuth;
	return auth !== null && (!auth.authReady || !auth.signedIn);
}

function sameObservedAuth(a: ObservedAuth | null, b: ObservedAuth): boolean {
	return (
		a !== null &&
		a.authReady === b.authReady &&
		a.signedIn === b.signedIn &&
		a.activationEnabled === b.activationEnabled
	);
}

function noChange(state: SessionMachineState): SessionMachineResult {
	return { state, effects: [] };
}
