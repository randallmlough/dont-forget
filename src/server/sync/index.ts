// Public surface of the /api/data write applicator (db-owned, ADR-0014). The
// HTTP shim in lib/api/data imports the core, the contracts, and the production
// defaults from here, pointing the dependency arrow lib/api -> db.

export {
	applyOp,
	BATCH_MAX,
	batchSchema,
	DataClientError,
	type DataOp,
	type DataTransaction,
} from "./applicator";
export { DataAuthError, defaultAuthenticate } from "./authenticate";
export { defaultWithTransaction } from "./pg-transaction";
export {
	allowDataRequest,
	PAYLOAD_MAX_BYTES,
	RATE_LIMIT_CAPACITY,
	RATE_LIMIT_WINDOW_MS,
	resetRateLimiterForTests,
} from "./rate-limit";
