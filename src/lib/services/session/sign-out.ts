import { reset, track } from "@/lib/analytics";
import { asError } from "@/shared/errors";
import { clearUserCurrentListSelections } from "@/lib/local-storage/current-list-selection";
import type { Logger } from "@/lib/logger";
import { logger as defaultLogger } from "@/lib/logger";
import type { ServiceResetAnalytics } from "@/shared/service-analytics";
import type {
	AuthenticatedAppSessionActivation,
	AuthenticatedAppSessionController,
	AuthenticatedAppSessionStateSnapshot,
} from "./controller";
import { clearAuthenticatedAppSessionPresent } from "./session-hint";

export type AuthenticatedAppSessionSignOutAuth =
	AuthenticatedAppSessionActivation & {
		signOut: () => Promise<void>;
	};

export type AuthenticatedAppSessionSignOutAnalytics = ServiceResetAnalytics;

export type AuthenticatedAppSessionSignOut = {
	isRunning: () => boolean;
	run: () => Promise<void>;
};

export type AuthenticatedAppSessionSignOutRunningState = {
	running: boolean;
};

export type AuthenticatedAppSessionSignOutDeps = {
	controller: AuthenticatedAppSessionController;
	getAuth: () => AuthenticatedAppSessionSignOutAuth;
	analytics?: AuthenticatedAppSessionSignOutAnalytics;
	clearAuthenticatedAppSessionPresent?: typeof clearAuthenticatedAppSessionPresent;
	clearCurrentListSelectionsForUser?: (userId: string) => Promise<void>;
	logger?: Logger;
	runningState?: AuthenticatedAppSessionSignOutRunningState;
};

const defaultAnalytics: AuthenticatedAppSessionSignOutAnalytics = {
	track,
	reset,
};

export function createAuthenticatedAppSessionSignOut({
	controller,
	getAuth,
	analytics = defaultAnalytics,
	clearAuthenticatedAppSessionPresent:
		clearAuthenticatedAppSessionPresentProp = clearAuthenticatedAppSessionPresent,
	clearCurrentListSelectionsForUser = clearUserCurrentListSelections,
	logger = defaultLogger,
	runningState,
}: AuthenticatedAppSessionSignOutDeps): AuthenticatedAppSessionSignOut {
	const state = runningState ?? { running: false };

	async function run() {
		if (state.running) return;
		state.running = true;
		const signOut = getAuth().signOut;
		// Captured before dispose(): dispose publishes the idle snapshot and
		// discards the signed-out User's Authenticated App Session.
		const signedOutUserId = sessionUserIdFromSnapshot(controller.getSnapshot());

		analytics.track("user_signed_out", {});
		analytics.reset();

		// dispose({ clearLocalData: true }) runs PowerSync `disconnectAndClear`,
		// wiping the signed-out User's local product data.
		await controller.dispose({ clearLocalData: true }).catch((error) => {
			logger.error("authenticated app session sign-out dispose failed", {
				error: asError(error),
			});
		});

		try {
			await clearAuthenticatedAppSessionPresentProp();
		} catch (error) {
			logger.error("authenticated app session sign-out local cleanup failed", {
				error: asError(error),
			});
		}

		if (signedOutUserId) {
			try {
				await clearCurrentListSelectionsForUser(signedOutUserId);
			} catch (error) {
				logger.error(
					"authenticated app session sign-out current list selection cleanup failed",
					{ error: asError(error) },
				);
			}
		}

		try {
			await signOut();
		} catch (error) {
			const auth = getAuth();
			if (auth.authReady && auth.signedIn) {
				await controller
					.activate({
						getToken: auth.getToken,
						getPowerSyncToken: auth.getPowerSyncToken,
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
			state.running = false;
		}
	}

	return {
		isRunning: () => state.running,
		run,
	};
}

function sessionUserIdFromSnapshot(
	snapshot: AuthenticatedAppSessionStateSnapshot,
): string | null {
	if (snapshot.status === "ready") return snapshot.session.user.id;
	if (snapshot.status === "loading" || snapshot.status === "error") {
		return snapshot.previous?.user.id ?? null;
	}
	return null;
}
