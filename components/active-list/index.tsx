import {
  PropsWithChildren,
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
  type ListRenderItemInfo,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";

export type ActiveListItem = {
  id: string;
  name: string;
  checked: boolean;
  checkedByMemberName?: string | null;
};

export type ActiveListState = {
  householdName: string;
  listName: string;
  items: ActiveListItem[];
};

export type ActiveListInitialState = ActiveListState;

export type ActiveListActions = {
  addItem: (name: string) => Promise<void>;
  toggleItem: (itemId: string) => Promise<void>;
  refresh: () => Promise<void>;
};

export type ActiveListMeta = {
  currentMemberName: string;
  errorMessage: string | null;
  isRefreshing: boolean;
};

export type ActiveListDataAdapter = {
  load: () => Promise<ActiveListInitialState>;
  addItem: (name: string) => Promise<ActiveListItem>;
  setItemChecked: (itemId: string, checked: boolean) => Promise<void>;
  close: () => Promise<void>;
};

type ActiveListContextValue = {
  state: ActiveListState;
  actions: ActiveListActions;
  meta: ActiveListMeta;
};

type ActiveListProviderProps = PropsWithChildren<{
  initialState: ActiveListInitialState;
  currentMemberName: string;
  adapter: ActiveListDataAdapter;
}>;

const ActiveListContext = createContext<ActiveListContextValue | null>(null);

function ActiveListProvider({
  initialState,
  currentMemberName,
  adapter,
  children,
}: ActiveListProviderProps) {
  const [state, setState] = useState<ActiveListState>(initialState);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const nextItemNumber = useRef(initialState.items.length + 1);

  useEffect(() => {
    return () => {
      void adapter.close();
    };
  }, [adapter]);

  const loadFromAdapter = useCallback(async () => {
    const nextState = await adapter.load();
    setState(nextState);
  }, [adapter]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    setErrorMessage(null);

    try {
      await loadFromAdapter();
    } catch {
      setErrorMessage("Unable to refresh this List. Please try again.");
    } finally {
      setIsRefreshing(false);
    }
  }, [loadFromAdapter]);

  const addItem = useCallback(async (rawName: string) => {
    const name = rawName.trim();
    if (!name) return;

    const item: ActiveListItem = {
      id: `pending-item-${nextItemNumber.current}`,
      name,
      checked: false,
      checkedByMemberName: null,
    };
    nextItemNumber.current += 1;

    setState((previous) => ({
      ...previous,
      items: [...previous.items, item],
    }));

    try {
      const persistedItem = await adapter.addItem(name);
      setState((previous) => ({
        ...previous,
        items: previous.items.map((existing) => (existing.id === item.id ? persistedItem : existing)),
      }));
      setErrorMessage(null);
    } catch {
      setErrorMessage("Unable to save that Item. The List was refreshed from the database.");
      await loadFromAdapter().catch(() => undefined);
    }
  }, [adapter, loadFromAdapter]);

  const toggleItem = useCallback(async (itemId: string) => {
    const target = state.items.find((item) => item.id === itemId);
    if (!target) return;

    const checked = !target.checked;
    setState((previous) => ({
      ...previous,
      items: previous.items.map((item) => {
        if (item.id !== itemId) return item;
        return {
          ...item,
          checked,
          checkedByMemberName: checked ? currentMemberName : null,
        };
      }),
    }));

    try {
      await adapter.setItemChecked(itemId, checked);
      setErrorMessage(null);
    } catch {
      setErrorMessage("Unable to save that change. The List was refreshed from the database.");
      await loadFromAdapter().catch(() => undefined);
    }
  }, [adapter, currentMemberName, loadFromAdapter, state.items]);

  const actions = useMemo<ActiveListActions>(
    () => ({ addItem, refresh, toggleItem }),
    [addItem, refresh, toggleItem],
  );
  const meta = useMemo<ActiveListMeta>(
    () => ({ currentMemberName, errorMessage, isRefreshing }),
    [currentMemberName, errorMessage, isRefreshing],
  );
  const value = useMemo<ActiveListContextValue>(
    () => ({ state, actions, meta }),
    [actions, meta, state],
  );

  return <ActiveListContext.Provider value={value}>{children}</ActiveListContext.Provider>;
}

export function useActiveList() {
  const value = useContext(ActiveListContext);
  if (!value) {
    throw new Error("useActiveList must be used inside ActiveList.Provider");
  }
  return value;
}

function ActiveListScreen({ children }: PropsWithChildren) {
  return <View style={styles.screen}>{children}</View>;
}

function ActiveListHeader() {
  const { actions, meta, state } = useActiveList();
  const itemCount = state.items.length;
  const checkedCount = state.items.filter((item) => item.checked).length;
  const progressLabel =
    itemCount === 0 ? "No Items yet" : `${checkedCount} of ${itemCount} Items checked`;

  return (
    <View style={styles.header}>
      <View style={styles.headerTopRow}>
        <Text style={styles.householdName}>{state.householdName}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void actions.refresh()}
          style={({ pressed }) => [styles.refreshButton, pressed ? styles.refreshButtonPressed : undefined]}>
          <Text style={styles.refreshButtonLabel}>{meta.isRefreshing ? "Refreshing" : "Refresh"}</Text>
        </Pressable>
      </View>
      <Text style={styles.listName}>{state.listName}</Text>
      <Text style={styles.progressLabel}>{progressLabel}</Text>
      {meta.errorMessage ? <Text style={styles.errorMessage}>{meta.errorMessage}</Text> : null}
    </View>
  );
}

function ActiveListItems() {
  const { state } = useActiveList();

  return (
    <FlatList
      data={state.items}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      ItemSeparatorComponent={ItemSeparator}
      ListEmptyComponent={EmptyList}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        styles.itemsContent,
        state.items.length === 0 ? styles.emptyItemsContent : undefined,
      ]}
    />
  );
}

function ActiveListAddItemForm() {
  const { actions } = useActiveList();
  const [name, setName] = useState("");
  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0;

  const submit = useCallback(() => {
    if (!canSubmit) return;
    void actions.addItem(trimmedName);
    setName("");
  }, [actions, canSubmit, trimmedName]);

  return (
    <View style={styles.addForm}>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Add an Item"
        returnKeyType="done"
        onSubmitEditing={submit}
        style={styles.input}
      />
      <Pressable
        accessibilityRole="button"
        disabled={!canSubmit}
        onPress={submit}
        style={({ pressed }) => [
          styles.addButton,
          !canSubmit ? styles.addButtonDisabled : undefined,
          pressed && canSubmit ? styles.addButtonPressed : undefined,
        ]}>
        <Text style={styles.addButtonLabel}>Add</Text>
      </Pressable>
    </View>
  );
}

const ItemRow = memo(function ItemRow({ item }: { item: ActiveListItem }) {
  const { actions } = useActiveList();

  const toggle = useCallback(() => {
    void actions.toggleItem(item.id);
  }, [actions, item.id]);

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: item.checked }}
      onPress={toggle}
      style={({ pressed }) => [styles.itemRow, pressed ? styles.itemRowPressed : undefined]}>
      <View style={[styles.checkbox, item.checked ? styles.checkboxChecked : undefined]}>
        {item.checked ? <View style={styles.checkboxMark} /> : null}
      </View>
      <View style={styles.itemTextGroup}>
        <Text style={[styles.itemName, item.checked ? styles.itemNameChecked : undefined]}>
          {item.name}
        </Text>
        {item.checkedByMemberName ? (
          <Text style={styles.itemMeta}>Checked by {item.checkedByMemberName}</Text>
        ) : null}
      </View>
    </Pressable>
  );
});

function EmptyList() {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>This List is empty.</Text>
      <Text style={styles.emptyBody}>Add the first Item for your Household.</Text>
    </View>
  );
}

function ItemSeparator() {
  return <View style={styles.itemSeparator} />;
}

function keyExtractor(item: ActiveListItem) {
  return item.id;
}

function renderItem({ item }: ListRenderItemInfo<ActiveListItem>) {
  return <ItemRow item={item} />;
}

export const ActiveList = {
  Provider: ActiveListProvider,
  Screen: ActiveListScreen,
  Header: ActiveListHeader,
  Items: ActiveListItems,
  AddItemForm: ActiveListAddItemForm,
};

const styles = StyleSheet.create((theme) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    paddingHorizontal: theme.spacing(5),
    paddingTop: theme.spacing(5),
    paddingBottom: theme.spacing(4),
    gap: theme.spacing(1),
    backgroundColor: theme.colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing(3),
  },
  householdName: {
    flex: 1,
    color: theme.colors.textMuted,
    fontSize: 14,
    fontWeight: "600",
  },
  refreshButton: {
    minHeight: 32,
    paddingHorizontal: theme.spacing(2.5),
    borderRadius: theme.radii.control,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  refreshButtonPressed: {
    opacity: 0.72,
  },
  refreshButtonLabel: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  listName: {
    color: theme.colors.text,
    fontSize: 30,
    fontWeight: "700",
  },
  progressLabel: {
    color: theme.colors.textMuted,
    fontSize: 15,
  },
  errorMessage: {
    marginTop: theme.spacing(2),
    color: theme.colors.destructive,
    fontSize: 14,
    fontWeight: "600",
  },
  itemsContent: {
    padding: theme.spacing(5),
  },
  emptyItemsContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  emptyState: {
    alignItems: "center",
    gap: theme.spacing(2),
    padding: theme.spacing(7),
    borderRadius: theme.radii.card,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyBody: {
    color: theme.colors.textMuted,
    fontSize: 15,
    textAlign: "center",
  },
  itemRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing(3),
    padding: theme.spacing(3.5),
    borderRadius: theme.radii.card,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  itemRowPressed: {
    opacity: 0.72,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderCurve: "continuous",
    borderWidth: 2,
    borderColor: theme.colors.textSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary,
  },
  checkboxMark: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.inverseText,
  },
  itemTextGroup: {
    flex: 1,
    minWidth: 0,
  },
  itemName: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: "600",
  },
  itemNameChecked: {
    color: theme.colors.textMuted,
    textDecorationLine: "line-through",
  },
  itemMeta: {
    color: theme.colors.textSubtle,
    fontSize: 13,
    marginTop: theme.spacing(0.5),
  },
  itemSeparator: {
    height: theme.spacing(2.5),
  },
  addForm: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing(2.5),
    padding: theme.spacing(4),
    backgroundColor: theme.colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  input: {
    flex: 1,
    minHeight: 48,
    borderRadius: theme.radii.control,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    paddingHorizontal: theme.spacing(3.5),
    color: theme.colors.text,
    fontSize: 16,
    backgroundColor: theme.colors.surface,
  },
  addButton: {
    minWidth: 72,
    height: 48,
    borderRadius: theme.radii.control,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
  },
  addButtonDisabled: {
    backgroundColor: theme.colors.primaryDisabled,
  },
  addButtonPressed: {
    opacity: 0.72,
  },
  addButtonLabel: {
    color: theme.colors.inverseText,
    fontSize: 16,
    fontWeight: "700",
  },
}));
