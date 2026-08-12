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

		// The persisted restore payload must be cleared before the destructive
		// PowerSync wipe, so a storage failure leaves the signed-in User's local
		// data intact for recovery. Clerk sign-out is also critical: its failure
		// must propagate so the provider's signOutFailed path can recover the
		// session. Remaining local cleanup is best-effort.
		const steps: SignOutStep[] = [
			{
				critical: true,
				run: clearAuthenticatedAppSessionPresentProp,
			},
			{
				critical: false,
				failureLogMessage:
					"authenticated app session sign-out disconnect failed",
				run: disconnectAndClear,
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
