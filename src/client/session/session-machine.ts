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
	signingOut: boolean;
	suppressActivationUntilSignedOut: boolean;
	queuedReloadMode: "normal" | "freshOnly" | null;
	hasEverRequestedReload: boolean;
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
	| { type: "markSessionHint" };

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
	signingOut: false,
	suppressActivationUntilSignedOut: false,
	queuedReloadMode: null,
	hasEverRequestedReload: false,
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
				signingOut: false,
				view: LOADING_VIEW,
				queuedReloadMode: null,
			};
			if (!event.authReady || !event.signedIn) {
				return { state: { ...base, lastKnownUserId: null }, effects: [] };
			}
			const mode = state.queuedReloadMode ?? "freshOnly";
			return startActivation(base, mode === "normal");
		}
		case "activationSucceeded": {
			if (event.attempt !== state.attempt) return noChange(state);
			return {
				state: {
					...state,
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
			if (event.attempt !== state.attempt) return noChange(state);
			const cached = state.view.session;
			if (event.allowCached && cached) {
				return {
					state: {
						...state,
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
	const next: SessionMachineState = { ...state, lastObservedAuth: observed };
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
	if (!event.activationEnabled && !next.hasEverRequestedReload) {
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
	const next: SessionMachineState = { ...state, hasEverRequestedReload: true };
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
		state: { ...state, attempt, view },
		effects: [{ type: "activate", attempt, allowCached }],
	};
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
