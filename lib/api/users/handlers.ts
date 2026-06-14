import { and, eq, isNull } from "drizzle-orm";

import { type User, users } from "@/db/schema/directory";
import type { DirectoryDb } from "@/db/server/client";
import { type AppEnv, readTursoOperatorConfig } from "@/lib/env";
import { asError } from "@/lib/errors";
import { redactAttributes } from "@/lib/redact";
import type { ServerUserProfile } from "@/lib/server/auth";
import {
	createPushTokenService,
	type PushMessage,
	type PushTokenService,
	sendPushNotifications,
} from "@/lib/services/push/server";
import {
	createUserDeletionService,
	createUserService,
	type UserDeletionService,
} from "@/lib/services/user/server";
import {
	type ApiHandlerDeps,
	ApiUnauthorizedError,
	authenticateApiUser,
	BadRequestError,
	errorResponse,
	isApiUnauthorizedError,
	jsonResponse,
	optionalStringField,
	readJsonObject,
	stringField,
	upsertAuthenticatedUser,
	withDirectory,
} from "../shared";

const EXPO_PUSH_TOKEN_PREFIX = "ExponentPushToken[";
const MAX_NAME_LENGTH = 50;

export type UserProfile = {
	id: string;
	email: string | null;
	displayName: string | null;
	firstName: string | null;
	lastName: string | null;
};

export type UpdateClerkUserName = (input: {
	clerkUserId: string;
	firstName: string | null;
	lastName: string | null;
}) => Promise<ServerUserProfile>;

export type VerifyClerkRequestUserId = (request: Request) => Promise<string>;

export type UsersApiDeps = ApiHandlerDeps & {
	appEnv?: AppEnv;
	createUserDeletionService?: (directory: DirectoryDb) => UserDeletionService;
	createPushTokenService?: (directory: DirectoryDb) => PushTokenService;
	sendPushNotifications?: (
		messages: PushMessage[],
	) => Promise<{ deadTokens: string[] }>;
	updateClerkUserName?: UpdateClerkUserName;
	verifyClerkRequestUserId?: VerifyClerkRequestUserId;
};

export type UserApiDeps = UsersApiDeps;

export async function handleUpdateProfile(
	request: Request,
	deps?: UsersApiDeps,
): Promise<Response> {
	try {
		return await withDirectory(deps, async (directory) => {
			const user = await authenticateApiUser(request, directory, deps);
			const body = await readJsonObject(request);
			const input = updateProfileInput(body);
			const updateName =
				deps?.updateClerkUserName ?? (await defaultUpdateName());
			const profile = await updateName({
				clerkUserId: user.clerkUserId,
				firstName: input.firstName,
				lastName: input.lastName,
			});
			const updatedUser = await upsertAuthenticatedUser(profile, directory);

			return jsonResponse({ user: userProfileResponse(updatedUser, profile) });
		});
	} catch (error) {
		return usersErrorResponse(error, "Update User profile API failed");
	}
}

export async function handleDeleteAccount(
	request: Request,
	deps?: UsersApiDeps,
): Promise<Response> {
	try {
		return await withDirectory(deps, async (directory) => {
			const { user, clerkUserId } = await authenticateDeleteUser(
				request,
				directory,
				deps,
			);
			const summary = await userDeletionService(directory, deps).deleteUser({
				user,
				clerkUserId,
			});
			return jsonResponse({
				deleted: true,
				deletedHouseholdCount: summary.deletedHouseholdIds.length,
			});
		});
	} catch (error) {
		return usersErrorResponse(error, "Delete account API failed");
	}
}

export async function handleRegisterPushToken(
	request: Request,
	deps?: UsersApiDeps,
): Promise<Response> {
	try {
		return await withDirectory(deps, async (directory) => {
			const user = await authenticateApiUser(request, directory, deps);
			const body = await readJsonObject(request);
			const expoPushToken = expoPushTokenField(body);
			await pushTokenService(directory, deps).registerToken({
				userId: user.id,
				expoPushToken,
				deviceName: optionalStringField(body, "deviceName"),
			});
			return jsonResponse({ registered: true });
		});
	} catch (error) {
		return usersErrorResponse(error, "Register push token API failed");
	}
}

export async function handleCompleteOnboarding(
	request: Request,
	deps?: UsersApiDeps,
): Promise<Response> {
	try {
		return await withDirectory(deps, async (directory) => {
			const user = await authenticateApiUser(request, directory, deps);
			const completedAt = Date.now();
			await directory
				.update(users)
				.set({
					onboardingCompletedAt: completedAt,
					updatedAt: completedAt,
				})
				.where(and(eq(users.id, user.id), isNull(users.onboardingCompletedAt)));
			return jsonResponse({ completed: true });
		});
	} catch (error) {
		return usersErrorResponse(error, "Complete onboarding API failed");
	}
}

export async function handleUnregisterPushToken(
	request: Request,
	deps?: UsersApiDeps,
): Promise<Response> {
	try {
		return await withDirectory(deps, async (directory) => {
			const user = await authenticateApiUser(request, directory, deps);
			const body = await readJsonObject(request);
			await pushTokenService(directory, deps).disableToken({
				userId: user.id,
				expoPushToken: expoPushTokenField(body),
			});
			return jsonResponse({ unregistered: true });
		});
	} catch (error) {
		return usersErrorResponse(error, "Unregister push token API failed");
	}
}

export async function handleSendTestNotification(
	request: Request,
	deps?: UsersApiDeps,
): Promise<Response> {
	const appEnv = deps?.appEnv ?? readTursoOperatorConfig().appEnv;
	if (appEnv === "production") {
		return errorResponse("Not found", 404);
	}

	try {
		return await withDirectory(deps, async (directory) => {
			const user = await authenticateApiUser(request, directory, deps);
			const service = pushTokenService(directory, deps);
			const tokens = await service.listActiveTokensForUsers([user.id]);
			const messages = tokens.map((token) => ({
				to: token.expoPushToken,
				title: "Don't Forget",
				body: "Test notification from Don't Forget",
			}));
			const result = await (
				deps?.sendPushNotifications ?? sendPushNotifications
			)(messages);
			await service.disableTokens({ expoPushTokens: result.deadTokens });
			return jsonResponse({
				sent: messages.length,
				disabled: result.deadTokens.length,
			});
		});
	} catch (error) {
		return usersErrorResponse(error, "Send test notification API failed");
	}
}

async function defaultUpdateName(): Promise<UpdateClerkUserName> {
	const { updateClerkUserName } = await import("@/lib/server/auth");
	return updateClerkUserName;
}

async function authenticateDeleteUser(
	request: Request,
	directory: DirectoryDb,
	deps: UsersApiDeps | undefined,
): Promise<{ user: User; clerkUserId: string }> {
	const verifyUserId =
		deps?.verifyClerkRequestUserId ?? (await defaultVerifyClerkRequestUserId());
	let clerkUserId: string;
	try {
		clerkUserId = await verifyUserId(request);
	} catch (error) {
		if (isServerUnauthorizedError(error)) {
			throw new ApiUnauthorizedError(error.message);
		}
		throw error;
	}

	const user = await createUserService({
		directory,
	}).findUserForDeletionByClerkUserId(clerkUserId);
	if (!user) {
		throw new ApiUnauthorizedError("Unauthorized");
	}

	return { user, clerkUserId };
}

async function defaultVerifyClerkRequestUserId(): Promise<VerifyClerkRequestUserId> {
	const { verifyClerkRequestUserId } = await import("@/lib/server/auth");
	return verifyClerkRequestUserId;
}

function updateProfileInput(body: Record<string, unknown>): {
	firstName: string | null;
	lastName: string | null;
} {
	const firstName = nullableNameField(body, "firstName");
	const lastName = nullableNameField(body, "lastName");
	if (!firstName && !lastName) {
		throw new BadRequestError("Provide a first or last name");
	}
	return { firstName, lastName };
}

function nullableNameField(
	body: Record<string, unknown>,
	key: "firstName" | "lastName",
): string | null {
	const value = body[key];
	if (value === undefined || value === null) return null;
	if (typeof value !== "string") {
		throw new BadRequestError(`Invalid ${key}`);
	}
	const trimmed = value.trim();
	if (trimmed.length === 0) return null;
	if (trimmed.length > MAX_NAME_LENGTH) {
		throw new BadRequestError(
			`${nameLabel(key)} must be 50 characters or fewer.`,
		);
	}
	return trimmed;
}

function nameLabel(key: "firstName" | "lastName"): string {
	return key === "firstName" ? "First name" : "Last name";
}

function userProfileResponse(
	user: User,
	profile: ServerUserProfile,
): UserProfile {
	return {
		id: user.id,
		email: user.email,
		displayName: user.displayName,
		firstName: profile.firstName,
		lastName: profile.lastName,
	};
}

function pushTokenService(
	directory: DirectoryDb,
	deps: UsersApiDeps | undefined,
): PushTokenService {
	return (
		deps?.createPushTokenService?.(directory) ??
		createPushTokenService({ directory })
	);
}

function userDeletionService(
	directory: DirectoryDb,
	deps: UsersApiDeps | undefined,
): UserDeletionService {
	if (deps?.createUserDeletionService) {
		return deps.createUserDeletionService(directory);
	}
	return createUserDeletionService({
		directory,
		deleteClerkUser: async (clerkUserId) => {
			const { deleteClerkUser } = await import("@/lib/server/auth");
			await deleteClerkUser(clerkUserId);
		},
	});
}

function expoPushTokenField(body: Record<string, unknown>): string {
	const token = stringField(body, "expoPushToken");
	if (!token.startsWith(EXPO_PUSH_TOKEN_PREFIX) || !token.endsWith("]")) {
		throw new BadRequestError("Invalid expoPushToken");
	}
	return token;
}

function usersErrorResponse(error: unknown, logMessage: string): Response {
	if (isApiUnauthorizedError(error)) return errorResponse(error.message, 401);
	if (error instanceof BadRequestError)
		return errorResponse(error.message, 400);
	console.error(logMessage, redactAttributes({ error: asError(error) }));
	return errorResponse("Something went wrong.", 500);
}

function isServerUnauthorizedError(error: unknown): error is Error {
	return error instanceof Error && error.name === "UnauthorizedError";
}
