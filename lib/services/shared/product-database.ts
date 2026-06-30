// The minimal local-SQLite surface the product-domain services (item, list)
// depend on. In production a PowerSync `PowerSyncDatabase` satisfies it (via the
// session wrapper in `powersync-app-database.ts`); in tests a better-sqlite3
// adapter satisfies it. Binding the services to this narrow interface — rather
// than the concrete PowerSync handle — is what lets the service tests execute
// the real SQL without loading the native op-sqlite driver, and keeps the
// change/sync-status seams (a session concern) out of the services.
//
// Placeholders are `?`-positional and the dialect is SQLite, matching both
// PowerSync's on-device op-sqlite and better-sqlite3.

export type ProductRow = Record<string, unknown>;

export type ProductWriteResult = {
	rowsAffected: number;
	rows: ProductRow[];
};

export type ProductQuerier = {
	getAll<Row extends ProductRow = ProductRow>(
		sql: string,
		params?: readonly unknown[],
	): Promise<Row[]>;
	getOptional<Row extends ProductRow = ProductRow>(
		sql: string,
		params?: readonly unknown[],
	): Promise<Row | null>;
	execute(
		sql: string,
		params?: readonly unknown[],
	): Promise<ProductWriteResult>;
};

export type ProductDatabase = ProductQuerier & {
	writeTransaction<T>(run: (tx: ProductQuerier) => Promise<T>): Promise<T>;
};
