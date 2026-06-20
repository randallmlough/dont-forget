// Production authentication for /api/data: sub-only Clerk verification, then
// resolve the internal users.id by clerk_user_id from the pg directory.
//
// This lives in the db layer (ADR-0014) and stays lint-clean: the no-services-
// imports-in-db rule only bars @/lib/services and @/lib/api imports, and these
// dynamic imports are @/lib/server/auth + @/lib/env (cross-cutting lib utilities,
// not service/api layers), so the downward arrow lib/api -> db is preserved.

import { eq } from "drizzle-orm";
import { users } from "@/db/schema/postgres";
import { postgresDb, postgresPool } from "@/db/server/pg-client";

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
	const [{ bearerToken }, { verifyToken }, { readClerkServerConfig }] =
		await Promise.all([
			import("@/lib/server/auth"),
			import("@clerk/backend"),
			import("@/lib/env"),
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
