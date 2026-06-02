import Constants from "expo-constants";
import { z } from "zod";

export type ApiGetToken = () => Promise<string | null>;

const memberRoleSchema = z.enum(["owner", "member"]);

export const householdMemberSchema = z.object({
	membershipId: z.string(),
	userId: z.string(),
	role: memberRoleSchema,
	displayName: z.string().nullable(),
});

export const pendingInvitationSchema = z.object({
	id: z.string(),
	householdId: z.string(),
	email: z.string().nullable(),
	createdByUserId: z.string(),
	creatorDisplayName: z.string().nullable(),
	createdAt: z.number(),
	expiresAt: z.number(),
	acceptUrl: z.string(),
});

export const invitationRecordSchema = z.object({
	id: z.string(),
	householdId: z.string(),
	email: z.string().nullable(),
	createdByUserId: z.string(),
	createdAt: z.number(),
	expiresAt: z.number(),
	acceptedAt: z.number().nullable(),
	acceptedByUserId: z.string().nullable(),
	revokedAt: z.number().nullable(),
	acceptUrl: z.string(),
});

const emailDeliverySchema = z.discriminatedUnion("status", [
	z.object({ status: z.literal("not_requested") }),
	z.object({ status: z.literal("sent") }),
	z.object({ status: z.literal("skipped"), reason: z.literal("environment") }),
	z.object({ status: z.literal("failed"), message: z.string() }),
]);

const joinCodeSchema = z.discriminatedUnion("enabled", [
	z.object({
		enabled: z.literal(true),
		id: z.string(),
		householdId: z.string(),
		code: z.string(),
		joinUrl: z.string(),
		createdAt: z.number(),
	}),
	z.object({
		enabled: z.literal(false),
		householdId: z.string(),
	}),
]);

const invitationPreviewSchema = z.discriminatedUnion("available", [
	z.object({
		available: z.literal(true),
		householdName: z.string(),
		inviterDisplayName: z.string(),
	}),
	z.object({ available: z.literal(false) }),
]);

const joinCodePreviewSchema = z.discriminatedUnion("available", [
	z.object({ available: z.literal(true), householdName: z.string() }),
	z.object({ available: z.literal(false) }),
]);

const createInvitationResponseSchema = z.object({
	invitation: invitationRecordSchema,
	emailDelivery: emailDeliverySchema,
	reusedExisting: z.boolean(),
});

export type HouseholdMember = z.infer<typeof householdMemberSchema>;
export type PendingInvitation = z.infer<typeof pendingInvitationSchema>;
export type InvitationRecord = z.infer<typeof invitationRecordSchema>;
export type CreateInvitationResponse = z.infer<
	typeof createInvitationResponseSchema
>;
export type HouseholdJoinCode = z.infer<typeof joinCodeSchema>;
export type InvitationPreview = z.infer<typeof invitationPreviewSchema>;
export type HouseholdJoinCodePreview = z.infer<typeof joinCodePreviewSchema>;
export type HouseholdJoinCodeSource = "manual_code" | "join_link";

export type HouseholdApiClient = {
	listMembers(householdId: string): Promise<HouseholdMember[]>;
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
		async listMembers(householdId) {
			const payload = await authed(`/api/households/${householdId}/members`);
			return z
				.object({ members: z.array(householdMemberSchema) })
				.parse(payload).members;
		},
		async listInvitations(householdId) {
			const payload = await authed(
				`/api/households/${householdId}/invitations`,
			);
			return z
				.object({ invitations: z.array(pendingInvitationSchema) })
				.parse(payload).invitations;
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
			return z.object({ invitation: invitationRecordSchema }).parse(payload)
				.invitation;
		},
		async getJoinCode(householdId) {
			const payload = await authed(`/api/households/${householdId}/join-code`);
			return z.object({ joinCode: joinCodeSchema }).parse(payload).joinCode;
		},
		async regenerateJoinCode(householdId) {
			const payload = await authed(
				`/api/households/${householdId}/join-code/regenerate`,
				{ method: "POST" },
			);
			return z.object({ joinCode: joinCodeSchema }).parse(payload).joinCode;
		},
		async setJoinCodeEnabled(input) {
			const payload = await authed(
				`/api/households/${input.householdId}/join-code`,
				{
					method: "PATCH",
					body: JSON.stringify({ enabled: input.enabled }),
				},
			);
			return z.object({ joinCode: joinCodeSchema }).parse(payload).joinCode;
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
			const payload = await publicRequest(
				`/api/households/join-code/preview?code=${encodeURIComponent(code)}`,
				{ allowStatuses: [404] },
			);
			return joinCodePreviewSchema.parse(payload);
		},
		async joinByCode(code, source = "manual_code") {
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
	const parsed = z.object({ error: z.string() }).safeParse(payload);
	return parsed.success ? parsed.data.error : "Something went wrong.";
}

function readApiBaseUrl(): string {
	const value = Constants.expoConfig?.extra?.apiBaseUrl;
	if (typeof value !== "string" || value.length === 0) {
		throw new Error("Missing EXPO_PUBLIC_API_BASE_URL");
	}

	return value.replace(/\/$/, "");
}
