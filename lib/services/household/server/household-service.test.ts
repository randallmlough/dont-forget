import { eq } from "drizzle-orm";

import { householdJoinCodes, households, users } from "@/db/schema/directory";
import { createTestDirectoryDb } from "@/db/test";
import {
	createHouseholdService,
	householdDatabaseName,
} from "./household-service";

describe("createHouseholdService", () => {
	it("creates a Household with a Turso-safe database name and marks provisioning complete", async () => {
		const directory = await createTestDirectoryDb();
		const service = createHouseholdService({
			directory: directory.db,
			generateJoinCode: () => "ABCDEFGH",
		});
		const dateNow = jest.spyOn(Date, "now");

		try {
			await directory.db.insert(users).values({
				id: "usr_avery",
				clerkUserId: "clerk_avery",
				displayName: "Avery Chen",
			});
			const [user] = await directory.db.select().from(users);
			if (!user) throw new Error("Expected test User");

			dateNow.mockReturnValueOnce(1_700_000_000_000);
			const household = await service.createOwnedHousehold({
				appEnv: "test",
				user,
				name: "Avery",
			});

			dateNow.mockReturnValueOnce(1_700_000_001_000);
			await service.markProvisioningCompleted(household.id);

			const [stored] = await directory.db
				.select()
				.from(households)
				.where(eq(households.id, household.id));
			const [joinCode] = await directory.db
				.select()
				.from(householdJoinCodes)
				.where(eq(householdJoinCodes.householdId, household.id));
			expect(stored).toMatchObject({
				id: expect.stringMatching(/^hh_/),
				name: "Avery",
				tursoDbName: householdDatabaseName("test", household.id),
				createdByUserId: "usr_avery",
				createdAt: 1_700_000_000_000,
				provisioningCompletedAt: 1_700_000_001_000,
			});
			expect(joinCode).toMatchObject({
				id: expect.stringMatching(/^hjc_/),
				householdId: household.id,
				code: "ABCDEFGH",
				createdByUserId: "usr_avery",
				createdAt: 1_700_000_000_000,
				disabledAt: null,
				replacedAt: null,
			});
		} finally {
			dateNow.mockRestore();
			await directory.close();
		}
	});
});
