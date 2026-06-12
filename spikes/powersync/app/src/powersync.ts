import { PowerSyncDatabase } from '@powersync/react-native';
import { AppSchema } from './schema';
import { SpikeConnector } from './connector';

export const db = new PowerSyncDatabase({
  schema: AppSchema,
  database: { dbFilename: 'spike.db' },
});

let currentConnector: SpikeConnector | null = null;

// Switch the acting user (A/B). Disconnect + clear local data, then reconnect
// as the new user so the synced row set reflects that user's memberships.
export async function connectAs(userId: string) {
  if (currentConnector) {
    await db.disconnectAndClear();
  }
  currentConnector = new SpikeConnector(userId);
  await db.connect(currentConnector);
}
