import * as Crypto from "expo-crypto";

import type { ActiveListDataAdapter, ActiveListInitialState, ActiveListItem } from "@/components/active-list";
import { openHouseholdDb, type HouseholdDb, type OpenHouseholdDbConfig } from "@/lib/app/household-db";
import type { BootstrapResponse } from "@/lib/bootstrap";
import { createAppId, type RandomUuid } from "@/lib/ids";
import { logger, type Logger } from "@/lib/logger";

type ActiveListDb = {
  execute: (statement: Parameters<HouseholdDb["execute"]>[0]) => Promise<{ rows: Array<Record<string, unknown>> }>;
  push?: () => Promise<void>;
  close: () => void | Promise<void>;
};

export type HouseholdActiveListAdapterConfig = {
  household: BootstrapResponse["activeHousehold"];
  list: BootstrapResponse["activeList"];
  currentUser: BootstrapResponse["user"];
  members: BootstrapResponse["members"];
  database: BootstrapResponse["householdDatabase"];
};

type AdapterOptions = {
  db?: ActiveListDb;
  openDb?: (config: OpenHouseholdDbConfig) => Promise<ActiveListDb>;
  now?: () => number;
  randomUuid?: RandomUuid;
};

export function createHouseholdActiveListAdapter(
  config: HouseholdActiveListAdapterConfig,
  options: AdapterOptions = {},
): ActiveListDataAdapter {
  const dbPromise = options.db
    ? Promise.resolve(options.db)
    : (options.openDb ?? openHouseholdDb)({ householdId: config.household.id, database: config.database });
  const ownsDb = !options.db;
  const now = options.now ?? Date.now;
  const randomUuid = options.randomUuid ?? Crypto.randomUUID;
  const memberNames = new Map<string, string | null>();
  const log = logger.with({ household_id: config.household.id, list_id: config.list.id });
  let closed = false;

  for (const member of config.members) {
    memberNames.set(member.userId, member.displayName);
  }
  memberNames.set(config.currentUser.id, config.currentUser.displayName);

  return {
    async load() {
      const db = await dbPromise;
      const result = await db.execute({
        sql: `
          SELECT
            i.id,
            i.name,
            c.user_id AS checked_by_user_id,
            c.checked_at AS checked_at
          FROM items i
          LEFT JOIN item_checks c ON c.rowid = (
            SELECT c2.rowid
            FROM item_checks c2
            WHERE c2.item_id = i.id
            ORDER BY c2.updated_at DESC, c2.user_id DESC
            LIMIT 1
          )
          WHERE i.list_id = ? AND i.deleted_at IS NULL
          ORDER BY i.position ASC, i.created_at ASC, i.id ASC
        `,
        args: [config.list.id],
      });

      return {
        householdName: config.household.name,
        listName: config.list.name,
        items: result.rows.map((row) => itemFromRow(row, memberNames)),
      };
    },
    async addItem(rawName) {
      const db = await dbPromise;
      const name = rawName.trim();
      if (!name) {
        throw new Error("Item name is required");
      }

      const position = await nextPosition(db, config.list.id);
      const id = createAppId("itm", randomUuid);
      const timestamp = now();

      await db.execute({
        sql: `
          INSERT INTO items (
            id,
            list_id,
            name,
            position,
            created_by_user_id,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        args: [id, config.list.id, name, position, config.currentUser.id, timestamp, timestamp],
      });
      requestPush(db, log, { item_id: id });

      return { id, name, checked: false, checkedByMemberName: null };
    },
    async setItemChecked(itemId, checked) {
      const db = await dbPromise;
      const timestamp = now();
      await db.execute({
        sql: `
          INSERT INTO item_checks (item_id, user_id, checked_at, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(item_id, user_id) DO UPDATE SET
            checked_at = excluded.checked_at,
            updated_at = excluded.updated_at
        `,
        args: [itemId, config.currentUser.id, checked ? timestamp : null, timestamp],
      });
      requestPush(db, log, { item_id: itemId });
    },
    async close() {
      if (!ownsDb || closed) return;
      closed = true;
      const db = await dbPromise.catch(() => null);
      await db?.close();
    },
  };
}

function requestPush(db: ActiveListDb, log: Logger, attributes: { item_id: string }) {
  if (!db.push) return;

  void db.push().catch((error) => {
    log.warn("household push failed", { ...attributes, error });
  });
}

async function nextPosition(db: ActiveListDb, listId: string): Promise<number> {
  const result = await db.execute({
    sql: "SELECT COALESCE(MAX(position), -1) + 1 AS position FROM items WHERE list_id = ? AND deleted_at IS NULL",
    args: [listId],
  });
  const value = result.rows[0]?.position;
  return typeof value === "number" ? value : Number(value ?? 0);
}

function itemFromRow(row: Record<string, unknown>, memberNames: Map<string, string | null>): ActiveListItem {
  const id = stringColumn(row.id, "id");
  const name = stringColumn(row.name, "name");
  const checkedByUserId = nullableStringColumn(row.checked_by_user_id);
  const checked = row.checked_at !== null && row.checked_at !== undefined;

  return {
    id,
    name,
    checked,
    checkedByMemberName: checked && checkedByUserId ? memberNames.get(checkedByUserId) ?? null : null,
  };
}

function stringColumn(value: unknown, column: string): string {
  if (typeof value !== "string") {
    throw new Error(`Expected ${column} to be a string`);
  }
  return value;
}

function nullableStringColumn(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
