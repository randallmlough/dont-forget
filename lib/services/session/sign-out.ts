import { reset, track } from "@/lib/analytics";
import { asError } from "@/lib/errors";
import type { Logger } from "@/lib/logger";
import { logger as defaultLogger } from "@/lib/logger";
import { clearSignedOutSessionData as defaultClearSignedOutSessionData } from "./cache";
import type {
	AuthenticatedAppSessionActivation,
	AuthenticatedAppSessionController,
	AuthenticatedAppSessionDisposal,
} from "./controller";

export type AuthenticatedAppSessionSignOutAuth =
	AuthenticatedAppSessionActivation & {
		signOut: () => Promise<void>;
	};

export type AuthenticatedAppSessionSignOutAnalytics = {
	track: typeof track;
	reset: typeof reset;
};

export type AuthenticatedAppSessionSignOut = {
	isRunning: () => boolean;
	run: () => Promise<void>;
};

export type AuthenticatedAppSessionSignOutDeps = {
	controller: AuthenticatedAppSessionController;
	getAuth: () => AuthenticatedAppSessionSignOutAuth;
	analytics?: AuthenticatedAppSessionSignOutAnalytics;
	clearSignedOutSessionData?: typeof defaultClearSignedOutSessionData;
	logger?: Logger;
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
	logger = defaultLogger,
}: AuthenticatedAppSessionSignOutDeps): AuthenticatedAppSessionSignOut {
	let running = false;

	async function run() {
		if (running) return;
		running = true;
		const signOut = getAuth().signOut;

		analytics.track("user_signed_out", {});
		analytics.reset();

		let disposal: AuthenticatedAppSessionDisposal = {
			householdIdsForLocalDataDeletion: [],
		};
		await controller
			.dispose()
			.then((nextDisposal) => {
				disposal = nextDisposal;
			})
			.catch((error) => {
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
			running = false;
		}
	}

	return {
		isRunning: () => running,
		run,
	};
}
