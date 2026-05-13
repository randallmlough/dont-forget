import { useAuth, useUser } from "@clerk/clerk-expo";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

import { ActiveList, type ActiveListInitialState } from "@/components/active-list";
import { reset, track } from "@/lib/analytics";

export type HomeScreenViewProps = {
  currentMemberName: string;
  initialList: ActiveListInitialState;
  onSignOut?: () => void;
};

export default function HomeScreen() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const currentMemberName =
    user?.fullName ?? user?.firstName ?? user?.primaryEmailAddress?.emailAddress ?? "Member";
  const householdName = user?.firstName ?? "Untitled";

  const initialList = useMemo<ActiveListInitialState>(
    () => ({
      householdName,
      listName: "Groceries",
      items: [],
    }),
    [householdName],
  );

  function onSignOut() {
    track("user_signed_out", {});
    reset();
    void signOut();
  }

  return (
    <HomeScreenView
      currentMemberName={currentMemberName}
      initialList={initialList}
      onSignOut={onSignOut}
    />
  );
}

export function HomeScreenView({ currentMemberName, initialList, onSignOut }: HomeScreenViewProps) {
  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.root}>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  accountBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing(3),
    paddingHorizontal: theme.spacing(5),
    paddingTop: theme.spacing(4.5),
    paddingBottom: theme.spacing(3),
    backgroundColor: theme.colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  accountTextGroup: {
    flex: 1,
    minWidth: 0,
  },
  accountLabel: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  accountName: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: "700",
  },
  signOutButton: {
    minHeight: 40,
    paddingHorizontal: theme.spacing(3.5),
    borderRadius: theme.radii.control,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.destructive,
  },
  signOutButtonPressed: {
    opacity: 0.72,
  },
  signOutLabel: {
    color: theme.colors.inverseText,
    fontSize: 15,
    fontWeight: "700",
  },
}));
