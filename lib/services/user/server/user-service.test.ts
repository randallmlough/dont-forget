import { users } from "@/db/schema/directory";
import { createTestDirectoryDb } from "@/db/server/test";
import type { ServerUserProfile } from "@/lib/server/auth";
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
});

const averyProfile: ServerUserProfile = {
	clerkUserId: "clerk_avery",
	email: "avery@example.com",
	firstName: "Avery",
	lastName: "Chen",
	displayName: "Avery Chen",
};
