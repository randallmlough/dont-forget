import type { SessionBootstrap } from "./bootstrap";
import {
	GENERIC_ERROR_MESSAGE,
	initialSessionMachineState,
	reduceSessionMachine,
	type SessionMachineEffect,
	type SessionMachineEvent,
	type SessionMachineState,
} from "./session-machine";

describe("reduceSessionMachine", () => {
	it("activates on the first signed-in auth observation", () => {
		const result = reduceSessionMachine(
			initialSessionMachineState,
			authStateChanged(),
		);

		expect(result.state.view).toBe(initialSessionMachineState.view);
		expect(result.state.view.state.status).toBe("loading");
		expect(result.state.view.session).toBeNull();
		expect(result.state.attempt).toBe(1);
		expect(result.effects).toEqual([
			{ type: "activate", attempt: 1, allowCached: true },
		]);
	});

	it("treats an identical repeated auth observation as a no-op", () => {
		const first = reduceSessionMachine(
			initialSessionMachineState,
			authStateChanged(),
		);
		const second = reduceSessionMachine(first.state, authStateChanged());

		expect(second.state).toBe(first.state);
		expect(second.effects).toEqual([]);
	});

	it("defers activation when activation is disabled and no reload has been requested", () => {
		const result = reduceSessionMachine(
			initialSessionMachineState,
			authStateChanged({ activationEnabled: false }),
		);

		expect(result.state.attempt).toBe(0);
		expect(result.state.view).toBe(initialSessionMachineState.view);
		expect(result.effects).toEqual([]);
	});

	it("activates when only activationEnabled flips from false to true", () => {
		const deferred = reduceSessionMachine(
			initialSessionMachineState,
			authStateChanged({ activationEnabled: false }),
		);
		const result = reduceSessionMachine(deferred.state, authStateChanged());

		expect(result.state.attempt).toBe(1);
		expect(result.effects).toEqual([
			{ type: "activate", attempt: 1, allowCached: true },
		]);
	});

	it("does not reactivate a ready session after a disabled passive auth observation", () => {
		const session = sessionFixture();
		const ready = activatedWith(session);
		const disabled = reduceSessionMachine(
			ready.state,
			authStateChanged({ activationEnabled: false }),
		);
		const enabled = reduceSessionMachine(disabled.state, authStateChanged());

		expect(disabled.state).toBe(ready.state);
		expect(disabled.effects).toEqual([]);
		expect(enabled.state.attempt).toBe(ready.state.attempt);
		expect(enabled.state.view).toEqual({
			state: { status: "ready", refreshing: false },
			session,
		});
		expect(enabled.effects).toEqual([]);
	});

	it("does not restart from a disabled passive auth observation after an explicit reload", () => {
		const session = sessionFixture();
		const ready = activatedWith(session);
		const reloading = reduceSessionMachine(ready.state, reloadRequested());
		const reloaded = reduceSessionMachine(reloading.state, {
			type: "activationSucceeded",
			attempt: 2,
			session,
		});

		const result = reduceSessionMachine(
			reloaded.state,
			authStateChanged({ activationEnabled: false }),
		);

		expect(result.state.attempt).toBe(reloaded.state.attempt);
		expect(result.state.view).toBe(reloaded.state.view);
		expect(result.effects).toEqual([]);
	});

	it("publishes loading and bumps the attempt on signed-out observations", () => {
		const session = sessionFixture();
		const ready = activatedWith(session);
		const result = reduceSessionMachine(
			ready.state,
			authStateChanged({ signedIn: false }),
		);

		expect(result.state.attempt).toBe(2);
		expect(result.state.view).toBe(initialSessionMachineState.view);
		expect(result.state.lastKnownUserId).toBe("usr_avery");
		expect(result.effects).toEqual([]);
	});

	it("publishes ready state, records last-known User, and marks the session hint on activation success", () => {
		const session = sessionFixture();
		const activating = reduceSessionMachine(
			initialSessionMachineState,
			authStateChanged(),
		);
		const result = reduceSessionMachine(activating.state, {
			type: "activationSucceeded",
			attempt: 1,
			session,
		});

		expect(result.state.view).toEqual({
			state: { status: "ready", refreshing: false },
			session,
		});
		expect(result.state.lastKnownUserId).toBe("usr_avery");
		expect(result.effects).toEqual([{ type: "markSessionHint" }]);
	});

	it("discards stale activation success and failure results by identity", () => {
		const activating = reduceSessionMachine(
			initialSessionMachineState,
			authStateChanged(),
		);
		const staleSuccess = reduceSessionMachine(activating.state, {
			type: "activationSucceeded",
			attempt: 0,
			session: sessionFixture(),
		});
		const staleFailure = reduceSessionMachine(activating.state, {
			type: "activationFailed",
			attempt: 0,
			allowCached: false,
		});

		expect(staleSuccess.state).toBe(activating.state);
		expect(staleSuccess.effects).toEqual([]);
		expect(staleFailure.state).toBe(activating.state);
		expect(staleFailure.effects).toEqual([]);
	});

	it("keeps a ready session refreshing during normal reload and falls back to the cached Household on failure", () => {
		const session = sessionFixture();
		const ready = activatedWith(session);
		const reloading = reduceSessionMachine(ready.state, reloadRequested());

		expect(reloading.state.view).toEqual({
			state: { status: "ready", refreshing: true },
			session,
		});
		expect(reloading.effects).toEqual([
			{ type: "activate", attempt: 2, allowCached: true },
		]);

		const failed = reduceSessionMachine(reloading.state, {
			type: "activationFailed",
			attempt: 2,
			allowCached: true,
		});

		expect(failed.state.view).toEqual({
			state: { status: "ready", refreshing: false },
			session,
		});
		expect(failed.state.view.session).toBe(session);
		expect(failed.effects).toEqual([]);
	});

	it("drops the cached session for freshOnly reloads and publishes the Household error on failure", () => {
		const ready = activatedWith(sessionFixture());
		const reloading = reduceSessionMachine(
			ready.state,
			reloadRequested({ mode: "freshOnly" }),
		);

		expect(reloading.state.view).toBe(initialSessionMachineState.view);
		expect(reloading.effects).toEqual([
			{ type: "activate", attempt: 2, allowCached: false },
		]);

		const failed = reduceSessionMachine(reloading.state, {
			type: "activationFailed",
			attempt: 2,
			allowCached: false,
		});

		expect(failed.state.view).toEqual({
			state: { status: "error", message: GENERIC_ERROR_MESSAGE },
			session: null,
		});
		expect(failed.effects).toEqual([]);
	});

	it("retires the current session view while keeping the last-known User for sign-out cleanup", () => {
		const ready = activatedWith(sessionFixture());
		const result = reduceSessionMachine(
			ready.state,
			reloadRequested({ mode: "retireCurrent" }),
		);

		expect(result.state.view).toBe(initialSessionMachineState.view);
		expect(result.state.lastKnownUserId).toBe("usr_avery");
		expect(result.effects).toEqual([
			{ type: "activate", attempt: 2, allowCached: true },
		]);
	});

	it("starts sign-out once and ignores duplicate sign-out requests by identity", () => {
		const ready = activatedWith(sessionFixture());
		const signingOut = reduceSessionMachine(ready.state, {
			type: "signOutRequested",
		});
		const duplicate = reduceSessionMachine(signingOut.state, {
			type: "signOutRequested",
		});

		expect(signingOut.state.signingOut).toBe(true);
		expect(signingOut.state.attempt).toBe(2);
		expect(signingOut.effects).toEqual([]);
		expect(duplicate.state).toBe(signingOut.state);
		expect(duplicate.effects).toEqual([]);
	});

	it("queues reloads during sign-out and recovers with queued or fresh activation after sign-out failure", () => {
		const ready = activatedWith(sessionFixture());
		const signingOut = reduceSessionMachine(ready.state, {
			type: "signOutRequested",
		});
		const queued = reduceSessionMachine(signingOut.state, reloadRequested());

		expect(queued.state.queuedReloadMode).toBe("normal");
		expect(queued.effects).toEqual([]);

		const recoveredQueued = reduceSessionMachine(queued.state, {
			type: "signOutFailed",
			authReady: true,
			signedIn: true,
		});

		expect(recoveredQueued.state.signingOut).toBe(true);
		expect(recoveredQueued.state.queuedReloadMode).toBeNull();
		expect(recoveredQueued.effects).toEqual([
			{ type: "activate", attempt: 3, allowCached: true },
		]);

		const recovered = reduceSessionMachine(recoveredQueued.state, {
			type: "activationSucceeded",
			attempt: 3,
			session: sessionFixture({ displayName: "Recovered" }),
		});

		expect(recovered.state.signingOut).toBe(false);

		const noQueuedReload = reduceSessionMachine(signingOut.state, {
			type: "signOutFailed",
			authReady: true,
			signedIn: true,
		});

		expect(noQueuedReload.state.signingOut).toBe(true);
		expect(noQueuedReload.effects).toEqual([
			{ type: "activate", attempt: 3, allowCached: false },
		]);
	});

	it("clears signingOut when sign-out recovery activation fails", () => {
		const signingOut = reduceSessionMachine(
			activatedWith(sessionFixture()).state,
			{
				type: "signOutRequested",
			},
		);
		const recovering = reduceSessionMachine(signingOut.state, {
			type: "signOutFailed",
			authReady: true,
			signedIn: true,
		});

		const failed = reduceSessionMachine(recovering.state, {
			type: "activationFailed",
			attempt: 3,
			allowCached: false,
		});

		expect(failed.state.signingOut).toBe(false);
		expect(failed.state.view).toEqual({
			state: { status: "error", message: GENERIC_ERROR_MESSAGE },
			session: null,
		});
		expect(failed.effects).toEqual([]);
	});

	it("clears the view and last-known User on sign-out success while suppressing only if still signed in", () => {
		const signingOut = reduceSessionMachine(
			activatedWith(sessionFixture()).state,
			{
				type: "signOutRequested",
			},
		);
		const stillSignedIn = reduceSessionMachine(signingOut.state, {
			type: "signOutSucceeded",
			signedIn: true,
		});
		const alreadySignedOut = reduceSessionMachine(signingOut.state, {
			type: "signOutSucceeded",
			signedIn: false,
		});

		expect(stillSignedIn.state.view).toBe(initialSessionMachineState.view);
		expect(stillSignedIn.state.lastKnownUserId).toBeNull();
		expect(stillSignedIn.state.suppressActivationUntilSignedOut).toBe(true);
		expect(alreadySignedOut.state.view).toBe(initialSessionMachineState.view);
		expect(alreadySignedOut.state.lastKnownUserId).toBeNull();
		expect(alreadySignedOut.state.suppressActivationUntilSignedOut).toBe(false);
	});

	it("suppresses signed-in auth observations until a signed-out observation arrives", () => {
		const signingOut = reduceSessionMachine(
			activatedWith(sessionFixture()).state,
			{
				type: "signOutRequested",
			},
		);
		const suppressed = reduceSessionMachine(signingOut.state, {
			type: "signOutSucceeded",
			signedIn: true,
		});
		const signedInAgain = reduceSessionMachine(
			suppressed.state,
			authStateChanged(),
		);
		const signedOut = reduceSessionMachine(
			signedInAgain.state,
			authStateChanged({ signedIn: false }),
		);
		const reactivated = reduceSessionMachine(
			signedOut.state,
			authStateChanged(),
		);

		expect(signedInAgain.state).toBe(suppressed.state);
		expect(signedInAgain.effects).toEqual([]);
		expect(signedOut.state.suppressActivationUntilSignedOut).toBe(false);
		expect(signedOut.state.view).toBe(initialSessionMachineState.view);
		expect(reactivated.effects).toEqual([
			{ type: "activate", attempt: 4, allowCached: true },
		]);
	});

	it("does not activate or bump attempts for changed signed-in observations while suppressed", () => {
		const signingOut = reduceSessionMachine(
			activatedWith(sessionFixture()).state,
			{
				type: "signOutRequested",
			},
		);
		const suppressed = reduceSessionMachine(signingOut.state, {
			type: "signOutSucceeded",
			signedIn: true,
		});
		const result = reduceSessionMachine(
			suppressed.state,
			authStateChanged({ activationEnabled: false }),
		);

		expect(result.state.attempt).toBe(suppressed.state.attempt);
		expect(result.state.suppressActivationUntilSignedOut).toBe(true);
		expect(result.effects).toEqual([]);
	});

	it("does not activate or bump attempts for reloads while suppressed", () => {
		const signingOut = reduceSessionMachine(
			activatedWith(sessionFixture()).state,
			{
				type: "signOutRequested",
			},
		);
		const suppressed = reduceSessionMachine(signingOut.state, {
			type: "signOutSucceeded",
			signedIn: true,
		});
		const result = reduceSessionMachine(suppressed.state, reloadRequested());

		expect(result.state.attempt).toBe(suppressed.state.attempt);
		expect(result.state.suppressActivationUntilSignedOut).toBe(true);
		expect(result.effects).toEqual([]);
	});

	it("clears the last-known User without activation when sign-out fails after auth is signed out", () => {
		const signingOut = reduceSessionMachine(
			activatedWith(sessionFixture()).state,
			{
				type: "signOutRequested",
			},
		);
		const result = reduceSessionMachine(signingOut.state, {
			type: "signOutFailed",
			authReady: true,
			signedIn: false,
		});

		expect(result.state.view).toBe(initialSessionMachineState.view);
		expect(result.state.lastKnownUserId).toBeNull();
		expect(result.state.signingOut).toBe(false);
		expect(result.effects).toEqual([]);
	});

	it("records auth observations during sign-out without starting activation", () => {
		const signingOut = reduceSessionMachine(
			activatedWith(sessionFixture()).state,
			{
				type: "signOutRequested",
			},
		);
		const result = reduceSessionMachine(
			signingOut.state,
			authStateChanged({ signedIn: false }),
		);

		expect(result.state.signingOut).toBe(true);
		expect(result.state.lastObservedAuth).toEqual({
			authReady: true,
			signedIn: false,
			activationEnabled: true,
		});
		expect(result.effects).toEqual([]);
	});

	it("disconnects and clears the database when a stale connect lands during sign-out cleanup", () => {
		const session = sessionFixture();
		const activating = reduceSessionMachine(
			initialSessionMachineState,
			authStateChanged(),
		);
		const signingOut = reduceSessionMachine(activating.state, {
			type: "signOutRequested",
		});

		const result = reduceSessionMachine(signingOut.state, {
			type: "activationSucceeded",
			attempt: 1,
			session,
		});

		expect(result.state).toBe(signingOut.state);
		expect(result.effects).toEqual([{ type: "disconnectAndClear" }]);
	});

	it("disconnects and clears the database when a stale connect lands after sign-out succeeded", () => {
		const session = sessionFixture();
		const signingOut = reduceSessionMachine(activatedWith(session).state, {
			type: "signOutRequested",
		});
		const signedOut = reduceSessionMachine(signingOut.state, {
			type: "signOutSucceeded",
			signedIn: true,
		});

		const result = reduceSessionMachine(signedOut.state, {
			type: "activationSucceeded",
			attempt: 1,
			session,
		});

		expect(result.state).toBe(signedOut.state);
		expect(result.effects).toEqual([{ type: "disconnectAndClear" }]);
	});

	it("disconnects and clears the database when Clerk flipped signed out before the next auth observation", () => {
		const session = sessionFixture();
		const signingOut = reduceSessionMachine(activatedWith(session).state, {
			type: "signOutRequested",
		});
		const signedOut = reduceSessionMachine(signingOut.state, {
			type: "signOutSucceeded",
			signedIn: false,
		});

		const result = reduceSessionMachine(signedOut.state, {
			type: "activationSucceeded",
			attempt: 1,
			session,
		});

		expect(result.state).toBe(signedOut.state);
		expect(result.effects).toEqual([{ type: "disconnectAndClear" }]);
	});

	it("disconnects and clears the database when a stale connect lands after auth was observed signed out", () => {
		const session = sessionFixture();
		const activating = reduceSessionMachine(
			initialSessionMachineState,
			authStateChanged(),
		);
		const signedOut = reduceSessionMachine(
			activating.state,
			authStateChanged({ signedIn: false }),
		);

		const result = reduceSessionMachine(signedOut.state, {
			type: "activationSucceeded",
			attempt: 1,
			session,
		});

		expect(result.state).toBe(signedOut.state);
		expect(result.effects).toEqual([{ type: "disconnectAndClear" }]);
	});

	it("keeps the database connected when a stale connect resolves after a quick sign-out and re-sign-in", () => {
		const session = sessionFixture();
		const activating = reduceSessionMachine(
			initialSessionMachineState,
			authStateChanged(),
		);
		const staleAttempt = activating.state.attempt;
		const signingOut = reduceSessionMachine(activating.state, {
			type: "signOutRequested",
		});
		const signOutSucceeded = reduceSessionMachine(signingOut.state, {
			type: "signOutSucceeded",
			signedIn: true,
		});
		const signedOut = reduceSessionMachine(
			signOutSucceeded.state,
			authStateChanged({ signedIn: false }),
		);
		const reSignedIn = reduceSessionMachine(
			signedOut.state,
			authStateChanged(),
		);
		const liveAttempt = reSignedIn.state.attempt;

		expect(reSignedIn.state.pendingActivationAttempt).toBe(liveAttempt);

		const result = reduceSessionMachine(reSignedIn.state, {
			type: "activationSucceeded",
			attempt: staleAttempt,
			session,
		});

		expect(result.state).toBe(reSignedIn.state);
		expect(result.effects).toEqual([]);
	});

	it("keeps the database connected when a stale connect resolves after quick re-sign-in activation succeeded", () => {
		const staleSession = sessionFixture();
		const liveSession = sessionFixture({ displayName: "Re-signed In" });
		const activating = reduceSessionMachine(
			initialSessionMachineState,
			authStateChanged(),
		);
		const staleAttempt = activating.state.attempt;
		const signingOut = reduceSessionMachine(activating.state, {
			type: "signOutRequested",
		});
		const signOutSucceeded = reduceSessionMachine(signingOut.state, {
			type: "signOutSucceeded",
			signedIn: true,
		});
		const signedOut = reduceSessionMachine(
			signOutSucceeded.state,
			authStateChanged({ signedIn: false }),
		);
		const reSignedIn = reduceSessionMachine(
			signedOut.state,
			authStateChanged(),
		);
		const liveAttempt = reSignedIn.state.attempt;
		const reactivated = reduceSessionMachine(reSignedIn.state, {
			type: "activationSucceeded",
			attempt: liveAttempt,
			session: liveSession,
		});

		expect(reactivated.state.pendingActivationAttempt).toBeNull();

		const result = reduceSessionMachine(reactivated.state, {
			type: "activationSucceeded",
			attempt: staleAttempt,
			session: staleSession,
		});

		expect(result.state).toBe(reactivated.state);
		expect(result.effects).toEqual([]);
	});

	it("keeps the database connected when a superseded connect resolves while a newer activation is pending", () => {
		const session = sessionFixture();
		const activating = reduceSessionMachine(
			initialSessionMachineState,
			authStateChanged(),
		);
		const reloading = reduceSessionMachine(activating.state, reloadRequested());

		const result = reduceSessionMachine(reloading.state, {
			type: "activationSucceeded",
			attempt: 1,
			session,
		});

		expect(result.state).toBe(reloading.state);
		expect(result.effects).toEqual([]);
	});

	it("keeps the database connected when a superseded connect resolves after the newer activation succeeded", () => {
		const session = sessionFixture();
		const activating = reduceSessionMachine(
			initialSessionMachineState,
			authStateChanged(),
		);
		const reloading = reduceSessionMachine(activating.state, reloadRequested());
		const reloaded = reduceSessionMachine(reloading.state, {
			type: "activationSucceeded",
			attempt: 2,
			session,
		});

		expect(reloaded.state.pendingActivationAttempt).toBeNull();

		const result = reduceSessionMachine(reloaded.state, {
			type: "activationSucceeded",
			attempt: 1,
			session,
		});

		expect(result.state).toBe(reloaded.state);
		expect(result.effects).toEqual([]);
	});

	it("keeps the database connected while sign-out recovery owns the activation", () => {
		const session = sessionFixture();
		const signingOut = reduceSessionMachine(activatedWith(session).state, {
			type: "signOutRequested",
		});
		const recovering = reduceSessionMachine(signingOut.state, {
			type: "signOutFailed",
			authReady: true,
			signedIn: true,
		});

		expect(recovering.state.pendingActivationAttempt).toBe(3);

		const result = reduceSessionMachine(recovering.state, {
			type: "activationSucceeded",
			attempt: 1,
			session,
		});

		expect(result.state).toBe(recovering.state);
		expect(result.effects).toEqual([]);
	});

	it("does not disconnect for stale activation failures during sign-out", () => {
		const activating = reduceSessionMachine(
			initialSessionMachineState,
			authStateChanged(),
		);
		const signingOut = reduceSessionMachine(activating.state, {
			type: "signOutRequested",
		});

		const result = reduceSessionMachine(signingOut.state, {
			type: "activationFailed",
			attempt: 1,
			allowCached: true,
		});

		expect(result.state).toBe(signingOut.state);
		expect(result.effects).toEqual([]);
	});
});

function run(...events: SessionMachineEvent[]): {
	state: SessionMachineState;
	effects: SessionMachineEffect[];
} {
	let state = initialSessionMachineState;
	const effects: SessionMachineEffect[] = [];
	for (const event of events) {
		const result = reduceSessionMachine(state, event);
		state = result.state;
		effects.push(...result.effects);
	}
	return { state, effects };
}

function activatedWith(session: SessionBootstrap): {
	state: SessionMachineState;
	effects: SessionMachineEffect[];
} {
	return run(authStateChanged(), {
		type: "activationSucceeded",
		attempt: 1,
		session,
	});
}

function authStateChanged(
	overrides: Partial<{
		authReady: boolean;
		signedIn: boolean;
		activationEnabled: boolean;
	}> = {},
): SessionMachineEvent {
	return {
		type: "authStateChanged",
		authReady: true,
		signedIn: true,
		activationEnabled: true,
		...overrides,
	};
}

function reloadRequested(
	overrides: Partial<{
		mode: "normal" | "freshOnly" | "retireCurrent";
		authReady: boolean;
		signedIn: boolean;
	}> = {},
): SessionMachineEvent {
	return {
		type: "reloadRequested",
		mode: "normal",
		authReady: true,
		signedIn: true,
		...overrides,
	};
}

function sessionFixture(
	overrides: { displayName?: string } = {},
): SessionBootstrap {
	const displayName = overrides.displayName ?? "Avery Chen";
	return {
		user: {
			id: "usr_avery",
			email: "avery@example.com",
			displayName,
			firstName: "Avery",
			lastName: "Chen",
		},
		activeHousehold: { id: "hh_avery", name: "Avery" },
		households: [
			{ id: "hh_avery", name: "Avery", role: "owner", isActive: true },
		],
		activeMember: {
			id: "mbr_avery",
			userId: "usr_avery",
			role: "owner",
			displayName,
		},
		members: [
			{
				membershipId: "mbr_avery",
				userId: "usr_avery",
				role: "owner",
				displayName,
			},
		],
	};
}

describe("reduceSessionMachine sign-out recovery auth drops", () => {
	it("disconnects and clears when the User signs out after recovery owns the activation", () => {
		const session = sessionFixture();
		const signingOut = reduceSessionMachine(activatedWith(session).state, {
			type: "signOutRequested",
		});
		const recovering = reduceSessionMachine(signingOut.state, {
			type: "signOutFailed",
			authReady: true,
			signedIn: true,
		});
		const staleBeforeDrop = reduceSessionMachine(recovering.state, {
			type: "activationSucceeded",
			attempt: 1,
			session,
		});

		expect(staleBeforeDrop.state).toBe(recovering.state);
		expect(staleBeforeDrop.effects).toEqual([]);

		const result = reduceSessionMachine(
			staleBeforeDrop.state,
			authStateChanged({ signedIn: false }),
		);

		expect(result.state.attempt).toBe(4);
		expect(result.state.pendingActivationAttempt).toBe(3);
		expect(result.state.signingOut).toBe(false);
		expect(result.state.view).toBe(initialSessionMachineState.view);
		expect(result.state.queuedReloadMode).toBeNull();
		expect(result.state.suppressActivationUntilSignedOut).toBe(false);
		expect(result.state.lastObservedAuth).toEqual({
			authReady: true,
			signedIn: false,
			activationEnabled: true,
		});
		expect(result.effects).toEqual([{ type: "disconnectAndClear" }]);
	});

	it("disconnects and clears when an old Household activation lands after a recovery auth drop", () => {
		const session = sessionFixture();
		const signingOut = reduceSessionMachine(activatedWith(session).state, {
			type: "signOutRequested",
		});
		const recovering = reduceSessionMachine(signingOut.state, {
			type: "signOutFailed",
			authReady: true,
			signedIn: true,
		});
		const authDropped = reduceSessionMachine(
			recovering.state,
			authStateChanged({ signedIn: false }),
		);

		const result = reduceSessionMachine(authDropped.state, {
			type: "activationSucceeded",
			attempt: 1,
			session,
		});

		expect(result.state).toBe(authDropped.state);
		expect(result.effects).toEqual([{ type: "disconnectAndClear" }]);
	});

	it("disconnects and clears when the recovery Household activation lands after the auth drop", () => {
		const session = sessionFixture();
		const signingOut = reduceSessionMachine(activatedWith(session).state, {
			type: "signOutRequested",
		});
		const recovering = reduceSessionMachine(signingOut.state, {
			type: "signOutFailed",
			authReady: true,
			signedIn: true,
		});
		const recoveryAttempt = recovering.state.attempt;
		const authDropped = reduceSessionMachine(
			recovering.state,
			authStateChanged({ signedIn: false }),
		);

		const result = reduceSessionMachine(authDropped.state, {
			type: "activationSucceeded",
			attempt: recoveryAttempt,
			session,
		});

		expect(result.state).toBe(authDropped.state);
		expect(result.effects).toEqual([{ type: "disconnectAndClear" }]);
	});
});
