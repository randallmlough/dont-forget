// Production authentication for /api/data: sub-only Clerk verification, then
// resolve the internal users.id by clerk_user_id from the pg directory.
//
// Lives in the db layer (ADR-0014). @/server/http and @clerk/backend are
// imported dynamically so the heavy, server-only Clerk SDK loads only when a
// request is actually authenticated — a caller that injects its own auth (e.g.
// the handler tests) never pulls it in. The other deps (drizzle, the pg schema,
// @/shared/env) are already in this module's static graph via @/server/db/client,
// so importing them statically defers nothing.

import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import { directoryDb } from "@/server/db/client";
import { users } from "@/server/db/schema/postgres";
import { readClerkServerConfig } from "@/shared/env";

// Auth failure (401).
export class DataAuthError extends Error {
	constructor(message = "Unauthorized") {
		super(message);
		this.name = "DataAuthError";
	}
}

// Sub-only Clerk verification: verifyToken (no Backend-API getUser round-trip),
// then resolve the internal users.id by clerk_user_id from the pg directory.
export async function defaultAuthenticate(
	request: Request,
	pool: Pool,
): Promise<string> {
	const [{ bearerToken }, { verifyToken }] = await Promise.all([
		import("@/server/http"),
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

	const db = directoryDb(pool);
	const [row] = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.clerkUserId, clerkUserId))
		.limit(1);
	if (!row) {
		throw new DataAuthError("Unknown User");
	}
	return row.id;
}
