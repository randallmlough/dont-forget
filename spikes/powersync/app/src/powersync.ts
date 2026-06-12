import { PowerSyncDatabase } from '@powersync/react-native';
import { OPSqliteOpenFactory } from '@powersync/op-sqlite';
import { AppSchema } from './schema';
import { SpikeConnector } from './connector';

// Explicit op-sqlite open factory. Using the explicit factory (vs the SDK's
// implicit quick-sqlite require) sidesteps the Metro dynamic-require resolution
// problem — op-sqlite is imported statically so Metro always bundles it.
const factory = new OPSqliteOpenFactory({ dbFilename: 'spike.db' });

export const db = new PowerSyncDatabase({
  schema: AppSchema,
  database: factory,
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
