import { PropsWithChildren, createContext, memo, useCallback, useContext, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ListRenderItemInfo,
} from "react-native";

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
  addItem: (name: string) => void;
  toggleItem: (itemId: string) => void;
};

export type ActiveListMeta = {
  currentMemberName: string;
};

type ActiveListContextValue = {
  state: ActiveListState;
  actions: ActiveListActions;
  meta: ActiveListMeta;
};

type ActiveListProviderProps = PropsWithChildren<{
  initialState: ActiveListInitialState;
  currentMemberName: string;
}>;

const ActiveListContext = createContext<ActiveListContextValue | null>(null);

function ActiveListProvider({
  initialState,
  currentMemberName,
  children,
}: ActiveListProviderProps) {
  const [state, setState] = useState<ActiveListState>(initialState);
  const nextItemNumber = useRef(initialState.items.length + 1);

  const addItem = useCallback((rawName: string) => {
    const name = rawName.trim();
    if (!name) return;

    const item: ActiveListItem = {
      id: `local-item-${nextItemNumber.current}`,
      name,
      checked: false,
      checkedByMemberName: null,
    };
    nextItemNumber.current += 1;

    setState((previous) => ({
      ...previous,
      items: [...previous.items, item],
    }));
  }, []);

  const toggleItem = useCallback(
    (itemId: string) => {
      setState((previous) => ({
        ...previous,
        items: previous.items.map((item) => {
          if (item.id !== itemId) return item;
          const checked = !item.checked;
          return {
            ...item,
            checked,
            checkedByMemberName: checked ? currentMemberName : null,
          };
        }),
      }));
    },
    [currentMemberName],
  );

  const actions = useMemo<ActiveListActions>(() => ({ addItem, toggleItem }), [addItem, toggleItem]);
  const meta = useMemo<ActiveListMeta>(() => ({ currentMemberName }), [currentMemberName]);
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
  const { state } = useActiveList();
  const itemCount = state.items.length;
  const checkedCount = state.items.filter((item) => item.checked).length;
  const progressLabel =
    itemCount === 0 ? "No Items yet" : `${checkedCount} of ${itemCount} Items checked`;

  return (
    <View style={styles.header}>
      <Text style={styles.householdName}>{state.householdName}</Text>
      <Text style={styles.listName}>{state.listName}</Text>
      <Text style={styles.progressLabel}>{progressLabel}</Text>
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
    actions.addItem(trimmedName);
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
    actions.toggleItem(item.id);
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    gap: 4,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#D9E2EC",
  },
  householdName: {
    color: "#52606D",
    fontSize: 14,
    fontWeight: "600",
  },
  listName: {
    color: "#102A43",
    fontSize: 30,
    fontWeight: "700",
  },
  progressLabel: {
    color: "#627D98",
    fontSize: 15,
  },
  itemsContent: {
    padding: 20,
  },
  emptyItemsContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  emptyState: {
    alignItems: "center",
    gap: 8,
    padding: 28,
    borderRadius: 8,
    borderCurve: "continuous",
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#D9E2EC",
  },
  emptyTitle: {
    color: "#102A43",
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyBody: {
    color: "#627D98",
    fontSize: 15,
    textAlign: "center",
  },
  itemRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 8,
    borderCurve: "continuous",
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#D9E2EC",
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
    borderColor: "#829AB1",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    borderColor: "#2F855A",
    backgroundColor: "#2F855A",
  },
  checkboxMark: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FFFFFF",
  },
  itemTextGroup: {
    flex: 1,
    minWidth: 0,
  },
  itemName: {
    color: "#102A43",
    fontSize: 17,
    fontWeight: "600",
  },
  itemNameChecked: {
    color: "#627D98",
    textDecorationLine: "line-through",
  },
  itemMeta: {
    color: "#829AB1",
    fontSize: 13,
    marginTop: 2,
  },
  itemSeparator: {
    height: 10,
  },
  addForm: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#D9E2EC",
  },
  input: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "#BCCCDC",
    paddingHorizontal: 14,
    color: "#102A43",
    fontSize: 16,
    backgroundColor: "#FFFFFF",
  },
  addButton: {
    minWidth: 72,
    height: 48,
    borderRadius: 8,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2F855A",
  },
  addButtonDisabled: {
    backgroundColor: "#9FB3C8",
  },
  addButtonPressed: {
    opacity: 0.72,
  },
  addButtonLabel: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
});
