import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

import type { UsersApiClient } from "@/lib/client-api/users";

export type PushRegistrationResult =
	| { status: "registered"; expoPushToken: string }
	| { status: "denied" }
	| { status: "unavailable" };

type PushPermissionStatus =
	| "granted"
	| "denied"
	| "undetermined"
	| Notifications.PermissionStatus;

type PushNotificationsModule = {
	getPermissionsAsync(): Promise<{ status: PushPermissionStatus }>;
	requestPermissionsAsync(): Promise<{ status: PushPermissionStatus }>;
	getExpoPushTokenAsync(options: {
		projectId: string;
	}): Promise<{ data: string }>;
};

type PushConstants = {
	expoConfig?: {
		extra?: {
			eas?: {
				projectId?: unknown;
			};
		};
	} | null;
	easConfig?: {
		projectId?: string;
	} | null;
};

export type PushRegistrationDeps = {
	device?: Pick<typeof Device, "deviceName" | "isDevice" | "modelName">;
	notifications?: PushNotificationsModule;
	constants?: PushConstants;
	client: Pick<UsersApiClient, "registerPushToken">;
};

export type PushUnregistrationDeps = {
	client: Pick<UsersApiClient, "unregisterPushToken">;
	expoPushToken: string | null;
};

export async function registerForPushNotifications(
	deps: PushRegistrationDeps,
): Promise<PushRegistrationResult> {
	const device = deps.device ?? Device;
	if (!device.isDevice) return { status: "unavailable" };

	const notifications = deps.notifications ?? Notifications;
	const existing = await notifications.getPermissionsAsync();
	let finalStatus = existing.status;
	if (finalStatus !== "granted") {
		const requested = await notifications.requestPermissionsAsync();
		finalStatus = requested.status;
	}
	if (finalStatus !== "granted") return { status: "denied" };

	const projectId = readProjectId(deps.constants ?? Constants);
	const token = await notifications.getExpoPushTokenAsync({ projectId });
	await deps.client.registerPushToken({
		expoPushToken: token.data,
		deviceName: device.deviceName ?? device.modelName,
	});
	return { status: "registered", expoPushToken: token.data };
}

export async function unregisterPushNotifications(
	deps: PushUnregistrationDeps,
): Promise<void> {
	if (!deps.expoPushToken) return;
	await deps.client.unregisterPushToken({ expoPushToken: deps.expoPushToken });
}

function readProjectId(constants: PushConstants): string {
	const projectId =
		constants.expoConfig?.extra?.eas?.projectId ??
		constants.easConfig?.projectId;
	if (typeof projectId !== "string" || projectId.trim().length === 0) {
		throw new Error("Missing Expo EAS project ID for push notifications.");
	}
	return projectId;
}
