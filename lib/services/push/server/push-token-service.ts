import { and, eq, inArray, isNull } from "drizzle-orm";

import { pushTokens } from "@/db/schema/directory";
import type { DirectoryDb } from "@/db/server/client";
import { createAppId } from "@/lib/ids";

type DirectoryTransaction = Parameters<
	Parameters<DirectoryDb["transaction"]>[0]
>[0];
type PushTokenServiceDirectory = DirectoryDb | DirectoryTransaction;

export type PushTokenRecord = {
	id: string;
	userId: string;
	expoPushToken: string;
	deviceName: string | null;
	platform: "ios";
	createdAt: number;
	updatedAt: number;
	disabledAt: number | null;
};

export type RegisterPushTokenInput = {
	userId: string;
	expoPushToken: string;
	deviceName?: string | null;
};

export type DisablePushTokenInput = {
	userId: string;
	expoPushToken: string;
};

export type DisablePushTokensInput = {
	expoPushTokens: string[];
};

export type PushTokenService = {
	registerToken(input: RegisterPushTokenInput): Promise<PushTokenRecord>;
	disableToken(input: DisablePushTokenInput): Promise<void>;
	disableTokens(input: DisablePushTokensInput): Promise<void>;
	disableTokensForUser(userId: string): Promise<void>;
	deleteTokensForUser(userId: string): Promise<void>;
	listActiveTokensForUsers(userIds: string[]): Promise<PushTokenRecord[]>;
};

export type PushTokenServiceDeps = {
	directory: PushTokenServiceDirectory;
};

export function createPushTokenService(
	deps: PushTokenServiceDeps,
): PushTokenService {
	const { directory } = deps;

	return {
		async registerToken(input) {
			const now = Date.now();
			const [row] = await directory
				.insert(pushTokens)
				.values({
					id: createAppId("pst"),
					userId: input.userId,
					expoPushToken: input.expoPushToken,
					deviceName: normalizeDeviceName(input.deviceName),
					platform: "ios",
					createdAt: now,
					updatedAt: now,
					disabledAt: null,
				})
				.onConflictDoUpdate({
					target: pushTokens.expoPushToken,
					set: {
						userId: input.userId,
						deviceName: normalizeDeviceName(input.deviceName),
						platform: "ios",
						updatedAt: now,
						disabledAt: null,
					},
				})
				.returning();
			return row;
		},

		async disableToken(input) {
			await directory
				.update(pushTokens)
				.set({ disabledAt: Date.now(), updatedAt: Date.now() })
				.where(
					and(
						eq(pushTokens.userId, input.userId),
						eq(pushTokens.expoPushToken, input.expoPushToken),
						isNull(pushTokens.disabledAt),
					),
				);
		},

		async disableTokens(input) {
			if (input.expoPushTokens.length === 0) return;
			const now = Date.now();
			await directory
				.update(pushTokens)
				.set({ disabledAt: now, updatedAt: now })
				.where(
					and(
						inArray(pushTokens.expoPushToken, input.expoPushTokens),
						isNull(pushTokens.disabledAt),
					),
				);
		},

		async disableTokensForUser(userId) {
			const now = Date.now();
			await directory
				.update(pushTokens)
				.set({ disabledAt: now, updatedAt: now })
				.where(
					and(eq(pushTokens.userId, userId), isNull(pushTokens.disabledAt)),
				);
		},

		async deleteTokensForUser(userId) {
			await directory.delete(pushTokens).where(eq(pushTokens.userId, userId));
		},

		async listActiveTokensForUsers(userIds) {
			if (userIds.length === 0) return [];
			return directory
				.select()
				.from(pushTokens)
				.where(
					and(
						inArray(pushTokens.userId, userIds),
						isNull(pushTokens.disabledAt),
					),
				);
		},
	};
}

function normalizeDeviceName(
	deviceName: string | null | undefined,
): string | null {
	if (!deviceName) return null;
	const trimmed = deviceName.trim();
	return trimmed.length > 0 ? trimmed : null;
}
