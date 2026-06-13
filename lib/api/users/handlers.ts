import type { DirectoryDb } from "@/db/server/client";
import { type AppEnv, readTursoOperatorConfig } from "@/lib/env";
import { asError } from "@/lib/errors";
import { redactAttributes } from "@/lib/redact";
import {
	createPushTokenService,
	type PushMessage,
	type PushTokenService,
	sendPushNotifications,
} from "@/lib/services/push/server";
import {
	type ApiHandlerDeps,
	authenticateApiUser,
	BadRequestError,
	errorResponse,
	isApiUnauthorizedError,
	jsonResponse,
	optionalStringField,
	readJsonObject,
	stringField,
	withDirectory,
} from "../shared";

const EXPO_PUSH_TOKEN_PREFIX = "ExponentPushToken[";

export type UsersApiDeps = ApiHandlerDeps & {
	appEnv?: AppEnv;
	createPushTokenService?: (directory: DirectoryDb) => PushTokenService;
	sendPushNotifications?: (
		messages: PushMessage[],
	) => Promise<{ deadTokens: string[] }>;
};

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

function pushTokenService(
	directory: DirectoryDb,
	deps: UsersApiDeps | undefined,
): PushTokenService {
	return (
		deps?.createPushTokenService?.(directory) ??
		createPushTokenService({ directory })
	);
}

function expoPushTokenField(body: Record<string, unknown>): string {
	const token = stringField(body, "expoPushToken");
	if (!token.startsWith(EXPO_PUSH_TOKEN_PREFIX) || !token.endsWith("]")) {
		throw new BadRequestError("Invalid expoPushToken");
	}
	return token;
}

function usersErrorResponse(error: unknown, logMessage: string): Response {
	if (isApiUnauthorizedError(error)) return errorResponse("Unauthorized", 401);
	if (error instanceof BadRequestError)
		return errorResponse(error.message, 400);
	console.error(logMessage, redactAttributes({ error: asError(error) }));
	return errorResponse("Something went wrong.", 500);
}
