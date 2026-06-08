import { reset, track } from "@/lib/analytics";
import { asError } from "@/lib/errors";
import { clearUserCurrentListSelections as defaultClearCurrentListSelectionsForUser } from "@/lib/local-storage";
import type { Logger } from "@/lib/logger";
import { logger as defaultLogger } from "@/lib/logger";
import type { ServiceResetAnalytics } from "@/lib/services/analytics";
import { clearSignedOutSessionData as defaultClearSignedOutSessionData } from "./cache";
import {
	type AuthenticatedAppSessionActivation,
	type AuthenticatedAppSessionController,
	type AuthenticatedAppSessionDisposal,
	AuthenticatedAppSessionDisposalError,
} from "./controller";

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
	clearSignedOutSessionData?: typeof defaultClearSignedOutSessionData;
	clearCurrentListSelectionsForUser?: typeof defaultClearCurrentListSelectionsForUser;
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
	clearSignedOutSessionData = defaultClearSignedOutSessionData,
	clearCurrentListSelectionsForUser = defaultClearCurrentListSelectionsForUser,
	logger = defaultLogger,
	runningState,
}: AuthenticatedAppSessionSignOutDeps): AuthenticatedAppSessionSignOut {
	const state = runningState ?? { running: false };

	async function run() {
		if (state.running) return;
		state.running = true;
		const signOut = getAuth().signOut;

		analytics.track("user_signed_out", {});
		analytics.reset();

		let disposal: AuthenticatedAppSessionDisposal = {
			householdIdsForLocalDataDeletion: [],
			signedOutUserId: null,
		};
		await controller
			.dispose()
			.then((nextDisposal) => {
				disposal = nextDisposal;
			})
			.catch((error) => {
				if (error instanceof AuthenticatedAppSessionDisposalError) {
					disposal = error.disposal;
				}
				logger.error("authenticated app session sign-out dispose failed", {
					error: asError(error),
				});
			});

		try {
			await clearSignedOutSessionData(
				disposal.householdIdsForLocalDataDeletion,
			);
		} catch (error) {
			logger.error("authenticated app session sign-out local cleanup failed", {
				error: asError(error),
			});
		}

		if (disposal.signedOutUserId) {
			try {
				await clearCurrentListSelectionsForUser(disposal.signedOutUserId);
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
