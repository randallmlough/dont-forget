import {
	type PowerSyncBackendConnector,
	type PowerSyncCredentials,
	UpdateType,
} from "@powersync/react-native";

type GetToken = () => Promise<string | null>;
type ApiBaseUrl = () => string;
type DataOp = "PUT" | "PATCH" | "DELETE";

type PowerSyncCrudEntry = {
	op: UpdateType;
	table: string;
	id: string;
	opData?: Record<string, unknown>;
};

type PowerSyncCrudTransaction = {
	crud: PowerSyncCrudEntry[];
	complete: () => Promise<void>;
};

export type PowerSyncUploadDatabase = {
	getNextCrudTransaction: () => Promise<PowerSyncCrudTransaction | null>;
};

export type PowerSyncConnectorDeps = {
	powersyncGetToken: GetToken;
	sessionGetToken: GetToken;
	apiBaseUrl: ApiBaseUrl;
	powersyncUrl: string;
};

// 401 is intentionally NOT terminal: auth is refreshable. The connector
// fetches a new session token each attempt (see uploadData), so throwing
// keeps the transaction queued and a later retry can present a valid token.
// 400/403/409 are deterministic server rejections a retry cannot fix, so we
// discard to avoid wedging the FIFO upload queue on a poison-pill transaction.
const TERMINAL_CLIENT_STATUSES: ReadonlySet<number> = new Set([400, 403, 409]);

export class PowerSyncConnector implements PowerSyncBackendConnector {
	private readonly powersyncGetToken: GetToken;
	private readonly sessionGetToken: GetToken;
	private readonly apiBaseUrl: ApiBaseUrl;
	private readonly powersyncUrl: string;

	constructor({
		powersyncGetToken,
		sessionGetToken,
		apiBaseUrl,
		powersyncUrl,
	}: PowerSyncConnectorDeps) {
		this.powersyncGetToken = powersyncGetToken;
		this.sessionGetToken = sessionGetToken;
		this.apiBaseUrl = apiBaseUrl;
		this.powersyncUrl = powersyncUrl;
	}

	async fetchCredentials(): Promise<PowerSyncCredentials> {
		const token = await this.powersyncGetToken();
		if (!token) {
			throw new Error("Sign in to continue.");
		}

		return { endpoint: this.powersyncUrl, token };
	}

	async uploadData(database: PowerSyncUploadDatabase): Promise<void> {
		const tx = await database.getNextCrudTransaction();
		if (!tx) return;

		const batch = tx.crud.map((entry) => ({
			op: mapUpdateType(entry.op),
			table: entry.table,
			id: entry.id,
			data: entry.opData ?? {},
		}));
		const token = await this.sessionGetToken();
		if (!token) {
			throw new Error("Sign in to continue.");
		}

		const response = await fetch(`${this.apiBaseUrl()}/api/data`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ batch }),
		});

		if (response.ok || TERMINAL_CLIENT_STATUSES.has(response.status)) {
			await tx.complete();
			return;
		}

		throw new Error(`Data upload failed with status ${response.status}`);
	}
}

function mapUpdateType(op: UpdateType): DataOp {
	switch (op) {
		case UpdateType.PUT:
			return "PUT";
		case UpdateType.PATCH:
			return "PATCH";
		case UpdateType.DELETE:
			return "DELETE";
	}

	const exhaustive: never = op;
	return exhaustive;
}
