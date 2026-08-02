// /api/data — the PowerSync write endpoint. HTTP transport shim only: it reads
// the Request, dispatches authentication and the transaction through required
// dependencies wired by the process composition root,
// runs the db-owned applicator inside one transaction, and maps errors to status
// codes. All write logic, the batch contract, and the SQL live in the db layer
// (@/server/sync; ADR-0014).

import {
	allowDataRequest,
	applyOp,
	batchSchema,
	DataAuthError,
	DataClientError,
	type DataOp,
	type DataTransaction,
	PAYLOAD_MAX_BYTES,
	readBoundedJsonBody,
} from "@/server/sync";

export type DataDeps = {
	// Returns the internal users.id, or throws DataAuthError on bad/missing token.
	authenticate: (request: Request) => Promise<string>;
	// Runs `body` inside a single pg transaction (BEGIN/COMMIT/ROLLBACK).
	withTransaction: <T>(run: (tx: DataTransaction) => Promise<T>) => Promise<T>;
};

export async function handleDataUpload(
	request: Request,
	deps: DataDeps,
): Promise<Response> {
	return applyDataUpload(request, deps);
}

async function applyDataUpload(
	request: Request,
	deps: DataDeps,
): Promise<Response> {
	let userId: string;
	try {
		userId = await deps.authenticate(request);
	} catch (error) {
		if (error instanceof DataAuthError) {
			return errorResponse(error.message, 401);
		}
		// Unexpected auth-path failure is transient.
		console.error("/api/data auth failed", error);
		return errorResponse("Server error", 500);
	}

	if (!allowDataRequest(userId, Date.now())) {
		return errorResponse("Too many requests", 429);
	}

	let batch: DataOp[];
	try {
		batch = await parseBatch(request);
	} catch (error) {
		if (error instanceof DataClientError) {
			return errorResponse(error.message, error.status);
		}
		console.error("/api/data parse failed", error);
		return errorResponse("Server error", 500);
	}

	try {
		await deps.withTransaction(async (tx) => {
			for (const op of batch) {
				await applyOp(tx, userId, op);
			}
		});
	} catch (error) {
		if (error instanceof DataClientError) {
			// Terminal: the whole transaction rolled back; the client discards.
			return errorResponse(error.message, error.status);
		}
		// Transient (db unavailable, etc.): the client retries.
		console.error("/api/data transaction failed", error);
		return errorResponse("Server error", 500);
	}

	return Response.json({ ok: true }, { status: 200 });
}

async function parseBatch(request: Request): Promise<DataOp[]> {
	const declared = Number(request.headers.get("content-length") ?? "");
	if (Number.isFinite(declared) && declared > PAYLOAD_MAX_BYTES) {
		throw new DataClientError("Payload too large", 413);
	}

	const body = await readBoundedJsonBody(request.body);
	const result = batchSchema.safeParse(body);
	if (!result.success) {
		throw new DataClientError("Malformed batch", 400);
	}
	return result.data.batch;
}

function errorResponse(message: string, status: number): Response {
	return Response.json({ error: message }, { status });
}
