// Polyfill MUST be imported before PowerSync for watched-query async iterators.
import '@azure/core-asynciterator-polyfill';
import 'react-native-get-random-values';

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { PowerSyncContext, useQuery, useStatus } from '@powersync/react';
import { v4 as uuid } from 'uuid';

import { db, connectAs } from './src/powersync';

// The two seeded users. H1 is shared; the UI shows H1's first List.
const USERS = [
  { id: 'user-a', label: 'Alice (A)' },
  { id: 'user-b', label: 'Bob (B)' },
];

function nowIso() {
  return new Date().toISOString();
}

function ListView({ userId }: { userId: string }) {
  // H1's first List (the shared household). Both A and B receive it.
  const { data: lists } = useQuery<{ id: string; name: string; household_id: string }>(
    `SELECT id, name, household_id FROM lists WHERE household_id = 'h1' ORDER BY created_at LIMIT 1`,
  );
  const list = lists[0];

  // Items of that list (non-deleted) plus this user's check state per item.
  const { data: items } = useQuery<{
    id: string;
    name: string;
    checked: number;
  }>(
    `SELECT i.id AS id, i.name AS name,
            CASE WHEN c.checked_at IS NOT NULL THEN 1 ELSE 0 END AS checked
     FROM items i
     LEFT JOIN item_checks c ON c.item_id = i.id AND c.user_id = ?
     WHERE i.list_id = ? AND i.deleted_at IS NULL
     ORDER BY i.position`,
    [userId, list?.id ?? ''],
  );

  const [text, setText] = useState('');

  async function addItem() {
    if (!text.trim() || !list) return;
    const ts = nowIso();
    await db.execute(
      `INSERT INTO items (id, list_id, name, quantity, position, created_by_user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuid(), list.id, text.trim(), 1, items.length, userId, ts, ts],
    );
    setText('');
  }

  async function toggleCheck(itemId: string, currentlyChecked: boolean) {
    const ts = nowIso();
    // item_checks: upsert by (item_id, user_id). PowerSync rows need an id.
    const existing = await db.getAll<{ id: string }>(
      `SELECT id FROM item_checks WHERE item_id = ? AND user_id = ?`,
      [itemId, userId],
    );
    if (existing.length === 0) {
      await db.execute(
        `INSERT INTO item_checks (id, item_id, user_id, checked_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
        [uuid(), itemId, userId, currentlyChecked ? null : ts, ts],
      );
    } else {
      await db.execute(
        `UPDATE item_checks SET checked_at = ?, updated_at = ? WHERE id = ?`,
        [currentlyChecked ? null : ts, ts, existing[0].id],
      );
    }
  }

  // Q5 conflict affordance (spike-only): long-press renames an item to
  // `<base>-<user>-<HHMMSS>` and stamps a fresh updated_at. Two devices renaming
  // the same item offline then reconnecting exercises LWW-by-updated_at.
  async function renameItem(itemId: string, currentName: string) {
    const ts = nowIso();
    const base = currentName.split('-')[0];
    const stamp = ts.slice(11, 19).replace(/:/g, '');
    const newName = `${base}-${userId.slice(-1)}-${stamp}`;
    await db.execute(`UPDATE items SET name = ?, updated_at = ? WHERE id = ?`, [
      newName,
      ts,
      itemId,
    ]);
  }

  if (!list) {
    return <Text style={styles.dim}>Waiting for list to sync…</Text>;
  }

  return (
    <View style={styles.flex}>
      <Text style={styles.listName}>{list.name}</Text>
      <View style={styles.addRow}>
        <TextInput
          style={styles.input}
          placeholder="Add item…"
          value={text}
          onChangeText={setText}
          onSubmitEditing={addItem}
          returnKeyType="done"
          accessibilityLabel="add-item-input"
        />
        <Pressable style={styles.addBtn} onPress={addItem} accessibilityLabel="add-item-button">
          <Text style={styles.addBtnText}>Add</Text>
        </Pressable>
      </View>
      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        renderItem={({ item }) => {
          const checked = item.checked === 1;
          return (
            <Pressable
              style={styles.itemRow}
              onPress={() => toggleCheck(item.id, checked)}
              onLongPress={() => renameItem(item.id, item.name)}
              accessibilityLabel={`item-${item.name}`}
            >
              <Text style={styles.checkbox}>{checked ? '☑' : '☐'}</Text>
              <Text style={[styles.itemName, checked && styles.itemChecked]}>{item.name}</Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

function SyncBadge() {
  const status = useStatus();
  return (
    <Text style={styles.dim}>
      {status.connected ? 'connected' : 'connecting…'}
      {status.lastSyncedAt ? ` · synced ${status.lastSyncedAt.toLocaleTimeString()}` : ''}
    </Text>
  );
}

export default function App() {
  const [userId, setUserId] = useState<string>('user-a');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    connectAs(userId).then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <PowerSyncContext.Provider value={db}>
      <SafeAreaView style={styles.screen}>
        <Text style={styles.title}>PowerSync spike</Text>
        <View style={styles.switcher}>
          {USERS.map((u) => (
            <Pressable
              key={u.id}
              style={[styles.userBtn, userId === u.id && styles.userBtnActive]}
              onPress={() => setUserId(u.id)}
              accessibilityLabel={`switch-${u.id}`}
            >
              <Text style={[styles.userBtnText, userId === u.id && styles.userBtnTextActive]}>
                {u.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <SyncBadge />
        {ready ? <ListView key={userId} userId={userId} /> : <ActivityIndicator style={styles.flex} />}
      </SafeAreaView>
    </PowerSyncContext.Provider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, backgroundColor: '#fff' },
  flex: { flex: 1 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  switcher: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  userBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#eee' },
  userBtnActive: { backgroundColor: '#2563eb' },
  userBtnText: { color: '#333', fontWeight: '600' },
  userBtnTextActive: { color: '#fff' },
  dim: { color: '#888', marginBottom: 8 },
  listName: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  addRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  input: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  addBtn: { backgroundColor: '#16a34a', borderRadius: 8, paddingHorizontal: 16, justifyContent: 'center' },
  addBtnText: { color: '#fff', fontWeight: '700' },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  checkbox: { fontSize: 20 },
  itemName: { fontSize: 16 },
  itemChecked: { textDecorationLine: 'line-through', color: '#999' },
});
