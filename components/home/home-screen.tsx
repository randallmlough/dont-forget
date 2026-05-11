import { Pressable, StyleSheet, Text, View } from "react-native";

import { ActiveList, type ActiveListInitialState } from "@/components/active-list";

export type HomeScreenProps = {
  currentMemberName: string;
  initialList: ActiveListInitialState;
  onSignOut?: () => void;
};

export function HomeScreen({ currentMemberName, initialList, onSignOut }: HomeScreenProps) {
  return (
    <View style={styles.root}>
      <View style={styles.accountBar}>
        <View style={styles.accountTextGroup}>
          <Text style={styles.accountLabel}>Signed in</Text>
          <Text style={styles.accountName} numberOfLines={1}>
            {currentMemberName}
          </Text>
        </View>
        {onSignOut ? (
          <Pressable
            accessibilityRole="button"
            onPress={onSignOut}
            style={({ pressed }) => [
              styles.signOutButton,
              pressed ? styles.signOutButtonPressed : undefined,
            ]}>
            <Text style={styles.signOutLabel}>Sign out</Text>
          </Pressable>
        ) : null}
      </View>

      <ActiveList.Provider initialState={initialList} currentMemberName={currentMemberName}>
        <ActiveList.Screen>
          <ActiveList.Header />
          <ActiveList.Items />
          <ActiveList.AddItemForm />
        </ActiveList.Screen>
      </ActiveList.Provider>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  accountBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#D9E2EC",
  },
  accountTextGroup: {
    flex: 1,
    minWidth: 0,
  },
  accountLabel: {
    color: "#627D98",
    fontSize: 13,
    fontWeight: "600",
  },
  accountName: {
    color: "#102A43",
    fontSize: 17,
    fontWeight: "700",
  },
  signOutButton: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E53E3E",
  },
  signOutButtonPressed: {
    opacity: 0.72,
  },
  signOutLabel: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
});
