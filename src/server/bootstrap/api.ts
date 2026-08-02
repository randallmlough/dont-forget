import {
	bootstrapAuthenticatedAppSession,
	createProductionAuthenticatedAppSessionBootstrapDeps,
} from "@/server/bootstrap/bootstrap-service";
import type { DirectoryDb } from "@/server/db/client";
import {
	type ServerUserProfile,
	UnauthorizedError,
	verifyClerkRequest,
} from "@/server/http";
import type { BootstrapResponse } from "@/shared/contracts/bootstrap";
import { asError } from "@/shared/errors";
import { redactAttributes } from "@/shared/redact";

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
