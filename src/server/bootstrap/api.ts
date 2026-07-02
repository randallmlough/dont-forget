import {
	bootstrapAuthenticatedAppSession,
	createProductionAuthenticatedAppSessionBootstrapDeps,
} from "@/server/bootstrap/bootstrap-service";
import { directoryClient, directoryDb } from "@/server/db/client";
import { UnauthorizedError, verifyClerkRequest } from "@/server/http";
import type { BootstrapResponse } from "@/shared/contracts/bootstrap";
import { asError } from "@/shared/errors";
import { redactAttributes } from "@/shared/redact";

export async function handleBootstrap(request: Request): Promise<Response> {
	try {
		const profile = await verifyClerkRequest(request);
		const client = directoryClient();

		try {
			const response = await bootstrapAuthenticatedAppSession(
				profile,
				createProductionAuthenticatedAppSessionBootstrapDeps(
					directoryDb(client),
				),
			);
			const payload: BootstrapResponse = response;
			return Response.json(payload);
		} finally {
			await client.end();
		}
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
