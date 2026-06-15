import { eq } from "drizzle-orm";
import { users } from "@/db/schema/directory";
import { createTestDirectoryDb } from "@/db/server/test";
import type { ServerUserProfile } from "@/lib/server/auth";
import { createUserService } from "./user-service";

describe("createUserService", () => {
	it("creates and updates an app User from a Clerk profile", async () => {
		const directory = await createTestDirectoryDb();
		const service = createUserService({ directory: directory.db });
		const dateNow = jest.spyOn(Date, "now");

		try {
			dateNow.mockReturnValueOnce(1_700_000_000_000);
			const created = await service.upsertUser(averyProfile);

			dateNow.mockReturnValueOnce(1_700_000_001_000);
			const updated = await service.upsertUser({
				...averyProfile,
				displayName: "Avery Lough",
				lastName: "Lough",
			});

			expect(updated.id).toBe(created.id);
			expect(updated).toMatchObject({
				clerkUserId: "clerk_avery",
				email: "avery@example.com",
				displayName: "Avery Lough",
				lastName: "Lough",
				createdAt: 1_700_000_000_000,
				updatedAt: 1_700_000_001_000,
			});
			expect(await directory.db.select().from(users)).toHaveLength(1);
		} finally {
			dateNow.mockRestore();
			await directory.close();
		}
	});

	it("sets onboarding completion for a User", async () => {
		const directory = await createTestDirectoryDb();
		const service = createUserService({ directory: directory.db });
		jest.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);

		try {
			await directory.db.insert(users).values({
				id: "usr_avery",
				clerkUserId: "clerk_avery",
			});

			await service.completeOnboarding("usr_avery");

			const [user] = await directory.db
				.select()
				.from(users)
				.where(eq(users.id, "usr_avery"));
			expect(user.onboardingCompletedAt).toBe(1_700_000_000_000);
			expect(user.updatedAt).toBe(1_700_000_000_000);
		} finally {
			jest.restoreAllMocks();
			await directory.close();
		}
	});

	it("does not overwrite existing onboarding completion", async () => {
		const directory = await createTestDirectoryDb();
		const service = createUserService({ directory: directory.db });
		jest.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);

		try {
			await directory.db.insert(users).values({
				id: "usr_avery",
				clerkUserId: "clerk_avery",
				onboardingCompletedAt: 1_700_000_000_000,
				updatedAt: 1_700_000_000_000,
			});

			await service.completeOnboarding("usr_avery");

			const [user] = await directory.db
				.select()
				.from(users)
				.where(eq(users.id, "usr_avery"));
			expect(user.onboardingCompletedAt).toBe(1_700_000_000_000);
			expect(user.updatedAt).toBe(1_700_000_000_000);
		} finally {
			jest.restoreAllMocks();
			await directory.close();
		}
	});
});

const averyProfile: ServerUserProfile = {
	clerkUserId: "clerk_avery",
	email: "avery@example.com",
	firstName: "Avery",
	lastName: "Chen",
	displayName: "Avery Chen",
};
