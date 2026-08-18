import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";
import { db } from "./powersync";
import {
	type PersistedAuthenticatedAppSession,
	readPersistedAuthenticatedAppSession,
} from "./session-hint";

const DATABASE_OWNER_KEY = "dont-forget/powersync-database-owner";

const databaseOwnerSchema = z.strictObject({
	internalUserId: z.string().min(1),
});

const localUserRowsSchema = z.array(z.strictObject({ id: z.string().min(1) }));

export type DatabasePreparation =
	| { status: "ready" }
	| { status: "differentUserBlocked" };

export type DatabaseOwnership = {
	prepareForUser: (internalUserId: string) => Promise<DatabasePreparation>;
	removePreviousUserDataAndPrepare: (
		incomingInternalUserId: string,
	) => Promise<void>;
};

export type DatabaseOwnershipDeps = {
	getStorageItem?: (key: string) => Promise<string | null>;
	setStorageItem?: (key: string, value: string) => Promise<void>;
	readLocalUserRows?: () => Promise<unknown>;
	readPersistedAuthenticatedAppSession?: () => Promise<PersistedAuthenticatedAppSession | null>;
	disconnectAndClear?: () => Promise<void>;
};

export function createDatabaseOwnership(
	deps: DatabaseOwnershipDeps = {},
): DatabaseOwnership {
	const getStorageItem = deps.getStorageItem ?? AsyncStorage.getItem;
	const setStorageItem = deps.setStorageItem ?? AsyncStorage.setItem;
	const disconnectAndClear =
		deps.disconnectAndClear ?? (() => db.disconnectAndClear());
	const readLocalUserRows =
		deps.readLocalUserRows ??
		(() => db.getAll("SELECT id FROM users ORDER BY id"));
	const readPersistedSession =
		deps.readPersistedAuthenticatedAppSession ??
		readPersistedAuthenticatedAppSession;

	async function readOwner(): Promise<string | null> {
		const raw = await getStorageItem(DATABASE_OWNER_KEY);
		if (raw === null) return null;
		const parsed: unknown = JSON.parse(raw);
		return databaseOwnerSchema.parse(parsed).internalUserId;
	}

	async function writeOwner(internalUserId: string): Promise<void> {
		const owner = databaseOwnerSchema.parse({ internalUserId });
		await setStorageItem(DATABASE_OWNER_KEY, JSON.stringify(owner));
	}

	async function inferOwner(incomingInternalUserId: string): Promise<string> {
		const localUsers = localUserRowsSchema.parse(await readLocalUserRows());
		if (localUsers.length > 1) {
			throw new Error("Local PowerSync database has multiple User owners");
		}
		const persistedSession = await readPersistedSession();
		if (localUsers[0]) {
			if (
				persistedSession &&
				persistedSession.session.user.id !== localUsers[0].id
			) {
				throw new Error("Local database ownership evidence is contradictory");
			}
			return localUsers[0].id;
		}
		return persistedSession?.session.user.id ?? incomingInternalUserId;
	}

	return {
		async prepareForUser(internalUserId) {
			const storedOwner = await readOwner();
			const owner = storedOwner ?? (await inferOwner(internalUserId));
			if (storedOwner === null) await writeOwner(owner);
			return owner === internalUserId
				? { status: "ready" }
				: { status: "differentUserBlocked" };
		},
		async removePreviousUserDataAndPrepare(incomingInternalUserId) {
			await disconnectAndClear();
			await writeOwner(incomingInternalUserId);
		},
	};
}

export const databaseOwnership = createDatabaseOwnership({
	readLocalUserRows: () => db.getAll("SELECT id FROM users ORDER BY id"),
	readPersistedAuthenticatedAppSession,
});
