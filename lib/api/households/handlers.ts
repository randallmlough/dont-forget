import type { DirectoryDb } from "@/db/server/client";
import { runWithSqliteBusyRetry } from "@/db/utils";
import { type AppEnv, readTursoOperatorConfig } from "@/lib/env";
import { asError } from "@/lib/errors";
import {
	type HouseholdJoinCodeSource,
	isHouseholdJoinCodeSource,
	MANUAL_HOUSEHOLD_JOIN_CODE_SOURCE,
} from "@/lib/household-join-code-source";
import { redactAttributes } from "@/lib/redact";
import {
	ActiveHouseholdMembershipRequiredError,
	type ActiveHouseholdService,
	createActiveHouseholdService,
	createHouseholdJoinCodeService,
	createHouseholdService,
	createProductionHouseholdProvisioningService,
	HouseholdForbiddenError,
	HouseholdJoinCodeMembershipRequiredError,
	type HouseholdJoinCodeService,
	type HouseholdJoinCodeServiceDeps,
	HouseholdJoinCodeThrottledError,
	HouseholdJoinCodeUnavailableError,
	HouseholdNameInvalidError,
	HouseholdNotFoundError,
	type HouseholdProvisioningService,
	type HouseholdService,
} from "@/lib/services/household/server";
import type { ActiveHouseholdServiceDirectory } from "@/lib/services/household/server/active-household-service";
import type { HouseholdServiceDirectory } from "@/lib/services/household/server/household-service";
import { generateInitialHouseholdName } from "@/lib/services/household/server/initial-household-name";
import {
	createMemberService,
	LastOwnerError,
	MemberManagementForbiddenError,
	MemberManagementInvalidError,
	MemberNotFoundError,
	type MemberService,
	type MemberServiceDirectory,
	SoleMemberError,
} from "@/lib/services/member/server";
import { lockHouseholdLifecycle } from "@/lib/services/shared/server/lifecycle-lock";
import {
	ApiForbiddenError,
	type ApiHandlerDeps,
	authenticateApiUser,
	BadRequestError,
	booleanField,
	errorResponse,
	householdJoinCodeThrottledResponse,
	isApiForbiddenError,
	isApiUnauthorizedError,
	jsonResponse,
	optionalStringField,
	publicAppLinkBuilders,
	queryStringField,
	readJsonObject,
	stringField,
	unavailableErrorResponse,
	unavailablePreviewResponse,
	withDirectory,
} from "../shared";

export type HouseholdApiDeps = ApiHandlerDeps & {
	appEnv?: AppEnv;
	createActiveHouseholdService?: (
		directory: ActiveHouseholdServiceDirectory,
	) => ActiveHouseholdService;
	createHouseholdJoinCodeService?: (
		directory: DirectoryDb,
	) => HouseholdJoinCodeService;
	createHouseholdService?: (
		directory: HouseholdServiceDirectory,
	) => HouseholdService;
	createMemberService?: (directory: MemberServiceDirectory) => MemberService;
	createHouseholdProvisioningService?: () => Pick<
		HouseholdProvisioningService,
		"deleteHouseholdDatabase"
	>;
};

export async function handleCreateHousehold(
	request: Request,
	deps?: HouseholdApiDeps,
): Promise<Response> {
	try {
		return await withDirectory(deps, async (directory) => {
			const user = await authenticateApiUser(request, directory, deps);
			const body = await readJsonObject(request);
			const name = createHouseholdNameFromBody(body);
			const appEnv = deps?.appEnv ?? readTursoOperatorConfig().appEnv;
			return runWithSqliteBusyRetry(() =>
				directory.transaction(async (tx) => {
					const household = await householdService(
						tx,
						deps,
					).createOwnedHousehold({
						appEnv,
						user,
						name,
					});
					await memberService(tx, deps).ensureOwnerMembership({
						householdId: household.id,
						user,
					});
					await activeHouseholdService(tx, deps).setActiveHousehold({
						userId: user.id,
						householdId: household.id,
					});
					return jsonResponse(
						{ household: { id: household.id, name: household.name } },
						201,
					);
				}),
			);
		});
	} catch (error) {
		return householdErrorResponse(error, "Create Household API failed");
	}
}

export async function handleSwitchActiveHousehold(
	request: Request,
	deps?: HouseholdApiDeps,
): Promise<Response> {
	try {
		return await withDirectory(deps, async (directory) => {
			const user = await authenticateApiUser(request, directory, deps);
			const body = await readJsonObject(request);
			const activeHousehold = await activeHouseholdService(
				directory,
				deps,
			).switchActiveHousehold({
				userId: user.id,
				householdId: stringField(body, "householdId"),
			});
			return jsonResponse({ activeHousehold });
		});
	} catch (error) {
		return householdErrorResponse(error, "Switch active Household API failed");
	}
}

export async function handleListMembers(
	request: Request,
	{ householdId }: { householdId: string },
	deps?: HouseholdApiDeps,
): Promise<Response> {
	try {
		return await withDirectory(deps, async (directory) => {
			const user = await authenticateApiUser(request, directory, deps);
			const service = memberService(directory, deps);
			const membership = await service.findActiveMembership({
				userId: user.id,
				householdId,
			});
			if (!membership) throw new ApiForbiddenError();

			const members = await service.listHouseholdMembers(householdId);
			return jsonResponse({ members });
		});
	} catch (error) {
		return householdErrorResponse(error, "List Members API failed");
	}
}

export async function handleRenameHousehold(
	request: Request,
	{ householdId }: { householdId: string },
	deps?: HouseholdApiDeps,
): Promise<Response> {
	try {
		return await withDirectory(deps, async (directory) => {
			const user = await authenticateApiUser(request, directory, deps);
			const body = await readJsonObject(request);
			const household = await householdService(directory, deps).renameHousehold(
				{
					householdId,
					name: stringField(body, "name"),
					requestedByUserId: user.id,
				},
			);
			return jsonResponse({
				household: { id: household.id, name: household.name },
			});
		});
	} catch (error) {
		return householdErrorResponse(error, "Rename Household API failed");
	}
}

export async function handleDeleteHousehold(
	request: Request,
	{ householdId }: { householdId: string },
	deps?: HouseholdApiDeps,
): Promise<Response> {
	try {
		return await withDirectory(deps, async (directory) => {
			const user = await authenticateApiUser(request, directory, deps);
			const deletion = await runWithSqliteBusyRetry(() =>
				directory.transaction(async (tx) => {
					await lockHouseholdLifecycle(householdId, tx);
					return householdService(tx, deps).deleteHousehold({
						householdId,
						requestedByUserId: user.id,
					});
				}),
			);

			if (!deletion.requiresDatabaseTeardown) {
				return jsonResponse({
					deleted: true,
					databaseDeleted: deletion.databaseDeleted,
				});
			}

			let databaseDeleted = false;
			try {
				await householdProvisioningService(deps).deleteHouseholdDatabase(
					deletion.tursoDbName,
				);
				await householdService(
					directory,
					deps,
				).markHouseholdDatabaseTeardownSucceeded(householdId);
				databaseDeleted = true;
			} catch (error) {
				await householdService(
					directory,
					deps,
				).markHouseholdDatabaseTeardownFailed(householdId);
				console.error(
					"Delete Household database API failed",
					redactAttributes({
						error: asError(error),
						household_id: householdId,
						turso_db_name: deletion.tursoDbName,
					}),
				);
			}

			return jsonResponse({ deleted: true, databaseDeleted });
		});
	} catch (error) {
		return householdErrorResponse(error, "Delete Household API failed");
	}
}

export async function handleRemoveMember(
	request: Request,
	{ householdId, membershipId }: { householdId: string; membershipId: string },
	deps?: HouseholdApiDeps,
): Promise<Response> {
	try {
		return await withDirectory(deps, async (directory) => {
			const user = await authenticateApiUser(request, directory, deps);
			return runWithSqliteBusyRetry(() =>
				directory.transaction(async (tx) => {
					await lockHouseholdLifecycle(householdId, tx);
					const service = memberService(tx, deps);
					await service.removeMember({
						householdId,
						membershipId,
						requestedByUserId: user.id,
					});
					return jsonResponse({ removed: true });
				}),
			);
		});
	} catch (error) {
		return householdErrorResponse(error, "Remove Member API failed");
	}
}

export async function handleChangeMemberRole(
	request: Request,
	{ householdId, membershipId }: { householdId: string; membershipId: string },
	deps?: HouseholdApiDeps,
): Promise<Response> {
	try {
		return await withDirectory(deps, async (directory) => {
			const user = await authenticateApiUser(request, directory, deps);
			const body = await readJsonObject(request);
			const role = memberRoleField(body);
			return runWithSqliteBusyRetry(() =>
				directory.transaction(async (tx) => {
					await lockHouseholdLifecycle(householdId, tx);
					const service = memberService(tx, deps);
					await service.changeMemberRole({
						householdId,
						membershipId,
						role,
						requestedByUserId: user.id,
					});
					return jsonResponse({ member: { membershipId, role } });
				}),
			);
		});
	} catch (error) {
		return householdErrorResponse(error, "Change Member role API failed");
	}
}

export async function handleLeaveHousehold(
	request: Request,
	{ householdId }: { householdId: string },
	deps?: HouseholdApiDeps,
): Promise<Response> {
	try {
		return await withDirectory(deps, async (directory) => {
			const user = await authenticateApiUser(request, directory, deps);
			return runWithSqliteBusyRetry(() =>
				directory.transaction(async (tx) => {
					await lockHouseholdLifecycle(householdId, tx);
					const service = memberService(tx, deps);
					const { promotedMembershipId } = await service.leaveHousehold({
						householdId,
						userId: user.id,
					});
					return jsonResponse({ left: true, promotedMembershipId });
				}),
			);
		});
	} catch (error) {
		return householdErrorResponse(error, "Leave Household API failed");
	}
}

export async function handleGetJoinCode(
	request: Request,
	{ householdId }: { householdId: string },
	deps?: HouseholdApiDeps,
): Promise<Response> {
	try {
		return await withDirectory(deps, async (directory) => {
			const user = await authenticateApiUser(request, directory, deps);
			const joinCode = await householdJoinCodeService(
				directory,
				deps,
			).getCurrentJoinCode({
				householdId,
				requestedByUserId: user.id,
			});
			return jsonResponse({ joinCode });
		});
	} catch (error) {
		return householdErrorResponse(error, "Get Household Join Code API failed");
	}
}

export async function handleRegenerateJoinCode(
	request: Request,
	{ householdId }: { householdId: string },
	deps?: HouseholdApiDeps,
): Promise<Response> {
	try {
		return await withDirectory(deps, async (directory) => {
			const user = await authenticateApiUser(request, directory, deps);
			const joinCode = await householdJoinCodeService(
				directory,
				deps,
			).regenerateJoinCode({
				householdId,
				requestedByUserId: user.id,
			});
			return jsonResponse({ joinCode });
		});
	} catch (error) {
		return householdErrorResponse(
			error,
			"Regenerate Household Join Code API failed",
		);
	}
}

export async function handleSetJoinCodeEnabled(
	request: Request,
	{ householdId }: { householdId: string },
	deps?: HouseholdApiDeps,
): Promise<Response> {
	try {
		return await withDirectory(deps, async (directory) => {
			const user = await authenticateApiUser(request, directory, deps);
			const body = await readJsonObject(request);
			const enabled = booleanField(body, "enabled");
			const service = householdJoinCodeService(directory, deps);
			const joinCode = enabled
				? await service.enableJoinCode({
						householdId,
						requestedByUserId: user.id,
					})
				: await service.disableJoinCode({
						householdId,
						requestedByUserId: user.id,
					});
			return jsonResponse({ joinCode });
		});
	} catch (error) {
		return householdErrorResponse(
			error,
			"Set Household Join Code enabled API failed",
		);
	}
}

export async function handlePreviewJoinCode(
	request: Request,
	deps?: HouseholdApiDeps,
): Promise<Response> {
	try {
		return await withDirectory(deps, async (directory) => {
			await authenticateApiUser(request, directory, deps);
			const code = queryStringField(request, "code");
			const preview = await householdJoinCodeService(
				directory,
				deps,
			).previewJoinCode(code);
			return preview.available
				? jsonResponse(preview)
				: unavailablePreviewResponse();
		});
	} catch (error) {
		return householdErrorResponse(
			error,
			"Preview Household Join Code API failed",
		);
	}
}

export async function handleJoinByCode(
	request: Request,
	deps?: HouseholdApiDeps,
): Promise<Response> {
	try {
		return await withDirectory(deps, async (directory) => {
			const user = await authenticateApiUser(request, directory, deps);
			const body = await readJsonObject(request);
			const result = await householdJoinCodeService(directory, deps).joinByCode(
				{
					code: stringField(body, "code"),
					userId: user.id,
					source: joinCodeSourceField(body),
				},
			);
			return jsonResponse(result);
		});
	} catch (error) {
		return householdErrorResponse(
			error,
			"Join by Household Join Code API failed",
		);
	}
}

function joinCodeSourceField(
	body: Record<string, unknown>,
): HouseholdJoinCodeSource {
	const source = body.source;
	if (source === undefined) return MANUAL_HOUSEHOLD_JOIN_CODE_SOURCE;
	if (isHouseholdJoinCodeSource(source)) return source;
	throw new BadRequestError("Invalid Household Join Code source");
}

function memberRoleField(body: Record<string, unknown>): "owner" | "member" {
	const role = body.role;
	if (role === "owner" || role === "member") return role;
	throw new BadRequestError("Invalid Member role");
}

function createHouseholdNameFromBody(body: Record<string, unknown>): string {
	const rawName = optionalStringField(body, "name")?.trim();
	if (!rawName) return generateInitialHouseholdName();
	if (rawName.length > 80) {
		throw new HouseholdNameInvalidError(
			"Household name must be 80 characters or fewer.",
		);
	}
	return rawName;
}

function activeHouseholdService(
	directory: ActiveHouseholdServiceDirectory,
	deps?: HouseholdApiDeps,
): ActiveHouseholdService {
	if (deps?.createActiveHouseholdService) {
		return deps.createActiveHouseholdService(directory);
	}
	return createActiveHouseholdService({ directory });
}

function householdJoinCodeService(
	directory: DirectoryDb,
	deps?: HouseholdApiDeps,
): HouseholdJoinCodeService {
	if (deps?.createHouseholdJoinCodeService) {
		return deps.createHouseholdJoinCodeService(directory);
	}
	return createHouseholdJoinCodeService(
		productionJoinCodeServiceDeps(directory),
	);
}

function memberService(
	directory: MemberServiceDirectory,
	deps?: HouseholdApiDeps,
): MemberService {
	if (deps?.createMemberService) return deps.createMemberService(directory);
	return createMemberService({ directory });
}

function householdService(
	directory: HouseholdServiceDirectory,
	deps?: HouseholdApiDeps,
): HouseholdService {
	if (deps?.createHouseholdService)
		return deps.createHouseholdService(directory);
	return createHouseholdService({ directory });
}

function householdProvisioningService(
	deps?: HouseholdApiDeps,
): Pick<HouseholdProvisioningService, "deleteHouseholdDatabase"> {
	if (deps?.createHouseholdProvisioningService) {
		return deps.createHouseholdProvisioningService();
	}
	return createProductionHouseholdProvisioningService();
}

function productionJoinCodeServiceDeps(
	directory: DirectoryDb,
): HouseholdJoinCodeServiceDeps {
	const { buildHouseholdJoinUrl } = publicAppLinkBuilders();
	return {
		directory,
		buildJoinUrl: buildHouseholdJoinUrl,
	};
}

function householdErrorResponse(error: unknown, context: string): Response {
	if (error instanceof BadRequestError) {
		return errorResponse(error.message, 400);
	}
	if (isApiUnauthorizedError(error)) {
		return errorResponse(error.message, 401);
	}
	if (isApiForbiddenError(error)) {
		return errorResponse(error.message, 403);
	}
	if (
		error instanceof ActiveHouseholdMembershipRequiredError ||
		error instanceof HouseholdJoinCodeMembershipRequiredError ||
		error instanceof MemberManagementForbiddenError ||
		error instanceof HouseholdForbiddenError
	) {
		return errorResponse("Forbidden", 403);
	}
	if (
		error instanceof MemberNotFoundError ||
		error instanceof HouseholdNotFoundError
	) {
		return errorResponse(error.message, 404);
	}
	if (error instanceof HouseholdNameInvalidError) {
		return errorResponse(error.message, 400);
	}
	if (
		error instanceof LastOwnerError ||
		error instanceof SoleMemberError ||
		error instanceof MemberManagementInvalidError
	) {
		return errorResponse(error.message, 409);
	}
	if (error instanceof HouseholdJoinCodeUnavailableError) {
		return unavailableErrorResponse("householdJoinCode");
	}
	if (error instanceof HouseholdJoinCodeThrottledError) {
		return householdJoinCodeThrottledResponse();
	}

	console.error(context, redactAttributes({ error: asError(error) }));
	return errorResponse("Server error", 500);
}
