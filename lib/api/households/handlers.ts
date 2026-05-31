import type { DirectoryDb } from "@/db/client";
import {
	ActiveHouseholdMembershipRequiredError,
	type ActiveHouseholdService,
	createActiveHouseholdService,
	createHouseholdJoinCodeService,
	HouseholdJoinCodeMembershipRequiredError,
	type HouseholdJoinCodeService,
	type HouseholdJoinCodeServiceDeps,
	HouseholdJoinCodeThrottledError,
	HouseholdJoinCodeUnavailableError,
} from "@/lib/services/household/server";
import {
	createMemberService,
	type MemberService,
} from "@/lib/services/member/server";
import {
	type ApiHandlerDeps,
	authenticateApiUser,
	BadRequestError,
	booleanField,
	errorResponse,
	HOUSEHOLD_CODE_THROTTLED_MESSAGE,
	HOUSEHOLD_CODE_UNAVAILABLE_MESSAGE,
	isUnauthorizedError,
	jsonResponse,
	publicAppLinkBuilders,
	queryStringField,
	readJsonObject,
	stringField,
	withDirectory,
} from "../shared";

export type HouseholdApiDeps = ApiHandlerDeps & {
	activeHouseholdService?: ActiveHouseholdService;
	createActiveHouseholdService?: (
		directory: DirectoryDb,
	) => ActiveHouseholdService;
	householdJoinCodeService?: HouseholdJoinCodeService;
	createHouseholdJoinCodeService?: (
		directory: DirectoryDb,
	) => HouseholdJoinCodeService;
	memberService?: MemberService;
	createMemberService?: (directory: DirectoryDb) => MemberService;
};

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
			if (!membership) throw new ActiveHouseholdMembershipRequiredError();

			const members = await service.listHouseholdMembers(householdId);
			return jsonResponse({ members });
		});
	} catch (error) {
		return householdErrorResponse(error, "List Members API failed");
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
			const code = queryStringField(request, "code");
			const preview = await householdJoinCodeService(
				directory,
				deps,
			).previewJoinCode(code);
			return preview.available
				? jsonResponse(preview)
				: jsonResponse({ available: false }, 404);
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
			const source = body.source === "join_link" ? "join_link" : "manual_code";
			const result = await householdJoinCodeService(directory, deps).joinByCode(
				{
					code: stringField(body, "code"),
					userId: user.id,
					source,
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

function activeHouseholdService(
	directory: DirectoryDb,
	deps?: HouseholdApiDeps,
): ActiveHouseholdService {
	if (deps?.activeHouseholdService) return deps.activeHouseholdService;
	if (deps?.createActiveHouseholdService) {
		return deps.createActiveHouseholdService(directory);
	}
	return createActiveHouseholdService({ directory });
}

function householdJoinCodeService(
	directory: DirectoryDb,
	deps?: HouseholdApiDeps,
): HouseholdJoinCodeService {
	if (deps?.householdJoinCodeService) return deps.householdJoinCodeService;
	if (deps?.createHouseholdJoinCodeService) {
		return deps.createHouseholdJoinCodeService(directory);
	}
	return createHouseholdJoinCodeService(
		productionJoinCodeServiceDeps(directory),
	);
}

function memberService(
	directory: DirectoryDb,
	deps?: HouseholdApiDeps,
): MemberService {
	if (deps?.memberService) return deps.memberService;
	if (deps?.createMemberService) return deps.createMemberService(directory);
	return createMemberService({ directory });
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
	if (isUnauthorizedError(error)) {
		return errorResponse(error.message, 401);
	}
	if (
		error instanceof ActiveHouseholdMembershipRequiredError ||
		error instanceof HouseholdJoinCodeMembershipRequiredError
	) {
		return errorResponse("Forbidden", 403);
	}
	if (error instanceof HouseholdJoinCodeUnavailableError) {
		return errorResponse(HOUSEHOLD_CODE_UNAVAILABLE_MESSAGE, 404);
	}
	if (error instanceof HouseholdJoinCodeThrottledError) {
		return errorResponse(HOUSEHOLD_CODE_THROTTLED_MESSAGE, 429);
	}

	console.error(context, error);
	return errorResponse("Server error", 500);
}
