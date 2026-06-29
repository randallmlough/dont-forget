export type ProductDataRow = Record<string, unknown>;

export type ProductDataWriteResult = {
	rowsAffected: number;
	rows: ProductDataRow[];
};

export type ProductDataExecutor = {
	execute(
		sql: string,
		parameters?: readonly unknown[],
	): Promise<ProductDataWriteResult>;
	getAll<Row extends ProductDataRow = ProductDataRow>(
		sql: string,
		parameters?: readonly unknown[],
	): Promise<Row[]>;
	getOptional<Row extends ProductDataRow = ProductDataRow>(
		sql: string,
		parameters?: readonly unknown[],
	): Promise<Row | null>;
};

export type ProductDataStore = ProductDataExecutor & {
	writeTransaction<T>(run: (tx: ProductDataExecutor) => Promise<T>): Promise<T>;
	changes: {
		subscribe(listener: () => void): { remove: () => void };
	};
};
