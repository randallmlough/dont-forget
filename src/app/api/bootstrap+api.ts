import { asError } from "@/lib/errors";
import { redactAttributes } from "@/lib/redact";

export async function POST(request: Request): Promise<Response> {
	let UnauthorizedError:
		| typeof import("@/lib/server/auth")["UnauthorizedError"]
		| null = null;

	try {
		const [db, bootstrap, auth] = await Promise.all([
			import("@/db/server/client"),
			import("@/lib/services/session/server"),
			import("@/lib/server/auth"),
		]);
		UnauthorizedError = auth.UnauthorizedError;

		const profile = await auth.verifyClerkRequest(request);
		const client = db.directoryClient();

		try {
			const response = await bootstrap.bootstrapAuthenticatedAppSession(
				profile,
				bootstrap.createProductionAuthenticatedAppSessionBootstrapDeps(
					db.directoryDb(client),
				),
			);
			return Response.json(response);
		} finally {
			await client.end();
		}
	} catch (error) {
		if (UnauthorizedError && error instanceof UnauthorizedError) {
			return Response.json({ error: error.message }, { status: 401 });
		}

		console.error(
			"Bootstrap API failed",
			redactAttributes({ error: asError(error) }),
		);
		return Response.json({ error: "Bootstrap failed" }, { status: 500 });
	}
}
