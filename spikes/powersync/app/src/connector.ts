// PowerSync backend connector: tells the SDK where to sync from
// (fetchCredentials) and how to push local writes (uploadData).
import {
  AbstractPowerSyncDatabase,
  PowerSyncBackendConnector,
  UpdateType,
} from '@powersync/react-native';

// iOS simulator reaches the host machine via localhost.
const POWERSYNC_URL = 'http://localhost:8089';
const BACKEND_URL = 'http://localhost:6068';

export class SpikeConnector implements PowerSyncBackendConnector {
  // The hardcoded user this client is acting as (A or B). Set by the UI.
  constructor(private userId: string) {}

  async fetchCredentials() {
    const res = await fetch(`${BACKEND_URL}/api/auth/token?user_id=${this.userId}`);
    if (!res.ok) {
      throw new Error(`token fetch failed: ${res.status} ${await res.text()}`);
    }
    const { token } = await res.json();
    return { endpoint: POWERSYNC_URL, token };
  }

  // Push the local write queue to the Node endpoint, which applies CRUD to
  // Postgres with LWW + membership authorization.
  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const tx = await database.getNextCrudTransaction();
    if (!tx) return;

    const token = (await this.fetchCredentials()).token;
    const batch = tx.crud.map((op) => ({
      op: op.op === UpdateType.PUT ? 'PUT' : op.op === UpdateType.PATCH ? 'PATCH' : 'DELETE',
      table: op.table,
      id: op.id,
      data: op.opData ?? {},
    }));

    const res = await fetch(`${BACKEND_URL}/api/data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ batch }),
    });
    if (!res.ok) {
      // Throwing keeps the transaction queued for retry.
      throw new Error(`upload failed: ${res.status} ${await res.text()}`);
    }
    await tx.complete();
  }
}
