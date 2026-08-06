import type { DirectoryDb } from "@dont-forget/db";
import {
	authenticateApiUser,
	BadRequestError,
	errorResponse,
	isApiUnauthorizedError,
	jsonResponse,
	optionalStringField,
	type PublicWebApiHandlerDeps,
	publicWebLinkBuilders,
	queryStringField,
	readJsonObject,
	stringField,
	unavailableErrorResponse,
	unavailablePreviewResponse,
} from "@api/http";
import {
	createInvitationService,
	InvitationInvalidEmailError,
	InvitationMembershipRequiredError,
	type InvitationService,
	type InvitationServiceDeps,
	InvitationUnavailableError,
} from "@api/invitations/invitation-service";
import type {
	CreateInvitationResponse,
	InvitationPreview,
	ListInvitationsResponse,
	RevokeInvitationResponse,
} from "@dont-forget/shared";
import { asError } from "@dont-forget/shared";
import { redactAttributes } from "@dont-forget/shared";

export type InvitationApiDeps = PublicWebApiHandlerDeps & {
	createInvitationService?: (directory: DirectoryDb) => InvitationService;
};

export async function handleCreateInvitation(
	request: Request,
	deps: InvitationApiDeps,
): Promise<Response> {
	try {
		const directory = deps.directory;
		const user = await authenticateApiUser(request, directory, deps);
		const body = await readJsonObject(request);
		const service = invitationService(directory, deps);
		const result = await service.createInvitation({
			householdId: stringField(body, "householdId"),
			createdByUserId: user.id,
			email: optionalStringField(body, "email"),
		});

		const payload: CreateInvitationResponse = {
			invitation: result.invitation,
			emailDelivery: result.emailDelivery,
			reusedExisting: result.reusedExisting,
		};
		return jsonResponse(payload, result.reusedExisting ? 200 : 201);
	} catch (error) {
		return invitationErrorResponse(error, "Create Invitation API failed");
	}
}

export async function handlePreviewInvitation(
	request: Request,
	deps: InvitationApiDeps,
): Promise<Response> {
	try {
		const directory = deps.directory;
		const token = queryStringField(request, "token");
		const preview: InvitationPreview = await invitationService(
			directory,
			deps,
		).previewInvitation(token);
		return preview.available
			? jsonResponse(preview)
			: unavailablePreviewResponse();
	} catch (error) {
		return invitationErrorResponse(error, "Preview Invitation API failed");
	}
}

export async function handleAcceptInvitation(
	request: Request,
	deps: InvitationApiDeps,
): Promise<Response> {
	try {
		const directory = deps.directory;
		const user = await authenticateApiUser(request, directory, deps);
		const body = await readJsonObject(request);
		const result = await invitationService(directory, deps).acceptInvitation({
			token: stringField(body, "token"),
			userId: user.id,
		});
		return jsonResponse(result);
	} catch (error) {
		return invitationErrorResponse(error, "Accept Invitation API failed");
	}
}

export async function handleListInvitations(
	request: Request,
	{ householdId }: { householdId: string },
	deps: InvitationApiDeps,
): Promise<Response> {
	try {
		const directory = deps.directory;
		const user = await authenticateApiUser(request, directory, deps);
		const invitations = await invitationService(
			directory,
			deps,
		).listPendingInvitations({
			householdId,
			requestedByUserId: user.id,
		});
		const payload: ListInvitationsResponse = { invitations };
		return jsonResponse(payload);
	} catch (error) {
		return invitationErrorResponse(error, "List Invitations API failed");
	}
}

export async function handleRevokeInvitation(
	request: Request,
	{ invitationId }: { invitationId: string },
	deps: InvitationApiDeps,
): Promise<Response> {
	try {
		const directory = deps.directory;
		const user = await authenticateApiUser(request, directory, deps);
		const body = await readJsonObject(request);
		if (body.revoked !== true) {
			throw new BadRequestError("Invalid revoked");
		}

		const invitation = await invitationService(
			directory,
			deps,
		).revokeInvitation({
			invitationId,
			revokedByUserId: user.id,
		});
		const payload: RevokeInvitationResponse = { invitation };
		return jsonResponse(payload);
	} catch (error) {
		return invitationErrorResponse(error, "Revoke Invitation API failed");
	}
}

function invitationService(
	directory: DirectoryDb,
	deps: InvitationApiDeps,
): InvitationService {
	if (deps.createInvitationService) {
		return deps.createInvitationService(directory);
	}
	return createInvitationService(
		productionInvitationServiceDeps(directory, deps.publicWebBaseUrl),
	);
}

function productionInvitationServiceDeps(
	directory: DirectoryDb,
	publicWebBaseUrl: string,
): InvitationServiceDeps {
	const { buildInvitationAcceptUrl } = publicWebLinkBuilders({
		publicWebBaseUrl,
	});
	return {
		directory,
		buildAcceptUrl: buildInvitationAcceptUrl,
	};
}

function invitationErrorResponse(error: unknown, context: string): Response {
	if (error instanceof BadRequestError) {
		return errorResponse(error.message, 400);
	}
	if (isApiUnauthorizedError(error)) {
		return errorResponse(error.message, 401);
	}
	if (error instanceof InvitationMembershipRequiredError) {
		return errorResponse("Forbidden", 403);
	}
	if (error instanceof InvitationInvalidEmailError) {
		return errorResponse(error.message, 400);
	}
	if (error instanceof InvitationUnavailableError) {
		return unavailableErrorResponse("invitation");
	}

	console.error(context, redactAttributes({ error: asError(error) }));
	return errorResponse("Server error", 500);
}
