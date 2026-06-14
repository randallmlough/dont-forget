import { users } from "@/db/schema/directory";
import { createTestDirectoryDb } from "@/db/server/test";
import type { ServerUserRecord } from "@/lib/server/auth";
import { createUserService } from "./user-service";

describe("createUserService", () => {
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
