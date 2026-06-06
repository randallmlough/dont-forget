import { reset, track } from "@/lib/analytics";
import { asError } from "@/lib/errors";
import { currentListSelectionStore } from "@/lib/local-storage/current-list-selection";
import type { Logger } from "@/lib/logger";
import { logger as defaultLogger } from "@/lib/logger";
import type { ServiceResetAnalytics } from "@/lib/services/analytics";
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
	clearSignedOutSessionData = defaultClearSignedOutSessionData,
	clearCurrentListSelectionsForUser = currentListSelectionStore.clearSignedOutSelectionsForUser,
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
		const signedOutUserId = userIdFromSnapshot(controller.getSnapshot());

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

		let cleanupError: unknown = null;
		await clearSignedOutSessionData(
			disposal.householdIdsForLocalDataDeletion,
		).catch((error) => {
			cleanupError = error;
		});
		if (signedOutUserId) {
			await clearCurrentListSelectionsForUser(signedOutUserId).catch(
				(error) => {
					cleanupError ??= error;
				},
			);
		}
		if (cleanupError) {
			logger.error("authenticated app session sign-out local cleanup failed", {
				error: asError(cleanupError),
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
			state.running = false;
		}
	}

	return {
		isRunning: () => state.running,
		run,
	};
}

function userIdFromSnapshot(
	snapshot: ReturnType<AuthenticatedAppSessionController["getSnapshot"]>,
): string | null {
	switch (snapshot.status) {
		case "ready":
			return snapshot.session.user.id;
		case "loading":
		case "error":
			return snapshot.previous?.user.id ?? null;
		default:
			return null;
	}
}
