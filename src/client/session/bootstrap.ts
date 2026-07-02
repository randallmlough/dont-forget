import { track } from "@/client/lib/analytics";
import { readApiBaseUrl } from "@/client/lib/api-base-url";
import {
	BOOTSTRAP_API_PATH,
	type BootstrapResponse,
	bootstrapResponseSchema,
} from "@/shared/contracts/bootstrap";
import type { ServiceAnalytics } from "@/shared/service-analytics";

export type SessionBootstrap = BootstrapResponse;
export type SessionUser = SessionBootstrap["user"];
export type ActiveMember = SessionBootstrap["activeMember"];
export type Member = SessionBootstrap["members"][number];
export type GetSessionToken = () => Promise<string | null>;

type SessionBootstrapFetch = typeof globalThis.fetch;

export type SessionBootstrapService = {
	getSession: (getToken: GetSessionToken) => Promise<SessionBootstrap>;
};

export type SessionAuthenticatedAppSessionBootstrapDeps = {
	fetch?: SessionBootstrapFetch;
	apiBaseUrl?: () => string;
	analytics?: ServiceAnalytics;
};

export function createSessionBootstrapService(
	deps: SessionAuthenticatedAppSessionBootstrapDeps = {},
): SessionBootstrapService {
	const fetcher = deps.fetch ?? globalThis.fetch;
	const apiBaseUrl = deps.apiBaseUrl ?? readApiBaseUrl;
	const analytics = deps.analytics ?? { track };

	return {
		async getSession(getToken) {
			const token = await getToken();
			if (!token) {
				throw new Error("Missing Clerk session token");
			}

			const response = await fetcher(
				`${apiBaseUrl().replace(/\/$/, "")}${BOOTSTRAP_API_PATH}`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${token}`,
					},
				},
			);

			if (!response.ok) {
				throw new Error("Unable to prepare your Household. Please try again.");
			}

			const payload: unknown = await response.json();
			const session = bootstrapResponseSchema.parse(payload);
			analytics.track("authenticated_app_session_loaded", {
				...sessionAnalyticsProperties(session),
				source: "online",
			});

			return session;
		},
	};
}

export function sessionAnalyticsProperties(session: SessionBootstrap): {
	household_id: string;
	member_role: "owner" | "member";
	member_count: number;
} {
	return {
		household_id: session.activeHousehold.id,
		member_role: session.activeMember.role,
		member_count: session.members.length,
	};
}
