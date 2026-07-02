// Production authentication for /api/data: sub-only Clerk verification, then
// resolve the internal users.id by clerk_user_id from the pg directory.
//
// Lives in the db layer (ADR-0014). @/lib/server/auth and @clerk/backend are
// imported dynamically so the heavy, server-only Clerk SDK loads only when a
// request is actually authenticated — a caller that injects its own auth (e.g.
// the handler tests) never pulls it in. The other deps (drizzle, the pg schema,
// @/lib/env) are already in this module's static graph via @/db/server/pg-client,
// so importing them statically defers nothing. db/ importing @/lib/* is
// lint-clean: no-services-imports-in-db bars only @/lib/services and @/lib/api.

import { eq } from "drizzle-orm";
import { users } from "@/db/schema/postgres";
import { postgresDb, postgresPool } from "@/db/server/pg-client";
import { readClerkServerConfig } from "@/lib/env";

// Auth failure (401).
export class DataAuthError extends Error {
	constructor(message = "Unauthorized") {
		super(message);
		this.name = "DataAuthError";
	}
}

// Sub-only Clerk verification: verifyToken (no Backend-API getUser round-trip),
// then resolve the internal users.id by clerk_user_id from the pg directory.
export async function defaultAuthenticate(request: Request): Promise<string> {
	const [{ bearerToken }, { verifyToken }] = await Promise.all([
		import("@/lib/server/auth"),
		import("@clerk/backend"),
	]);

	let clerkUserId: string | undefined;
	try {
		const token = bearerToken(request.headers.get("authorization"));
		const { secretKey } = readClerkServerConfig();
		const payload = await verifyToken(token, { secretKey });
		clerkUserId = payload.sub;
	} catch {
		throw new DataAuthError("Invalid Clerk session token");
	}
	if (!clerkUserId) {
		throw new DataAuthError("Invalid Clerk session token");
	}

	const pool = postgresPool();
	try {
		const db = postgresDb(pool);
		const [row] = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.clerkUserId, clerkUserId))
			.limit(1);
		if (!row) {
			throw new DataAuthError("Unknown User");
		}
		return row.id;
	} finally {
		await pool.end();
	}
}
