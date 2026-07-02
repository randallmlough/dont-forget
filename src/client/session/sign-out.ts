import { clearUserCurrentListSelections } from "@/client/features/list/current-selection";
import { reset, track } from "@/client/lib/analytics";
import type { Logger } from "@/client/lib/logger";
import { logger as defaultLogger } from "@/client/lib/logger";
import type { GetSessionToken } from "@/client/session/bootstrap";
import { db } from "@/client/session/powersync";
import { asError } from "@/shared/errors";
import type { ServiceResetAnalytics } from "@/shared/service-analytics";
import { clearAuthenticatedAppSessionPresent } from "./session-hint";

export type AuthenticatedAppSessionSignOutAuth = {
	getToken: GetSessionToken;
	getPowerSyncToken?: GetSessionToken;
	authReady: boolean;
	signedIn: boolean;
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
	getAuth: () => AuthenticatedAppSessionSignOutAuth;
	analytics?: AuthenticatedAppSessionSignOutAnalytics;
	clearAuthenticatedAppSessionPresent?: typeof clearAuthenticatedAppSessionPresent;
	clearCurrentListSelectionsForUser?: (userId: string) => Promise<void>;
	logger?: Logger;
	runningState?: AuthenticatedAppSessionSignOutRunningState;
	disconnectAndClear?: () => Promise<void>;
	getSessionUserId: () => string | null;
};

const defaultAnalytics: AuthenticatedAppSessionSignOutAnalytics = {
	track,
	reset,
};

export function createAuthenticatedAppSessionSignOut({
	getAuth,
	analytics = defaultAnalytics,
	clearAuthenticatedAppSessionPresent:
		clearAuthenticatedAppSessionPresentProp = clearAuthenticatedAppSessionPresent,
	clearCurrentListSelectionsForUser = clearUserCurrentListSelections,
	logger = defaultLogger,
	runningState,
	disconnectAndClear = () => db.disconnectAndClear(),
	getSessionUserId,
}: AuthenticatedAppSessionSignOutDeps): AuthenticatedAppSessionSignOut {
	const state = runningState ?? { running: false };

	async function run() {
		if (state.running) return;
		state.running = true;
		const signOut = getAuth().signOut;
		const signedOutUserId = getSessionUserId();

		analytics.track("user_signed_out", {});
		analytics.reset();

		await disconnectAndClear().catch((error) => {
			logger.error("authenticated app session sign-out disconnect failed", {
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
		} finally {
			state.running = false;
		}
	}

	return {
		isRunning: () => state.running,
		run,
	};
}
