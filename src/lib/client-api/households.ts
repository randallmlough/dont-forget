import { readApiBaseUrl } from "@/lib/client-api/api-base-url";
import {
	type HouseholdJoinCodeSource,
	MANUAL_HOUSEHOLD_JOIN_CODE_SOURCE,
} from "@/shared/household-join-code-source";
import {
	createHouseholdResponseSchema,
	type HouseholdJoinCode,
	type HouseholdJoinCodePreview,
	joinCodePreviewSchema,
	joinCodeResponseSchema,
	type LeaveHouseholdResponse,
	leaveHouseholdResponseSchema,
	listMembersResponseSchema,
	renameHouseholdResponseSchema,
} from "@/shared/contracts/households";
import {
	type CreateInvitationResponse,
	createInvitationResponseSchema,
	type InvitationPreview,
	type InvitationRecord,
	invitationPreviewSchema,
	listInvitationsResponseSchema,
	type PendingInvitation,
	revokeInvitationResponseSchema,
} from "@/shared/contracts/invitations";
import type { HouseholdMember } from "@/shared/contracts/members";

export type {
	CreateInvitationResponse,
	HouseholdJoinCode,
	HouseholdJoinCodePreview,
	HouseholdMember,
	InvitationPreview,
	InvitationRecord,
	LeaveHouseholdResponse,
	PendingInvitation,
};

export type ApiGetToken = () => Promise<string | null>;

export type HouseholdApiClient = {
	createHousehold(input: {
		name?: string;
	}): Promise<{ id: string; name: string }>;
	renameHousehold(input: {
		householdId: string;
		name: string;
	}): Promise<{ id: string; name: string }>;
	listMembers(householdId: string): Promise<HouseholdMember[]>;
	removeMember(input: {
		householdId: string;
		membershipId: string;
	}): Promise<void>;
	setMemberRole(input: {
		householdId: string;
		membershipId: string;
		role: "owner" | "member";
	}): Promise<void>;
	leaveHousehold(householdId: string): Promise<LeaveHouseholdResponse>;
	listInvitations(householdId: string): Promise<PendingInvitation[]>;
	createInvitation(input: {
		householdId: string;
		email: string | null;
	}): Promise<CreateInvitationResponse>;
	revokeInvitation(invitationId: string): Promise<InvitationRecord>;
	getJoinCode(householdId: string): Promise<HouseholdJoinCode>;
	regenerateJoinCode(householdId: string): Promise<HouseholdJoinCode>;
	setJoinCodeEnabled(input: {
		householdId: string;
		enabled: boolean;
	}): Promise<HouseholdJoinCode>;
	switchHousehold(householdId: string): Promise<void>;
	previewInvitation(token: string): Promise<InvitationPreview>;
	acceptInvitation(token: string): Promise<void>;
	previewJoinCode(code: string): Promise<HouseholdJoinCodePreview>;
	joinByCode(code: string, source?: HouseholdJoinCodeSource): Promise<void>;
};

export function createHouseholdApiClient({
	getToken,
	fetcher = globalThis.fetch,
	apiBaseUrl = readApiBaseUrl,
}: {
	getToken: ApiGetToken;
	fetcher?: typeof globalThis.fetch;
	apiBaseUrl?: () => string;
}): HouseholdApiClient {
	type ClientRequestInit = RequestInit & { allowStatuses?: number[] };
	const authed = (path: string, init?: ClientRequestInit) =>
		requestJson(path, { ...init, getToken, fetcher, apiBaseUrl });
	const publicRequest = (path: string, init?: ClientRequestInit) =>
		requestJson(path, { ...init, fetcher, apiBaseUrl });

	return {
		async createHousehold(input) {
			const payload = await authed("/api/households", {
				method: "POST",
				body: JSON.stringify({ name: input.name }),
			});
			return createHouseholdResponseSchema.parse(payload).household;
		},
		async renameHousehold(input) {
			const payload = await authed(`/api/households/${input.householdId}`, {
				method: "PATCH",
				body: JSON.stringify({ name: input.name }),
			});
			return renameHouseholdResponseSchema.parse(payload).household;
		},
		async listMembers(householdId) {
			const payload = await authed(`/api/households/${householdId}/members`);
			return listMembersResponseSchema.parse(payload).members;
		},
		async removeMember(input) {
			await authed(
				`/api/households/${input.householdId}/members/${input.membershipId}`,
				{ method: "DELETE" },
			);
		},
		async setMemberRole(input) {
			await authed(
				`/api/households/${input.householdId}/members/${input.membershipId}`,
				{
					method: "PATCH",
					body: JSON.stringify({ role: input.role }),
				},
			);
		},
		async leaveHousehold(householdId) {
			const payload = await authed(
				`/api/households/${householdId}/members/me/leave`,
				{
					method: "POST",
				},
			);
			return leaveHouseholdResponseSchema.parse(payload);
		},
		async listInvitations(householdId) {
			const payload = await authed(
				`/api/households/${householdId}/invitations`,
			);
			return listInvitationsResponseSchema.parse(payload).invitations;
		},
		async createInvitation(input) {
			const payload = await authed("/api/invitations", {
				method: "POST",
				body: JSON.stringify({
					householdId: input.householdId,
					email: input.email,
				}),
			});
			return createInvitationResponseSchema.parse(payload);
		},
		async revokeInvitation(invitationId) {
			const payload = await authed(`/api/invitations/${invitationId}`, {
				method: "PATCH",
				body: JSON.stringify({ revoked: true }),
			});
			return revokeInvitationResponseSchema.parse(payload).invitation;
		},
		async getJoinCode(householdId) {
			const payload = await authed(`/api/households/${householdId}/join-code`);
			return joinCodeResponseSchema.parse(payload).joinCode;
		},
		async regenerateJoinCode(householdId) {
			const payload = await authed(
				`/api/households/${householdId}/join-code/regenerate`,
				{ method: "POST" },
			);
			return joinCodeResponseSchema.parse(payload).joinCode;
		},
		async setJoinCodeEnabled(input) {
			const payload = await authed(
				`/api/households/${input.householdId}/join-code`,
				{
					method: "PATCH",
					body: JSON.stringify({ enabled: input.enabled }),
				},
			);
			return joinCodeResponseSchema.parse(payload).joinCode;
		},
		async switchHousehold(householdId) {
			await authed("/api/users/me/active-household", {
				method: "PATCH",
				body: JSON.stringify({ householdId }),
			});
		},
		async previewInvitation(token) {
			const payload = await publicRequest(
				`/api/invitations/preview?token=${encodeURIComponent(token)}`,
				{ allowStatuses: [404] },
			);
			return invitationPreviewSchema.parse(payload);
		},
		async acceptInvitation(token) {
			await authed("/api/invitations/accept", {
				method: "POST",
				body: JSON.stringify({ token }),
			});
		},
		async previewJoinCode(code) {
			const payload = await authed(
				`/api/households/join-code/preview?code=${encodeURIComponent(code)}`,
				{ allowStatuses: [404] },
			);
			return joinCodePreviewSchema.parse(payload);
		},
		async joinByCode(code, source = MANUAL_HOUSEHOLD_JOIN_CODE_SOURCE) {
			await authed("/api/households/join-code/join", {
				method: "POST",
				body: JSON.stringify({ code, source }),
			});
		},
	};
}

async function requestJson(
	path: string,
	options: RequestInit & {
		getToken?: ApiGetToken;
		fetcher: typeof globalThis.fetch;
		apiBaseUrl: () => string;
		allowStatuses?: number[];
	},
): Promise<unknown> {
	const { getToken, fetcher, apiBaseUrl, allowStatuses, ...requestInit } =
		options;
	const headers = new Headers(requestInit.headers);
	headers.set("Accept", "application/json");
	if (requestInit.body) headers.set("Content-Type", "application/json");
	if (getToken) {
		const token = await getToken();
		if (!token) throw new Error("Sign in to continue.");
		headers.set("Authorization", `Bearer ${token}`);
	}

	const response = await fetcher(`${apiBaseUrl()}${path}`, {
		...requestInit,
		headers,
	});
	const payload: unknown = await response.json().catch(() => null);
	if (!response.ok && !allowStatuses?.includes(response.status)) {
		const message = errorMessageFromPayload(payload);
		throw new Error(message);
	}
	return payload;
}

function errorMessageFromPayload(payload: unknown): string {
	if (
		typeof payload === "object" &&
		payload !== null &&
		"error" in payload &&
		typeof (payload as { error: unknown }).error === "string"
	) {
		return (payload as { error: string }).error;
	}
	return "Something went wrong.";
}
