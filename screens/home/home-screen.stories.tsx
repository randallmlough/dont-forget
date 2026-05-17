import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { type ActiveListDataAdapter, type ActiveListInitialState } from "@/components/active-list";
import { HomeScreenView } from "@/screens/home/home-screen";

const emptyHomeList: ActiveListInitialState = {
  householdName: "Avery",
  listName: "Groceries",
  items: [],
};

const populatedHomeList: ActiveListInitialState = {
  householdName: "Avery",
  listName: "Groceries",
  items: [
    { id: "item-1", name: "Coffee", checked: false, checkedByMemberName: null },
    { id: "item-2", name: "Eggs", checked: true, checkedByMemberName: "Avery Chen" },
    { id: "item-3", name: "Spinach", checked: false, checkedByMemberName: null },
  ],
};

const meta = {
  title: "Home/HomeScreen",
  component: HomeScreenView,
  parameters: {
    noSafeArea: true,
  },
  decorators: [
    (Story) => (
      <View style={styles.canvas}>
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof HomeScreenView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const EmptyList: Story = {
  args: {
    currentMemberName: "Avery Chen",
    content: readyContent(emptyHomeList),
    onSignOut: noop,
  },
};

export const WithItems: Story = {
  args: {
    currentMemberName: "Avery Chen",
    content: readyContent(populatedHomeList),
    onSignOut: noop,
  },
};

export const Loading: Story = {
  args: {
    currentMemberName: "Avery Chen",
    content: { status: "loading" },
    onSignOut: noop,
  },
};

export const BootstrapError: Story = {
  args: {
    currentMemberName: "Avery Chen",
    content: { status: "error", message: "Unable to prepare your Household. Please try again." },
    onRetry: noop,
    onSignOut: noop,
  },
};

function noop() {}

function readyContent(initialList: ActiveListInitialState) {
  return {
    status: "ready" as const,
    activeMemberName: "Avery Chen",
    initialList,
    adapter: storyAdapter(initialList),
  };
}

function storyAdapter(initialList: ActiveListInitialState): ActiveListDataAdapter {
  let state = initialList;
  let nextItem = initialList.items.length + 1;

  return {
    syncAuthorized: true,
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
    async pull() {
      return { changed: false };
    },
    async sync() {
      return { changed: false };
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
