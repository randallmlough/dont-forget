import { directoryClient, directoryDb } from "@/db/server/client";
import { asError } from "@/lib/errors";
import { redactAttributes } from "@/lib/redact";
import { UnauthorizedError, verifyClerkRequest } from "@/lib/server/auth";
import {
	bootstrapAuthenticatedAppSession,
	createProductionAuthenticatedAppSessionBootstrapDeps,
	DeletedUserBootstrapError,
} from "@/lib/services/session/server";

export async function handleBootstrap(request: Request): Promise<Response> {
	try {
		const userRecord = await verifyClerkRequest(request);
		const client = directoryClient();

		try {
			const response = await bootstrapAuthenticatedAppSession(
				userRecord,
				createProductionAuthenticatedAppSessionBootstrapDeps(
					directoryDb(client),
				),
			);
			return Response.json(response);
		} finally {
			await client.close();
		}
	} catch (error) {
		if (error instanceof UnauthorizedError) {
			return Response.json({ error: error.message }, { status: 401 });
		}
		if (error instanceof DeletedUserBootstrapError) {
			return Response.json({ error: error.message }, { status: 401 });
		}

		console.error(
			"Bootstrap API failed",
			redactAttributes({ error: asError(error) }),
		);
		return Response.json({ error: "Bootstrap failed" }, { status: 500 });
	}
}
