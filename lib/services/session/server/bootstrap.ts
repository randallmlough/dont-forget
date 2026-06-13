import { eq } from "drizzle-orm";
import { type User, users } from "@/db/schema/directory";
import type { DirectoryDb } from "@/db/server/client";
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
import {
	type ActiveMembership,
	createMemberService,
} from "@/lib/services/member/server";
import {
	createUserService,
	DeletedUserError,
} from "@/lib/services/user/server";

export class DeletedUserBootstrapError extends Error {
	constructor() {
		super("User has been deleted.");
		this.name = "DeletedUserBootstrapError";
	}
}

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

	let user: User;
	try {
		user = await userService.upsertUser(profile);
	} catch (error) {
		if (error instanceof DeletedUserError) {
			throw new DeletedUserBootstrapError();
		}
		throw error;
	}
	const active = await deps.directory.transaction(async (tx) => {
		const txMemberService = createMemberService({ directory: tx });
		const txHouseholdService = createHouseholdService({ directory: tx });
		const selected = await selectActiveMembership(user, txMemberService);
		if (selected) {
			if (user.activeHouseholdId !== selected.householdId) {
				await setActiveHousehold(tx, user.id, selected.householdId);
			}
			return selected;
		}

		const pending = await txHouseholdService.findPendingCreatedHousehold(
			user.id,
		);
		if (pending) {
			const membership = await txMemberService.ensureOwnerMembership({
				householdId: pending.id,
				user,
			});
			const activeMembership = txHouseholdService.activeMembershipFrom(
				pending,
				membership,
			);
			await setActiveHousehold(tx, user.id, activeMembership.householdId);
			return activeMembership;
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
		const activeMembership = txHouseholdService.activeMembershipFrom(
			household,
			membership,
		);
		await setActiveHousehold(tx, user.id, activeMembership.householdId);
		return activeMembership;
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
	const [authToken, members, associatedHouseholds] = await Promise.all([
		deps.provisioning.createHouseholdDatabaseToken(active.householdTursoDbName),
		memberService.listHouseholdMembers(active.householdId),
		memberService.listAssociatedHouseholds({
			userId: user.id,
			activeHouseholdId: active.householdId,
		}),
	]);

	return {
		user: {
			id: user.id,
			email: user.email,
			displayName: user.displayName,
			firstName: user.firstName,
			lastName: user.lastName,
			onboardingCompletedAt: user.onboardingCompletedAt,
		},
		activeHousehold: {
			id: active.householdId,
			name: active.householdName,
		},
		households: associatedHouseholds,
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

type BootstrapMemberService = ReturnType<typeof createMemberService>;
type BootstrapDirectoryTransaction = Parameters<
	Parameters<DirectoryDb["transaction"]>[0]
>[0];

async function selectActiveMembership(
	user: User,
	memberService: BootstrapMemberService,
): Promise<ActiveMembership | null> {
	if (user.activeHouseholdId) {
		const selected = await memberService.findActiveMembership({
			userId: user.id,
			householdId: user.activeHouseholdId,
		});
		if (selected) return selected;
	}

	return memberService.findOldestActiveMembership(user.id);
}

async function setActiveHousehold(
	tx: BootstrapDirectoryTransaction,
	userId: string,
	householdId: string,
): Promise<void> {
	await tx
		.update(users)
		.set({ activeHouseholdId: householdId, updatedAt: Date.now() })
		.where(eq(users.id, userId));
}

export { householdDatabaseName };
