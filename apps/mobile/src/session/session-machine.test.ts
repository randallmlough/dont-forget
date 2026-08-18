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

	it("retires a ready User before activating a directly observed different Clerk User", () => {
		const ready = activatedWith(sessionFixture());

		const result = reduceSessionMachine(
			ready.state,
			authStateChanged({ clerkUserId: "user_blake" }),
		);

		expect(result.state.view).toBe(initialSessionMachineState.view);
		expect(result.state.attempt).toBe(2);
		expect(result.effects).toEqual([
			{ type: "disconnect" },
			{ type: "activate", attempt: 2, allowCached: true },
		]);
	});

	it("retires a ready User when a different Clerk User is observed while activation is disabled", () => {
		const ready = activatedWith(sessionFixture());
		const disabled = reduceSessionMachine(
			ready.state,
			authStateChanged({ activationEnabled: false }),
		);

		const changedUser = reduceSessionMachine(
			disabled.state,
			authStateChanged({
				clerkUserId: "user_blake",
				activationEnabled: false,
			}),
		);

		expect(changedUser.state.view).toBe(initialSessionMachineState.view);
		expect(changedUser.state.attempt).toBe(2);
		expect(changedUser.state.pendingActivationAttempt).toBeNull();
		expect(changedUser.effects).toEqual([{ type: "disconnect" }]);

		const enabled = reduceSessionMachine(
			changedUser.state,
			authStateChanged({ clerkUserId: "user_blake" }),
		);

		expect(enabled.state.attempt).toBe(3);
		expect(enabled.effects).toEqual([
			{ type: "activate", attempt: 3, allowCached: true },
		]);
	});

	it("defers activation when activation is disabled and no reload has been requested", () => {
		const result = reduceSessionMachine(
			initialSessionMachineState,
			authStateChanged({ activationEnabled: false }),
		);

		expect(result.state.attempt).toBe(0);
		expect(result.state.view).toBe(initialSessionMachineState.view);
		expect(result.state.lastObservedAuth).toEqual({
			authReady: true,
			signedIn: true,
			clerkUserId: "user_avery",
			activationEnabled: false,
		});
		expect(result.effects).toEqual([]);
	});

	it("requires sign-in and suppresses restore when disabled activation later loses auth", () => {
		const session = sessionFixture();
		const disabled = reduceSessionMachine(
			initialSessionMachineState,
			authStateChanged({ activationEnabled: false }),
		);

		const signedOut = reduceSessionMachine(
			disabled.state,
			authStateChanged({ signedIn: false }),
		);

		expect(signedOut.state.signInRequired).toBe(true);
		expect(signedOut.state.restoreSuppressedUntilSignedIn).toBe(true);
		expect(signedOut.effects).toEqual([
			{ type: "clearSessionHint" },
			{ type: "disconnect" },
		]);

		const result = reduceSessionMachine(signedOut.state, {
			type: "sessionRestoreRequested",
			session,
		});

		expect(result.state).toBe(signedOut.state);
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

		expect(disabled.state.attempt).toBe(ready.state.attempt);
		expect(disabled.state.view).toBe(ready.state.view);
		expect(disabled.state.lastObservedAuth).toEqual({
			authReady: true,
			signedIn: true,
			clerkUserId: "user_avery",
			activationEnabled: false,
		});
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

	it("requires sign-in and clears the restore payload when an online session loses auth", () => {
		const session = sessionFixture();
		const ready = activatedWith(session);
		const result = reduceSessionMachine(
			ready.state,
			authStateChanged({ signedIn: false }),
		);

		expect(result.state.attempt).toBe(2);
		expect(result.state.view).toBe(initialSessionMachineState.view);
		expect(result.state.lastKnownUserId).toBe("usr_avery");
		expect(result.state.signInRequired).toBe(true);
		expect(result.effects).toEqual([
			{ type: "clearSessionHint" },
			{ type: "disconnect" },
		]);
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
		expect(result.effects).toEqual([{ type: "markSessionHint", session }]);
	});

	it("publishes a different-User block without exposing the incoming session", () => {
		const session = sessionFixture({ userId: "usr_blake" });
		const activating = reduceSessionMachine(
			initialSessionMachineState,
			authStateChanged({ clerkUserId: "user_blake" }),
		);

		const result = reduceSessionMachine(activating.state, {
			type: "activationBlocked",
			attempt: 1,
			clerkUserId: "user_blake",
			session,
		});

		expect(result.state.view).toBe(initialSessionMachineState.view);
		expect(result.state.localData).toEqual({
			status: "differentUserBlocked",
			isRemoving: false,
			errorMessage: null,
		});
		expect(result.state.blockedActivation).toEqual({
			attempt: 1,
			clerkUserId: "user_blake",
			session,
		});
		expect(result.effects).toEqual([]);
	});

	it("keeps removal failures blocked and retries activation only after removal succeeds", () => {
		const session = sessionFixture({ userId: "usr_blake" });
		const activating = reduceSessionMachine(
			initialSessionMachineState,
			authStateChanged({ clerkUserId: "user_blake" }),
		);
		const blocked = reduceSessionMachine(activating.state, {
			type: "activationBlocked",
			attempt: 1,
			clerkUserId: "user_blake",
			session,
		});

		const removing = reduceSessionMachine(blocked.state, {
			type: "localDataRemovalRequested",
			attempt: 1,
		});
		expect(removing.state.localData).toEqual({
			status: "differentUserBlocked",
			isRemoving: true,
			errorMessage: null,
		});

		const failed = reduceSessionMachine(removing.state, {
			type: "localDataRemovalFailed",
			attempt: 1,
			message: "Unable to remove data.",
		});
		expect(failed.state.localData).toEqual({
			status: "differentUserBlocked",
			isRemoving: false,
			errorMessage: "Unable to remove data.",
		});

		const retried = reduceSessionMachine(failed.state, {
			type: "localDataRemovalRequested",
			attempt: 1,
		});
		const succeeded = reduceSessionMachine(retried.state, {
			type: "localDataRemovalSucceeded",
			attempt: 1,
		});
		expect(succeeded.state.localData).toEqual({ status: "ready" });
		expect(succeeded.state.blockedActivation).toBeNull();
		expect(succeeded.effects).toEqual([
			{ type: "activate", attempt: 2, allowCached: false },
		]);
	});

	it("returns to sign-in after signing out only the blocked incoming Clerk User", () => {
		const session = sessionFixture({ userId: "usr_blake" });
		const activating = reduceSessionMachine(
			initialSessionMachineState,
			authStateChanged({ clerkUserId: "user_blake" }),
		);
		const blocked = reduceSessionMachine(activating.state, {
			type: "activationBlocked",
			attempt: 1,
			clerkUserId: "user_blake",
			session,
		});

		const requested = reduceSessionMachine(blocked.state, {
			type: "blockedIncomingUserSignOutRequested",
			attempt: 1,
		});
		const result = reduceSessionMachine(requested.state, {
			type: "blockedIncomingUserSignOutSucceeded",
			attempt: 1,
			signedIn: true,
		});
		const signedOut = reduceSessionMachine(
			result.state,
			authStateChanged({ signedIn: false, clerkUserId: null }),
		);

		expect(result.state.localData).toEqual({ status: "ready" });
		expect(result.state.blockedActivation).toBeNull();
		expect(result.state.signInRequired).toBe(true);
		expect(result.state.restoreSuppressedUntilSignedIn).toBe(true);
		expect(result.state.suppressActivationUntilSignedOut).toBe(true);
		expect(result.effects).toEqual([{ type: "resetAnalytics" }]);
		expect(signedOut.state.suppressActivationUntilSignedOut).toBe(false);
		expect(signedOut.effects).toEqual([]);
	});

	it("completes previous-User recovery when Clerk signs out before sign-out rejects", () => {
		const session = sessionFixture({ userId: "usr_blake" });
		const activating = reduceSessionMachine(
			initialSessionMachineState,
			authStateChanged({ clerkUserId: "user_blake" }),
		);
		const blocked = reduceSessionMachine(activating.state, {
			type: "activationBlocked",
			attempt: 1,
			clerkUserId: "user_blake",
			session,
		});
		const requested = reduceSessionMachine(blocked.state, {
			type: "blockedIncomingUserSignOutRequested",
			attempt: 1,
		});
		const signedOutBeforeCompletion = reduceSessionMachine(
			requested.state,
			authStateChanged({ signedIn: false, clerkUserId: null }),
		);

		expect(
			signedOutBeforeCompletion.state.pendingBlockedIncomingUserSignOutAttempt,
		).toBeNull();
		expect(signedOutBeforeCompletion.state.blockedActivation).toBeNull();
		expect(signedOutBeforeCompletion.state.localData).toEqual({
			status: "ready",
		});
		expect(signedOutBeforeCompletion.state.signInRequired).toBe(true);
		expect(signedOutBeforeCompletion.effects).toEqual([
			{ type: "resetAnalytics" },
		]);

		const failed = reduceSessionMachine(signedOutBeforeCompletion.state, {
			type: "blockedIncomingUserSignOutFailed",
			attempt: 1,
			signedIn: false,
			message: "Unable to return to sign in. Please try again.",
		});
		expect(failed.state).toBe(signedOutBeforeCompletion.state);
		expect(failed.state.pendingBlockedIncomingUserSignOutAttempt).toBeNull();
		expect(failed.state.blockedActivation).toBeNull();
		expect(failed.state.localData).toEqual({ status: "ready" });
		expect(failed.state.signInRequired).toBe(true);
		expect(failed.state.restoreSuppressedUntilSignedIn).toBe(true);
		expect(failed.state.suppressActivationUntilSignedOut).toBe(false);
		expect(failed.effects).toEqual([]);
	});

	it("keeps previous-User recovery blocked when incoming User sign-out rejects while still signed in", () => {
		const session = sessionFixture({ userId: "usr_blake" });
		const activating = reduceSessionMachine(
			initialSessionMachineState,
			authStateChanged({ clerkUserId: "user_blake" }),
		);
		const blocked = reduceSessionMachine(activating.state, {
			type: "activationBlocked",
			attempt: 1,
			clerkUserId: "user_blake",
			session,
		});
		const requested = reduceSessionMachine(blocked.state, {
			type: "blockedIncomingUserSignOutRequested",
			attempt: 1,
		});

		const failed = reduceSessionMachine(requested.state, {
			type: "blockedIncomingUserSignOutFailed",
			attempt: 1,
			signedIn: true,
			message: "Unable to return to sign in. Please try again.",
		});

		expect(failed.state.pendingBlockedIncomingUserSignOutAttempt).toBeNull();
		expect(failed.state.blockedActivation).not.toBeNull();
		expect(failed.state.localData).toEqual({
			status: "differentUserBlocked",
			isRemoving: false,
			errorMessage: "Unable to return to sign in. Please try again.",
		});
		expect(failed.effects).toEqual([]);
	});

	it("retires a rejected previous-User recovery when Clerk later reports signed out", () => {
		const session = sessionFixture({ userId: "usr_blake" });
		const activating = reduceSessionMachine(
			initialSessionMachineState,
			authStateChanged({ clerkUserId: "user_blake" }),
		);
		const blocked = reduceSessionMachine(activating.state, {
			type: "activationBlocked",
			attempt: 1,
			clerkUserId: "user_blake",
			session,
		});
		const requested = reduceSessionMachine(blocked.state, {
			type: "blockedIncomingUserSignOutRequested",
			attempt: 1,
		});
		const failedWhileSignedIn = reduceSessionMachine(requested.state, {
			type: "blockedIncomingUserSignOutFailed",
			attempt: 1,
			signedIn: true,
			message: "Unable to return to sign in. Please try again.",
		});

		const result = reduceSessionMachine(
			failedWhileSignedIn.state,
			authStateChanged({ signedIn: false, clerkUserId: null }),
		);

		expect(failedWhileSignedIn.effects).toEqual([]);
		expect(result.state.localData).toEqual({ status: "ready" });
		expect(result.state.blockedActivation).toBeNull();
		expect(result.state.signInRequired).toBe(true);
		expect(result.state.restoreSuppressedUntilSignedIn).toBe(true);
		expect(result.effects).toEqual([{ type: "resetAnalytics" }]);
	});

	it("supersedes pre-armed previous-User recovery for an unrelated signed-in Clerk User", () => {
		const session = sessionFixture({ userId: "usr_blake" });
		const activating = reduceSessionMachine(
			initialSessionMachineState,
			authStateChanged({ clerkUserId: "user_blake" }),
		);
		const blocked = reduceSessionMachine(activating.state, {
			type: "activationBlocked",
			attempt: 1,
			clerkUserId: "user_blake",
			session,
		});
		const requested = reduceSessionMachine(blocked.state, {
			type: "blockedIncomingUserSignOutRequested",
			attempt: 1,
		});

		const changedUser = reduceSessionMachine(
			requested.state,
			authStateChanged({
				clerkUserId: "user_casey",
				activationEnabled: false,
			}),
		);

		expect(
			changedUser.state.pendingBlockedIncomingUserSignOutAttempt,
		).toBeNull();
		expect(changedUser.state.blockedActivation).toBeNull();
		expect(changedUser.state.attempt).toBe(2);
		expect(changedUser.state.pendingActivationAttempt).toBeNull();
		expect(changedUser.effects).toEqual([{ type: "disconnect" }]);
		const staleCompletion = reduceSessionMachine(changedUser.state, {
			type: "blockedIncomingUserSignOutSucceeded",
			attempt: 1,
			signedIn: true,
		});
		expect(staleCompletion.state).toBe(changedUser.state);
		expect(staleCompletion.effects).toEqual([]);

		const enabled = reduceSessionMachine(
			staleCompletion.state,
			authStateChanged({ clerkUserId: "user_casey" }),
		);
		expect(enabled.state.attempt).toBe(3);
		expect(enabled.effects).toEqual([
			{ type: "activate", attempt: 3, allowCached: true },
		]);

		const duplicate = reduceSessionMachine(
			enabled.state,
			authStateChanged({ clerkUserId: "user_casey" }),
		);
		expect(duplicate.state).toBe(enabled.state);
		expect(duplicate.effects).toEqual([]);
	});

	it("restores a persisted session after signed-in cold-start activation fails", () => {
		const session = sessionFixture();
		const activating = reduceSessionMachine(
			initialSessionMachineState,
			authStateChanged(),
		);
		const fallback = reduceSessionMachine(activating.state, {
			type: "activationFallbackRequested",
			attempt: 1,
			session,
		});

		expect(fallback.state.pendingActivationAttempt).toBeNull();
		expect(fallback.state.pendingRestoreAttempt).toBe(1);
		expect(fallback.effects).toEqual([
			{ type: "restoreSession", attempt: 1, session },
		]);

		const restored = reduceSessionMachine(fallback.state, {
			type: "sessionRestoreSucceeded",
			attempt: 1,
			session,
		});

		expect(restored.state.view).toEqual({
			state: { status: "ready", refreshing: false },
			session,
		});
		expect(restored.state.readySessionSource).toBe("restored");
		expect(restored.effects).toEqual([
			{ type: "trackSessionLoaded", source: "cached", session },
		]);
	});

	it("restores a persisted session after a signed-out cold start observation", () => {
		const session = sessionFixture();
		const signedOut = reduceSessionMachine(
			initialSessionMachineState,
			authStateChanged({ signedIn: false }),
		);
		const restoreRequested = reduceSessionMachine(signedOut.state, {
			type: "sessionRestoreRequested",
			session,
		});

		expect(restoreRequested.effects).toEqual([
			{ type: "restoreSession", attempt: 1, session },
		]);
		expect(restoreRequested.state.pendingRestoreAttempt).toBe(1);
		expect(restoreRequested.state.restorableSession).toBe(session);

		const restored = reduceSessionMachine(restoreRequested.state, {
			type: "sessionRestoreSucceeded",
			attempt: 1,
			session,
		});

		expect(restored.state.view).toEqual({
			state: { status: "ready", refreshing: false },
			session,
		});
		expect(restored.state.readySessionSource).toBe("restored");
		expect(restored.state.lastKnownUserId).toBe("usr_avery");
		expect(restored.state.pendingRestoreAttempt).toBeNull();
		expect(restored.state.restorableSession).toBeNull();
		expect(restored.effects).toEqual([
			{ type: "trackSessionLoaded", source: "cached", session },
		]);
	});

	it("publishes a retryable error when restore fails and retries without rereading the payload", () => {
		const session = sessionFixture();
		const signedOut = reduceSessionMachine(
			initialSessionMachineState,
			authStateChanged({ signedIn: false }),
		);
		const restoreRequested = reduceSessionMachine(signedOut.state, {
			type: "sessionRestoreRequested",
			session,
		});

		const failed = reduceSessionMachine(restoreRequested.state, {
			type: "sessionRestoreFailed",
			attempt: 1,
		});

		expect(failed.state.view).toEqual({
			state: { status: "error", message: GENERIC_ERROR_MESSAGE },
			session: null,
		});
		expect(failed.state.restoreFailed).toBe(true);
		expect(failed.state.restorableSession).toBe(session);
		expect(failed.effects).toEqual([]);

		const retried = reduceSessionMachine(
			failed.state,
			reloadRequested({ signedIn: false }),
		);

		expect(retried.state.view).toBe(initialSessionMachineState.view);
		expect(retried.state.pendingRestoreAttempt).toBe(1);
		expect(retried.effects).toEqual([
			{ type: "restoreSession", attempt: 1, session },
		]);
	});

	it("does not restore after an in-memory session is cleared by auth loss", () => {
		const session = sessionFixture();
		const ready = activatedWith(session);
		const signedOut = reduceSessionMachine(
			ready.state,
			authStateChanged({ signedIn: false }),
		);
		expect(signedOut.state.signInRequired).toBe(true);
		const result = reduceSessionMachine(signedOut.state, {
			type: "sessionRestoreRequested",
			session,
		});

		expect(result.state).toBe(signedOut.state);
		expect(result.effects).toEqual([]);
	});

	it("requires sign-in and suppresses restore when auth drops before activation succeeds", () => {
		const session = sessionFixture();
		const activating = reduceSessionMachine(
			initialSessionMachineState,
			authStateChanged(),
		);

		const signedOut = reduceSessionMachine(
			activating.state,
			authStateChanged({ signedIn: false }),
		);

		expect(signedOut.state.signInRequired).toBe(true);
		expect(signedOut.state.restoreSuppressedUntilSignedIn).toBe(true);
		expect(signedOut.effects).toEqual([
			{ type: "clearSessionHint" },
			{ type: "disconnect" },
		]);

		const result = reduceSessionMachine(signedOut.state, {
			type: "sessionRestoreRequested",
			session,
		});

		expect(result.state).toBe(signedOut.state);
		expect(result.effects).toEqual([]);
	});

	it("does not restore while signing out or after sign-out succeeded", () => {
		const session = sessionFixture();
		const signingOut = reduceSessionMachine(activatedWith(session).state, {
			type: "signOutRequested",
		});
		const blockedDuringSignOut = reduceSessionMachine(signingOut.state, {
			type: "sessionRestoreRequested",
			session,
		});
		const signedOut = reduceSessionMachine(signingOut.state, {
			type: "signOutSucceeded",
			signedIn: false,
		});
		const blockedAfterSignOut = reduceSessionMachine(signedOut.state, {
			type: "sessionRestoreRequested",
			session,
		});

		expect(blockedDuringSignOut.state).toBe(signingOut.state);
		expect(blockedDuringSignOut.effects).toEqual([]);
		expect(blockedAfterSignOut.state).toBe(signedOut.state);
		expect(blockedAfterSignOut.effects).toEqual([]);
	});

	it("does not clear the database under a restore-owned connection", () => {
		const session = sessionFixture();
		const signedOut = reduceSessionMachine(
			initialSessionMachineState,
			authStateChanged({ signedIn: false }),
		);
		const restoreRequested = reduceSessionMachine(signedOut.state, {
			type: "sessionRestoreRequested",
			session,
		});

		const staleActivation = reduceSessionMachine(restoreRequested.state, {
			type: "activationSucceeded",
			attempt: 0,
			session,
		});

		expect(restoreRequested.state.pendingRestoreAttempt).toBe(1);
		expect(staleActivation.state).toBe(restoreRequested.state);
		expect(staleActivation.effects).toEqual([]);
	});

	it("cleans up when a stale restore connection lands after sign-out starts", () => {
		const session = sessionFixture();
		const signedOut = reduceSessionMachine(
			initialSessionMachineState,
			authStateChanged({ signedIn: false }),
		);
		const restoreRequested = reduceSessionMachine(signedOut.state, {
			type: "sessionRestoreRequested",
			session,
		});
		const signingOut = reduceSessionMachine(restoreRequested.state, {
			type: "signOutRequested",
		});

		const staleRestore = reduceSessionMachine(signingOut.state, {
			type: "sessionRestoreSucceeded",
			attempt: 1,
			session,
		});

		expect(staleRestore.state).toBe(signingOut.state);
		expect(staleRestore.effects).toEqual([{ type: "disconnect" }]);
	});

	it("keeps a restored signed-out session on normal reload", () => {
		const restored = restoredWith(sessionFixture());

		const result = reduceSessionMachine(
			restored.state,
			reloadRequested({ signedIn: false }),
		);

		expect(result.state).toBe(restored.state);
		expect(result.effects).toEqual([]);
	});

	it("replaces a restored session with a later fresh session from a different User", () => {
		const restoredSession = sessionFixture();
		const freshSession = sessionFixture({
			displayName: "Blake",
			userId: "usr_blake",
		});
		const restored = restoredWith(restoredSession);

		const activating = reduceSessionMachine(restored.state, authStateChanged());

		expect(activating.state.view).toBe(initialSessionMachineState.view);
		expect(activating.state.pendingActivationRestoredUserId).toBe("usr_avery");
		expect(activating.effects).toEqual([
			{ type: "disconnect" },
			{ type: "activate", attempt: 2, allowCached: true },
		]);

		const activated = reduceSessionMachine(activating.state, {
			type: "activationSucceeded",
			attempt: 2,
			session: freshSession,
		});

		expect(activated.state.view).toEqual({
			state: { status: "ready", refreshing: false },
			session: freshSession,
		});
		expect(activated.state.readySessionSource).toBe("online");
		expect(activated.state.lastKnownUserId).toBe("usr_blake");
		expect(activated.effects).toEqual([
			{ type: "markSessionHint", session: freshSession },
		]);
	});

	it("replaces an in-flight restored session with a later fresh session from a different User", () => {
		const restoredSession = sessionFixture();
		const freshSession = sessionFixture({
			displayName: "Blake",
			userId: "usr_blake",
		});
		const signedOut = reduceSessionMachine(
			initialSessionMachineState,
			authStateChanged({ signedIn: false }),
		);
		const restoreRequested = reduceSessionMachine(signedOut.state, {
			type: "sessionRestoreRequested",
			session: restoredSession,
		});

		const activating = reduceSessionMachine(
			restoreRequested.state,
			authStateChanged(),
		);

		expect(activating.state.view).toBe(initialSessionMachineState.view);
		expect(activating.state.pendingActivationRestoredUserId).toBe("usr_avery");
		expect(activating.effects).toEqual([
			{ type: "disconnect" },
			{ type: "activate", attempt: 2, allowCached: true },
		]);

		const activated = reduceSessionMachine(activating.state, {
			type: "activationSucceeded",
			attempt: 2,
			session: freshSession,
		});

		expect(activated.state.view).toEqual({
			state: { status: "ready", refreshing: false },
			session: freshSession,
		});
		expect(activated.state.readySessionSource).toBe("online");
		expect(activated.state.lastKnownUserId).toBe("usr_blake");
		expect(activated.effects).toEqual([
			{ type: "markSessionHint", session: freshSession },
		]);
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
			clerkUserId: null,
			activationEnabled: true,
		});
		expect(result.effects).toEqual([]);
	});

	it("disconnects non-destructively when a stale connect lands during sign-out cleanup", () => {
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
		expect(result.effects).toEqual([{ type: "disconnect" }]);
	});

	it("disconnects non-destructively when a stale connect lands after sign-out succeeded", () => {
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
		expect(result.effects).toEqual([{ type: "disconnect" }]);
	});

	it("disconnects non-destructively when Clerk flipped signed out before the next auth observation", () => {
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
		expect(result.effects).toEqual([{ type: "disconnect" }]);
	});

	it("disconnects non-destructively when a stale connect lands after auth was observed signed out", () => {
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
		expect(result.effects).toEqual([{ type: "disconnect" }]);
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

	it("disconnects non-destructively when a stale activation resolves after a restored session is ready", () => {
		const session = sessionFixture();
		const restored = restoredWith(session);

		const result = reduceSessionMachine(restored.state, {
			type: "activationSucceeded",
			attempt: 0,
			session: sessionFixture({ displayName: "Stale" }),
		});

		expect(result.state).toBe(restored.state);
		expect(result.effects).toEqual([{ type: "disconnect" }]);
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

function restoredWith(session: SessionBootstrap): {
	state: SessionMachineState;
	effects: SessionMachineEffect[];
} {
	return run(
		authStateChanged({ signedIn: false }),
		{ type: "sessionRestoreRequested", session },
		{
			type: "sessionRestoreSucceeded",
			attempt: 1,
			session,
		},
	);
}

function authStateChanged(
	overrides: Partial<{
		authReady: boolean;
		signedIn: boolean;
		activationEnabled: boolean;
		clerkUserId: string | null;
	}> = {},
): SessionMachineEvent {
	const signedIn = overrides.signedIn ?? true;
	const clerkUserId =
		overrides.clerkUserId !== undefined
			? overrides.clerkUserId
			: signedIn
				? "user_avery"
				: null;
	return {
		type: "authStateChanged",
		authReady: true,
		signedIn,
		activationEnabled: true,
		...overrides,
		clerkUserId,
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
	overrides: { displayName?: string; userId?: string } = {},
): SessionBootstrap {
	const displayName = overrides.displayName ?? "Avery Chen";
	const userId = overrides.userId ?? "usr_avery";
	return {
		user: {
			id: userId,
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
			userId,
			role: "owner",
			displayName,
		},
		members: [
			{
				membershipId: "mbr_avery",
				userId,
				role: "owner",
				displayName,
			},
		],
	};
}

describe("reduceSessionMachine sign-out recovery auth drops", () => {
	it("disconnects non-destructively when the User signs out after recovery owns the activation", () => {
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
			clerkUserId: null,
			activationEnabled: true,
		});
		expect(result.effects).toEqual([{ type: "disconnect" }]);
	});

	it("disconnects non-destructively when an old Household activation lands after a recovery auth drop", () => {
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
		expect(result.effects).toEqual([{ type: "disconnect" }]);
	});

	it("disconnects non-destructively when the recovery Household activation lands after the auth drop", () => {
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
		expect(result.effects).toEqual([{ type: "disconnect" }]);
	});
});
