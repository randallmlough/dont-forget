import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { type ActiveListInitialState } from "@/components/active-list";
import { HomeScreen } from "@/components/home/home-screen";

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
  component: HomeScreen,
  decorators: [
    (Story) => (
      <View style={styles.canvas}>
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof HomeScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const EmptyList: Story = {
  args: {
    currentMemberName: "Avery Chen",
    initialList: emptyHomeList,
    onSignOut: noop,
  },
};

export const WithItems: Story = {
  args: {
    currentMemberName: "Avery Chen",
    initialList: populatedHomeList,
    onSignOut: noop,
  },
};

function noop() {}

const styles = StyleSheet.create((theme) => ({
  canvas: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
}));
