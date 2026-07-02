import { eq } from "drizzle-orm";
import type { DirectoryDb } from "@/server/db/client";
import { type User, users } from "@/server/db/schema/postgres";
import { createHouseholdService } from "@/server/households/household-service";
import { generateInitialHouseholdName } from "@/server/households/initial-household-name";
import {
	type ActiveMembership,
	createMemberService,
} from "@/server/households/member-service";
import type { ServerUserProfile } from "@/server/http";
import { createUserService } from "@/server/users/user-service";
import type { BootstrapResponse } from "@/shared/contracts/bootstrap";

export type AuthenticatedAppSessionBootstrapDeps = {
	directory: DirectoryDb;
};

export type ProductionAuthenticatedAppSessionBootstrapDeps =
	AuthenticatedAppSessionBootstrapDeps;

export function createProductionAuthenticatedAppSessionBootstrapDeps(
	directory: DirectoryDb,
): ProductionAuthenticatedAppSessionBootstrapDeps {
	return { directory };
}

export async function bootstrapAuthenticatedAppSession(
	profile: ServerUserProfile,
	deps: AuthenticatedAppSessionBootstrapDeps,
): Promise<BootstrapResponse> {
	const userService = createUserService({ directory: deps.directory });
	const memberService = createMemberService({ directory: deps.directory });

	const user = await userService.upsertUser(profile);
	// Directory identity only: pick (or first-run create) the active Household,
	// owner membership, and join code in one transaction. PowerSync owns the
	// product data now — no per-Household database to provision, no token to mint,
	// no starter List to seed.
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

		const household = await txHouseholdService.createOwnedHousehold({
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

	const [members, associatedHouseholds] = await Promise.all([
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
