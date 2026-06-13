import { eq } from "drizzle-orm";
import { users } from "@/db/schema/directory";
import { createTestDirectoryDb } from "@/db/server/test";
import type { ServerUserRecord } from "@/lib/server/auth";
import { createUserService } from "./user-service";

describe("createUserService", () => {
	it("anonymizes a deleted app User without removing the row", async () => {
		const directory = await createTestDirectoryDb();
		const service = createUserService({ directory: directory.db });
		const dateNow = jest.spyOn(Date, "now");

		try {
			await directory.db.insert(users).values({
				id: "usr_avery",
				clerkUserId: "clerk_avery",
				email: "avery@example.com",
				firstName: "Avery",
				lastName: "Chen",
				displayName: "Avery Chen",
				activeHouseholdId: null,
				createdAt: 1,
				updatedAt: 1,
			});
			dateNow.mockReturnValueOnce(1_700_000_002_000);

			await service.anonymizeUser("usr_avery");

			const [user] = await directory.db.select().from(users);
			expect(user).toMatchObject({
				id: "usr_avery",
				clerkUserId: "deleted_usr_avery",
				email: null,
				firstName: null,
				lastName: null,
				displayName: null,
				activeHouseholdId: null,
				createdAt: 1,
				updatedAt: 1_700_000_002_000,
				deletedAt: 1_700_000_002_000,
			});
		} finally {
			dateNow.mockRestore();
			await directory.close();
		}
	});

	it("creates and updates an app User from a Clerk User record", async () => {
		const directory = await createTestDirectoryDb();
		const service = createUserService({ directory: directory.db });
		const dateNow = jest.spyOn(Date, "now");

		try {
			dateNow.mockReturnValueOnce(1_700_000_000_000);
			const created = await service.upsertUser(averyUserRecord);

			dateNow.mockReturnValueOnce(1_700_000_001_000);
			const updated = await service.upsertUser({
				...averyUserRecord,
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

	it("updates the Clerk User name and stores the returned app User", async () => {
		const directory = await createTestDirectoryDb();
		const updateClerkUserName = jest.fn(async () => ({
			clerkUserId: "clerk_avery",
			email: "avery@example.com",
			firstName: "Avery",
			lastName: "Lough",
			displayName: "Avery Lough",
		}));
		const service = createUserService({
			directory: directory.db,
			updateClerkUserName,
		});

		try {
			const user = await service.updateUserName({
				clerkUserId: "clerk_avery",
				firstName: "Avery",
				lastName: "Lough",
			});

			expect(updateClerkUserName).toHaveBeenCalledWith({
				clerkUserId: "clerk_avery",
				firstName: "Avery",
				lastName: "Lough",
			});
			expect(user).toMatchObject({
				clerkUserId: "clerk_avery",
				email: "avery@example.com",
				firstName: "Avery",
				lastName: "Lough",
				displayName: "Avery Lough",
			});
			expect(await directory.db.select().from(users)).toHaveLength(1);
		} finally {
			await directory.close();
		}
	});
});

const averyUserRecord: ServerUserRecord = {
	clerkUserId: "clerk_avery",
	email: "avery@example.com",
	firstName: "Avery",
	lastName: "Chen",
	displayName: "Avery Chen",
};
