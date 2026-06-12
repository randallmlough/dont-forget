const STUB_MESSAGE =
	"@tursodatabase/sync-react-native is native-only. Jest maps it to this stub; inject a TursoHouseholdStoreRuntime via options.runtime instead of loading the real module.";

export class Database {
	constructor() {
		throw new Error(STUB_MESSAGE);
	}
}

export function getDbPath(): string {
	throw new Error(STUB_MESSAGE);
}
