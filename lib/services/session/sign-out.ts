import { reset, track } from "@/lib/analytics";
import { createUsersApiClient } from "@/lib/client-api/users";
import { asError } from "@/lib/errors";
import { clearUserCurrentListSelections } from "@/lib/local-storage/current-list-selection";
import type { Logger } from "@/lib/logger";
import { logger as defaultLogger } from "@/lib/logger";
import {
	disabledPreference,
	readNotificationPreference,
	writeNotificationPreference,
} from "@/lib/push/notification-preference";
import type { ServiceResetAnalytics } from "@/lib/services/analytics";
import type { GetSessionToken } from "./bootstrap";
import { clearSignedOutSessionData as defaultClearSignedOutSessionData } from "./cache";
import type {
	AuthenticatedAppSessionActivation,
	AuthenticatedAppSessionController,
	AuthenticatedAppSessionDisposal,
	AuthenticatedAppSessionStateSnapshot,
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

export type ClearPushNotificationsForUser = (input: {
	getToken: GetSessionToken;
	userId: string;
}) => Promise<void>;

export type AuthenticatedAppSessionSignOutDeps = {
	controller: AuthenticatedAppSessionController;
	getAuth: () => AuthenticatedAppSessionSignOutAuth;
	analytics?: AuthenticatedAppSessionSignOutAnalytics;
	clearSignedOutSessionData?: typeof defaultClearSignedOutSessionData;
	clearCurrentListSelectionsForUser?: (userId: string) => Promise<void>;
	clearPushNotificationsForUser?: ClearPushNotificationsForUser;
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
	clearCurrentListSelectionsForUser = clearUserCurrentListSelections,
	clearPushNotificationsForUser = defaultClearPushNotificationsForUser,
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

		if (signedOutUserId) {
			try {
				await clearCurrentListSelectionsForUser(signedOutUserId);
			} catch (error) {
				logger.error(
					"authenticated app session sign-out current list selection cleanup failed",
					{ error: asError(error) },
				);
			}

			try {
				await clearPushNotificationsForUser({
					getToken: getAuth().getToken,
					userId: signedOutUserId,
				});
			} catch (error) {
				logger.error(
					"authenticated app session sign-out push notification cleanup failed",
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

async function defaultClearPushNotificationsForUser({
	getToken,
	userId,
}: {
	getToken: GetSessionToken;
	userId: string;
}): Promise<void> {
	const preference = await readNotificationPreference(userId);
	if (preference.enabled) {
		const client = createUsersApiClient({ getToken });
		await client.unregisterPushToken({
			expoPushToken: preference.expoPushToken,
		});
	}

	await writeNotificationPreference(userId, disabledPreference());
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
