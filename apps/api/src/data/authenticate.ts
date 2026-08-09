// Production authentication for /api/data uses the process-owned Clerk gateway,
// then resolves the internal users.id by clerk_user_id from the directory.

import type { ClerkGateway } from "@api/http";
import type { DirectoryDb } from "@dont-forget/db";
import { users } from "@dont-forget/db/schema";
import { eq } from "drizzle-orm";

// Auth failure (401).
export class DataAuthError extends Error {
	constructor(message = "Unauthorized") {
		super(message);
		this.name = "DataAuthError";
	}
}

export async function defaultAuthenticate(
	request: Request,
	directory: DirectoryDb,
	gateway: ClerkGateway,
): Promise<string> {
	let clerkUserId: string;
	try {
		clerkUserId = await gateway.authenticateRequestSubject(request);
	} catch {
		throw new DataAuthError("Invalid Clerk session token");
	}

	const [row] = await directory
		.select({ id: users.id })
		.from(users)
		.where(eq(users.clerkUserId, clerkUserId))
		.limit(1);
	if (!row) {
		throw new DataAuthError("Unknown User");
	}
	return row.id;
}
