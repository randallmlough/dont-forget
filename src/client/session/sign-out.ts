import { clearUserCurrentListSelections } from "@/client/features/list/current-selection";
import { reset, track } from "@/client/lib/analytics";
import type { Logger } from "@/client/lib/logger";
import { logger as defaultLogger } from "@/client/lib/logger";
import { db } from "@/client/session/powersync";
import { asError } from "@/shared/errors";
import type { ServiceResetAnalytics } from "@/shared/service-analytics";
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
	disconnectAndClear = () => db.disconnectAndClear(),
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

		analytics.track("user_signed_out", {});
		analytics.reset();

		// Local cleanup is best-effort: a partially failed device wipe must not
		// keep the User signed in. Clerk sign-out is the one critical step — its
		// failure must propagate so the provider's signOutFailed path can
		// recover the session.
		const steps: SignOutStep[] = [
			{
				critical: false,
				failureLogMessage:
					"authenticated app session sign-out disconnect failed",
				run: disconnectAndClear,
			},
			{
				critical: true,
				run: clearAuthenticatedAppSessionPresentProp,
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
		steps.push({ critical: true, run: signOut });

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
	}

	return {
		run,
	};
}
