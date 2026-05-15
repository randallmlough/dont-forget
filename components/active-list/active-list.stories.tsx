import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { ActiveList, type ActiveListDataAdapter, type ActiveListInitialState } from "@/components/active-list";

const emptyList: ActiveListInitialState = {
  householdName: "Avery",
  listName: "Groceries",
  items: [],
};

const populatedList: ActiveListInitialState = {
  householdName: "Avery",
  listName: "Groceries",
  items: [
    { id: "item-1", name: "Milk", checked: false, checkedByMemberName: null },
    { id: "item-2", name: "Apples", checked: true, checkedByMemberName: "Avery Chen" },
    { id: "item-3", name: "Paper towels", checked: false, checkedByMemberName: null },
  ],
};

const meta = {
  title: "Active List",
  component: ActiveList.Screen,
} satisfies Meta<typeof ActiveList.Screen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  render: () => <ActiveListStory initialState={emptyList} />,
};

export const WithItems: Story = {
  render: () => <ActiveListStory initialState={populatedList} />,
};

function ActiveListStory({ initialState }: { initialState: ActiveListInitialState }) {
  return (
    <View style={styles.canvas}>
      <ActiveList.Provider
        initialState={initialState}
        currentMemberName="Avery Chen"
        adapter={storyAdapter(initialState)}>
        <ActiveList.Screen>
          <ActiveList.Header />
          <ActiveList.Items />
          <ActiveList.AddItemForm />
        </ActiveList.Screen>
      </ActiveList.Provider>
    </View>
  );
}

function storyAdapter(initialState: ActiveListInitialState): ActiveListDataAdapter {
  let state = initialState;
  let nextItem = initialState.items.length + 1;

  return {
    async load() {
      return state;
    },
    async addItem(name) {
      const item = { id: `story-item-${nextItem}`, name, checked: false, checkedByMemberName: null };
      nextItem += 1;
      state = { ...state, items: [...state.items, item] };
      return item;
    },
    async setItemChecked(itemId, checked) {
      state = {
        ...state,
        items: state.items.map((item) =>
          item.id === itemId
            ? { ...item, checked, checkedByMemberName: checked ? "Avery Chen" : null }
            : item,
        ),
      };
    },
    async close() {},
  };
}

const styles = StyleSheet.create((theme) => ({
  canvas: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
}));
