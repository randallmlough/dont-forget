import type { DirectoryDb } from "@/db/client";
import {
	type BootstrapResponse,
	HOUSEHOLD_TOKEN_TTL_MS,
} from "@/lib/bootstrap";
import { type AppEnv, readTursoOperatorConfig } from "@/lib/env";
import type { ServerUserProfile } from "@/lib/server/auth";
import { createMemberService } from "@/lib/services/member/server";
import { createUserService } from "@/lib/services/user/server";
import {
	createProductionHouseholdProvisioningService,
	type HouseholdProvisioningService,
} from "./household-provisioning-service";
import {
	createHouseholdService,
	householdDatabaseName,
} from "./household-service";

export type BootstrapServiceDeps = {
	appEnv: AppEnv;
	directory: DirectoryDb;
	provisioning: HouseholdProvisioningService;
};

export type ProductionBootstrapServiceDeps = BootstrapServiceDeps;

export function createProductionBootstrapDeps(
	directory: DirectoryDb,
): ProductionBootstrapServiceDeps {
	const config = readTursoOperatorConfig();

	return {
		appEnv: config.appEnv,
		directory,
		provisioning: createProductionHouseholdProvisioningService(),
	};
}

export async function bootstrapUser(
	profile: ServerUserProfile,
	deps: BootstrapServiceDeps,
): Promise<BootstrapResponse> {
	const userService = createUserService({ directory: deps.directory });
	const memberService = createMemberService({ directory: deps.directory });
	const householdService = createHouseholdService({
		directory: deps.directory,
	});

	const user = await userService.upsertUser(profile);
	const active = await deps.directory.transaction(async (tx) => {
		const txMemberService = createMemberService({ directory: tx });
		const txHouseholdService = createHouseholdService({ directory: tx });
		const existing = await txMemberService.findOldestActiveMembership(user.id);
		if (existing) return existing;

		const pending = await txHouseholdService.findPendingCreatedHousehold(
			user.id,
		);
		if (pending) {
			const membership = await txMemberService.ensureOwnerMembership({
				householdId: pending.id,
				user,
			});
			return txHouseholdService.activeMembershipFrom(pending, membership);
		}

		const household = await txHouseholdService.createOwnedHousehold({
			appEnv: deps.appEnv,
			user,
			name: profile.firstName ?? "Untitled",
		});
		const membership = await txMemberService.ensureOwnerMembership({
			householdId: household.id,
			user,
		});
		return txHouseholdService.activeMembershipFrom(household, membership);
	});

	const database = await deps.provisioning.ensureHouseholdDatabase({
		tursoDbName: active.householdTursoDbName,
		createdByUserId: user.id,
		provisioningCompletedAt: active.householdProvisioningCompletedAt,
	});
	if (database.provisioned) {
		await householdService.markProvisioningCompleted(active.householdId);
	}

	const expiresAt = Date.now() + HOUSEHOLD_TOKEN_TTL_MS;
	const authToken = await deps.provisioning.createHouseholdDatabaseToken(
		active.householdTursoDbName,
	);
	const members = await memberService.listActiveHouseholdMembers(
		active.householdId,
	);

	return {
		user: {
			id: user.id,
			email: user.email,
			displayName: user.displayName,
		},
		activeHousehold: {
			id: active.householdId,
			name: active.householdName,
		},
		activeMember: {
			id: active.membershipId,
			userId: user.id,
			role: active.membershipRole,
			displayName: user.displayName,
		},
		members,
		householdDatabase: {
			url: database.url,
			authToken,
			expiresAt,
		},
	};
}

export { householdDatabaseName };
