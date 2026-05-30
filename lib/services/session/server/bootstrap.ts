import type { DirectoryDb } from "@/db/client";
import {
	type BootstrapResponse,
	HOUSEHOLD_TOKEN_TTL_MS,
} from "@/lib/bootstrap";
import { type AppEnv, readTursoOperatorConfig } from "@/lib/env";
import type { ServerUserProfile } from "@/lib/server/auth";
import {
	createProductionHouseholdProvisioningService,
	type HouseholdProvisioningService,
} from "@/lib/services/household/server/household-provisioning-service";
import {
	createHouseholdService,
	householdDatabaseName,
} from "@/lib/services/household/server/household-service";
import { generateInitialHouseholdName } from "@/lib/services/household/server/initial-household-name";
import { createMemberService } from "@/lib/services/member/server";
import { createUserService } from "@/lib/services/user/server";

export type AuthenticatedAppSessionBootstrapDeps = {
	appEnv: AppEnv;
	directory: DirectoryDb;
	provisioning: HouseholdProvisioningService;
};

export type ProductionAuthenticatedAppSessionBootstrapDeps =
	AuthenticatedAppSessionBootstrapDeps;

export function createProductionAuthenticatedAppSessionBootstrapDeps(
	directory: DirectoryDb,
): ProductionAuthenticatedAppSessionBootstrapDeps {
	const config = readTursoOperatorConfig();

	return {
		appEnv: config.appEnv,
		directory,
		provisioning: createProductionHouseholdProvisioningService(),
	};
}

export async function bootstrapAuthenticatedAppSession(
	profile: ServerUserProfile,
	deps: AuthenticatedAppSessionBootstrapDeps,
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
			name: generateInitialHouseholdName(),
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
	const [authToken, members] = await Promise.all([
		deps.provisioning.createHouseholdDatabaseToken(active.householdTursoDbName),
		memberService.listHouseholdMembers(active.householdId),
	]);

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
