import type { User } from "@/db/schema/directory";
import {
	type DirectoryDb,
	directoryClient,
	directoryDb,
} from "@/db/server/client";
import { requireEnv } from "@/lib/env";
import type { ServerUserProfile } from "@/lib/server/auth";
import {
	createUserService,
	DeletedUserError,
} from "@/lib/services/user/server";

export const INVITATION_UNAVAILABLE_MESSAGE =
	"This Invitation is no longer available.";
export const HOUSEHOLD_CODE_UNAVAILABLE_MESSAGE =
	"This Household code is not available.";
export const HOUSEHOLD_CODE_THROTTLED_MESSAGE =
	"Too many attempts. Try again later.";

const UNAVAILABLE_STATUS = 404;
const THROTTLED_STATUS = 429;

type UnavailableResource = "invitation" | "householdJoinCode";

const UNAVAILABLE_MESSAGES: Record<UnavailableResource, string> = {
	invitation: INVITATION_UNAVAILABLE_MESSAGE,
	householdJoinCode: HOUSEHOLD_CODE_UNAVAILABLE_MESSAGE,
};

export class BadRequestError extends Error {
	constructor(message = "Invalid request") {
		super(message);
		this.name = "BadRequestError";
	}
}

export class ApiUnauthorizedError extends Error {
	constructor(message = "Unauthorized") {
		super(message);
		this.name = "ApiUnauthorizedError";
	}
}

export class ApiForbiddenError extends Error {
	constructor(message = "Forbidden") {
		super(message);
		this.name = "ApiForbiddenError";
	}
}

export type ApiAuth = (
	request: Request,
	directory: DirectoryDb,
) => Promise<User>;

export type ApiHandlerDeps = {
	directory?: DirectoryDb;
	authenticate?: ApiAuth;
};

export async function withDirectory<T>(
	deps: ApiHandlerDeps | undefined,
	handler: (directory: DirectoryDb) => Promise<T>,
): Promise<T> {
	if (deps?.directory) {
		return handler(deps.directory);
	}

	const client = directoryClient();
	try {
		return await handler(directoryDb(client));
	} finally {
		await client.close();
	}
}

export async function authenticateApiUser(
	request: Request,
	directory: DirectoryDb,
	deps?: ApiHandlerDeps,
): Promise<User> {
	if (deps?.authenticate) {
		return deps.authenticate(request, directory);
	}

	const { verifyClerkRequest } = await import("@/lib/server/auth");
	let profile: ServerUserProfile;
	try {
		profile = await verifyClerkRequest(request);
	} catch (error) {
		if (isServerUnauthorizedError(error)) {
			throw new ApiUnauthorizedError(error.message);
		}
		throw error;
	}
	return upsertAuthenticatedUser(profile, directory);
}

export async function upsertAuthenticatedUser(
	profile: ServerUserProfile,
	directory: DirectoryDb,
): Promise<User> {
	try {
		return await createUserService({ directory }).upsertUser(profile);
	} catch (error) {
		if (error instanceof DeletedUserError) {
			throw new ApiUnauthorizedError("User has been deleted.");
		}
		throw error;
	}
}

export async function readJsonObject(request: Request): Promise<JsonObject> {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw new BadRequestError("Malformed JSON");
	}

	if (!isJsonObject(body)) {
		throw new BadRequestError();
	}

	return body;
}

export function stringField(body: JsonObject, key: string): string {
	const value = body[key];
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new BadRequestError(`Invalid ${key}`);
	}
	return value;
}

export function optionalStringField(
	body: JsonObject,
	key: string,
): string | undefined {
	const value = body[key];
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "string") {
		throw new BadRequestError(`Invalid ${key}`);
	}
	return value;
}

export function booleanField(body: JsonObject, key: string): boolean {
	const value = body[key];
	if (typeof value !== "boolean") {
		throw new BadRequestError(`Invalid ${key}`);
	}
	return value;
}

export function queryStringField(request: Request, key: string): string {
	const value = new URL(request.url).searchParams.get(key);
	if (!value || value.trim().length === 0) {
		throw new BadRequestError(`Invalid ${key}`);
	}
	return value;
}

export function jsonResponse(body: unknown, status = 200): Response {
	return Response.json(body, { status });
}

export function errorResponse(message: string, status: number): Response {
	return jsonResponse({ error: message }, status);
}

export function unavailablePreviewResponse(): Response {
	return jsonResponse({ available: false }, UNAVAILABLE_STATUS);
}

export function unavailableErrorResponse(
	resource: UnavailableResource,
): Response {
	return errorResponse(UNAVAILABLE_MESSAGES[resource], UNAVAILABLE_STATUS);
}

export function householdJoinCodeThrottledResponse(): Response {
	return errorResponse(HOUSEHOLD_CODE_THROTTLED_MESSAGE, THROTTLED_STATUS);
}

export function isApiUnauthorizedError(
	error: unknown,
): error is ApiUnauthorizedError {
	return error instanceof ApiUnauthorizedError;
}

export function isApiForbiddenError(
	error: unknown,
): error is ApiForbiddenError {
	return error instanceof ApiForbiddenError;
}

export function publicAppLinkBuilders(): {
	buildInvitationAcceptUrl(input: { token: string }): string;
	buildHouseholdJoinUrl(input: { code: string }): string;
} {
	const baseUrl = requireEnv("PUBLIC_APP_BASE_URL").replace(/\/+$/, "");
	return {
		buildInvitationAcceptUrl: ({ token }) =>
			`${baseUrl}/invitations/accept?token=${encodeURIComponent(token)}`,
		buildHouseholdJoinUrl: ({ code }) =>
			`${baseUrl}/households/join?code=${encodeURIComponent(code)}`,
	};
}

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isServerUnauthorizedError(error: unknown): error is Error {
	return error instanceof Error && error.name === "UnauthorizedError";
}
