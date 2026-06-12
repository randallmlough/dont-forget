import { lists } from "@/db/schema/household";
import {
	householdClient,
	householdDb,
	householdDbUrl,
} from "@/db/server/client";
import { migrateHouseholdDb } from "@/db/server/household-migrations";
import { createTursoPlatformClient } from "@/db/server/turso-platform";
import { DEFAULT_LIST_ID, DEFAULT_LIST_NAME } from "@/lib/bootstrap";
import { readTursoOperatorConfig } from "@/lib/env";

export type HouseholdDatabaseProvisioningResult = {
	url: string;
	provisioned: boolean;
};

export type HouseholdProvisioningService = {
	ensureHouseholdDatabase(input: {
		tursoDbName: string;
		createdByUserId: string;
		provisioningCompletedAt: number | null;
	}): Promise<HouseholdDatabaseProvisioningResult>;
	createHouseholdDatabaseToken(tursoDbName: string): Promise<string>;
};

export type HouseholdProvisioningServiceDeps = {
	provisionHouseholdDatabase: (input: {
		tursoDbName: string;
		createdByUserId: string;
		now: number;
	}) => Promise<{ url: string }>;
	createHouseholdDatabaseToken: (tursoDbName: string) => Promise<string>;
	householdDatabaseUrl: (tursoDbName: string) => string;
};

export function createHouseholdProvisioningService(
	deps: HouseholdProvisioningServiceDeps,
): HouseholdProvisioningService {
	return {
		async ensureHouseholdDatabase(input) {
			if (input.provisioningCompletedAt !== null) {
				return {
					url: deps.householdDatabaseUrl(input.tursoDbName),
					provisioned: false,
				};
			}

			const database = await deps.provisionHouseholdDatabase({
				tursoDbName: input.tursoDbName,
				createdByUserId: input.createdByUserId,
				now: Date.now(),
			});
			return { url: database.url, provisioned: true };
		},
		createHouseholdDatabaseToken(tursoDbName) {
			return deps.createHouseholdDatabaseToken(tursoDbName);
		},
	};
}

export function createProductionHouseholdProvisioningService(): HouseholdProvisioningService {
	const config = readTursoOperatorConfig();
	const platform = createTursoPlatformClient(config);

	return createHouseholdProvisioningService({
		provisionHouseholdDatabase: async ({
			tursoDbName,
			createdByUserId,
			now,
		}) => {
			const database = await platform.ensureDatabase(tursoDbName);
			await migrateHouseholdDb(tursoDbName, config);
			await ensureDefaultListInRemoteHousehold(
				database.url,
				config.platformGroupToken,
				createdByUserId,
				now,
			);
			return database;
		},
		createHouseholdDatabaseToken: (tursoDbName) =>
			platform.createDatabaseAuthToken(tursoDbName, "24h"),
		householdDatabaseUrl: (tursoDbName) =>
			householdDbUrl(tursoDbName, config.org),
	});
}

async function ensureDefaultListInRemoteHousehold(
	url: string,
	authToken: string,
	createdByUserId: string,
	now: number,
): Promise<void> {
	const client = householdClient(url, authToken);

	try {
		await householdDb(client)
			.insert(lists)
			.values({
				id: DEFAULT_LIST_ID,
				name: DEFAULT_LIST_NAME,
				createdByUserId,
				createdAt: now,
				updatedAt: now,
			})
			.onConflictDoNothing({ target: lists.id });
	} finally {
		await client.close();
	}
}
