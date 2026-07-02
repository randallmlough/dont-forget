// Public surface of the /api/data write applicator (db-owned, ADR-0014). The
// HTTP shim in lib/api/data imports the core, the contracts, and the production
// defaults from here, pointing the dependency arrow lib/api -> db.

export {
	applyOp,
	batchSchema,
	DataClientError,
	type DataOp,
	type DataTransaction,
} from "./applicator";
export { DataAuthError, defaultAuthenticate } from "./authenticate";
export { defaultWithTransaction } from "./pg-transaction";
