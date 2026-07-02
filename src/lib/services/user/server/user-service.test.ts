import { users } from "@/server/db/schema/postgres";
import { createTestDirectoryDb } from "@/server/db/test";
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

	it("updates a User name through Clerk and persists the returned profile", async () => {
		const directory = await createTestDirectoryDb();
		const updateClerkUserName = jest.fn(async () => ({
			...averyProfile,
			lastName: "Lough",
			displayName: "Avery Lough",
		}));
		const service = createUserService({
			directory: directory.db,
			updateClerkUserName,
		});

		try {
			const updated = await service.updateUserName({
				clerkUserId: "clerk_avery",
				firstName: "Avery",
				lastName: "Lough",
			});

			expect(updateClerkUserName).toHaveBeenCalledWith({
				clerkUserId: "clerk_avery",
				firstName: "Avery",
				lastName: "Lough",
			});
			expect(updated).toMatchObject({
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

const averyProfile: ServerUserProfile = {
	clerkUserId: "clerk_avery",
	email: "avery@example.com",
	firstName: "Avery",
	lastName: "Chen",
	displayName: "Avery Chen",
};
