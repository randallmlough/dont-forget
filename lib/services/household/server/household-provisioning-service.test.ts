import { createHouseholdProvisioningService } from "./household-provisioning-service";

describe("createHouseholdProvisioningService", () => {
	it("returns the existing Household database URL when provisioning is complete", async () => {
		const deps = createProvisioningDeps();
		const service = createHouseholdProvisioningService(deps);

		await expect(
			service.ensureHouseholdDatabase({
				tursoDbName: "db-existing",
				createdByUserId: "usr_avery",
				provisioningCompletedAt: 1,
			}),
		).resolves.toEqual({
			url: "libsql://db-existing",
			provisioned: false,
		});
		expect(deps.provisionHouseholdDatabase).not.toHaveBeenCalled();
	});

	it("provisions a pending Household database and mints auth tokens", async () => {
		const deps = createProvisioningDeps();
		const service = createHouseholdProvisioningService(deps);
		const dateNow = jest.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);

		try {
			await expect(
				service.ensureHouseholdDatabase({
					tursoDbName: "db-pending",
					createdByUserId: "usr_avery",
					provisioningCompletedAt: null,
				}),
			).resolves.toEqual({
				url: "libsql://db-pending-created",
				provisioned: true,
			});
			await expect(
				service.createHouseholdDatabaseToken("db-pending"),
			).resolves.toBe("token-db-pending");
			await expect(
				service.deleteHouseholdDatabase("db-pending"),
			).resolves.toBeUndefined();
			expect(deps.provisionHouseholdDatabase).toHaveBeenCalledWith({
				tursoDbName: "db-pending",
				createdByUserId: "usr_avery",
				now: 1_700_000_000_000,
			});
		} finally {
			dateNow.mockRestore();
		}
	});
});

function createProvisioningDeps() {
	return {
		provisionHouseholdDatabase: jest.fn(async ({ tursoDbName }) => ({
			url: `libsql://${tursoDbName}-created`,
		})),
		createHouseholdDatabaseToken: jest.fn(async (tursoDbName) => {
			return `token-${tursoDbName}`;
		}),
		deleteHouseholdDatabase: jest.fn(async () => undefined),
		householdDatabaseUrl: jest.fn((tursoDbName) => {
			return `libsql://${tursoDbName}`;
		}),
	};
}
