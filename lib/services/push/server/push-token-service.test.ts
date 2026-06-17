import { eq } from "drizzle-orm";

import { pushTokens, users } from "@/db/schema/directory";
import { createTestDirectoryDb } from "@/db/server/test";
import { createPushTokenService } from "./push-token-service";

describe("createPushTokenService", () => {
	it("registers and re-enables a token for the authenticated User", async () => {
		const directory = await createTestDirectoryDb();
		const now = jest.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
		const service = createPushTokenService({ directory: directory.db });

		try {
			await directory.db.insert(users).values([
				{ id: "usr_avery", clerkUserId: "clerk_avery" },
				{ id: "usr_blake", clerkUserId: "clerk_blake" },
			]);

			const registered = await service.registerToken({
				userId: "usr_avery",
				expoPushToken: "ExponentPushToken[one]",
				deviceName: " Avery's iPhone ",
			});
			expect(registered).toMatchObject({
				userId: "usr_avery",
				expoPushToken: "ExponentPushToken[one]",
				deviceName: "Avery's iPhone",
				platform: "ios",
				disabledAt: null,
			});
			expect(registered.id).toMatch(/^pst_/);

			now.mockReturnValue(1_700_000_010_000);
			await service.disableToken({
				userId: "usr_avery",
				expoPushToken: "ExponentPushToken[one]",
			});

			now.mockReturnValue(1_700_000_020_000);
			const moved = await service.registerToken({
				userId: "usr_blake",
				expoPushToken: "ExponentPushToken[one]",
				deviceName: null,
			});

			expect(moved).toMatchObject({
				id: registered.id,
				userId: "usr_blake",
				expoPushToken: "ExponentPushToken[one]",
				deviceName: null,
				createdAt: 1_700_000_000_000,
				updatedAt: 1_700_000_020_000,
				disabledAt: null,
			});
		} finally {
			now.mockRestore();
			await directory.close();
		}
	});

	it("lists active tokens and disables dead tokens", async () => {
		const directory = await createTestDirectoryDb();
		const service = createPushTokenService({ directory: directory.db });

		try {
			await directory.db.insert(users).values([
				{ id: "usr_avery", clerkUserId: "clerk_avery" },
				{ id: "usr_blake", clerkUserId: "clerk_blake" },
			]);
			await service.registerToken({
				userId: "usr_avery",
				expoPushToken: "ExponentPushToken[one]",
			});
			await service.registerToken({
				userId: "usr_blake",
				expoPushToken: "ExponentPushToken[two]",
			});
			await service.disableTokens({
				expoPushTokens: ["ExponentPushToken[two]"],
			});

			await expect(
				service.listActiveTokensForUsers(["usr_avery", "usr_blake"]),
			).resolves.toMatchObject([
				{ userId: "usr_avery", expoPushToken: "ExponentPushToken[one]" },
			]);
			const [disabled] = await directory.db
				.select()
				.from(pushTokens)
				.where(eq(pushTokens.expoPushToken, "ExponentPushToken[two]"));
			expect(disabled.disabledAt).toEqual(expect.any(Number));
		} finally {
			await directory.close();
		}
	});
});
