import type { ServiceResetAnalytics } from "@dont-forget/shared";
import { asError } from "@dont-forget/shared";
import { clearUserCurrentListSelections } from "@mobile/features/list/current-selection";
import { reset, track } from "@mobile/lib/analytics";
import type { Logger } from "@mobile/lib/logger";
import { logger as defaultLogger } from "@mobile/lib/logger";
import { db } from "@mobile/session/powersync";
import { clearAuthenticatedAppSessionPresent } from "./session-hint";

export type AuthenticatedAppSessionSignOutAuth = {
	signOut: () => Promise<void>;
};

export type AuthenticatedAppSessionSignOutAnalytics = ServiceResetAnalytics;

export type AuthenticatedAppSessionSignOut = {
	run: () => Promise<void>;
};

export type AuthenticatedAppSessionSignOutDeps = {
	getAuth: () => AuthenticatedAppSessionSignOutAuth;
	analytics?: AuthenticatedAppSessionSignOutAnalytics;
	clearAuthenticatedAppSessionPresent?: typeof clearAuthenticatedAppSessionPresent;
	clearCurrentListSelectionsForUser?: (userId: string) => Promise<void>;
	logger?: Logger;
	disconnect?: () => Promise<void>;
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
	disconnect = () => db.disconnect(),
	getSessionUserId,
}: AuthenticatedAppSessionSignOutDeps): AuthenticatedAppSessionSignOut {
	async function run() {
		type SignOutStep =
			| { critical: true; run: () => Promise<void> }
			| {
					critical: false;
					failureLogMessage: string;
					run: () => Promise<void>;
			  };

		const signOut = getAuth().signOut;
		const signedOutUserId = getSessionUserId();

		// The persisted restore payload and Clerk session are critical. Once both
		// are cleared, disconnect sync and remove per-User selection preferences
		// as best-effort cleanup while retaining local product data and uploads.
		// Analytics records only the completed outcome.
		const steps: SignOutStep[] = [
			{
				critical: true,
				run: clearAuthenticatedAppSessionPresentProp,
			},
			{ critical: true, run: signOut },
			{
				critical: false,
				failureLogMessage:
					"authenticated app session sign-out disconnect failed",
				run: disconnect,
			},
		];
		if (signedOutUserId) {
			steps.push({
				critical: false,
				failureLogMessage:
					"authenticated app session sign-out current list selection cleanup failed",
				run: () => clearCurrentListSelectionsForUser(signedOutUserId),
			});
		}
		for (const step of steps) {
			if (step.critical) {
				await step.run();
				continue;
			}
			try {
				await step.run();
			} catch (error) {
				logger.error(step.failureLogMessage, { error: asError(error) });
			}
		}
		analytics.track("user_signed_out", {});
		analytics.reset();
	}

	return {
		run,
	};
}
