import {
	bootstrapAuthenticatedAppSession,
	createProductionAuthenticatedAppSessionBootstrapDeps,
} from "@api/bootstrap/bootstrap-service";
import type { DirectoryDb } from "@dont-forget/db";
import {
	type ServerUserProfile,
	UnauthorizedError,
	verifyClerkRequest,
} from "@api/http";
import type { BootstrapResponse } from "@dont-forget/shared";
import { asError } from "@dont-forget/shared";
import { redactAttributes } from "@dont-forget/shared";

export type BootstrapApiDeps = {
	directory: DirectoryDb;
};

export async function handleBootstrap(
	request: Request,
	deps: BootstrapApiDeps,
): Promise<Response> {
	try {
		const profile = await verifyClerkRequest(request);
		return await createBootstrapResponse(profile, deps.directory);
	} catch (error) {
		if (error instanceof UnauthorizedError) {
			return Response.json({ error: error.message }, { status: 401 });
		}

		console.error(
			"Bootstrap API failed",
			redactAttributes({ error: asError(error) }),
		);
		return Response.json({ error: "Bootstrap failed" }, { status: 500 });
	}
}

async function createBootstrapResponse(
	profile: ServerUserProfile,
	directory: DirectoryDb,
): Promise<Response> {
	const response = await bootstrapAuthenticatedAppSession(
		profile,
		createProductionAuthenticatedAppSessionBootstrapDeps(directory),
	);
	const payload: BootstrapResponse = response;
	return Response.json(payload);
}
