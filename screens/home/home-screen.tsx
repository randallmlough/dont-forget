import { useAuth, useUser } from "@clerk/clerk-expo";
import { useRef, type ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

import { ActiveList } from "@/components/active-list";
import { reset, track } from "@/lib/analytics";
import { clearCachedHouseholdSession } from "@/lib/app/offline-bootstrap-cache";
import { useHomeContent, type HomeContentState } from "@/screens/home/use-home-content";

export type HomeScreenViewProps = {
  currentMemberName: string;
  content: HomeContentState;
  onRetry?: () => void;
  onSignOut?: () => void;
};

export default function HomeScreen() {
  const { getToken, isLoaded, isSignedIn, signOut } = useAuth();
  const { user } = useUser();
  const signingOutRef = useRef(false);
  const { content, retry } = useHomeContent({
    getToken,
    isLoaded,
    isSignedIn: Boolean(isSignedIn),
    signingOutRef,
  });

  const currentMemberName = memberName(content, user);

  async function onSignOut() {
    if (signingOutRef.current) return;
    signingOutRef.current = true;

    track("user_signed_out", {});
    reset();
    if (content.status === "ready") {
      await content.adapter.close();
    }
    await clearCachedHouseholdSession();
    await signOut();
  }

  return (
    <HomeScreenView
      currentMemberName={currentMemberName}
      content={content}
      onRetry={retry}
      onSignOut={onSignOut}
    />
  );
}

export function HomeScreenView({ currentMemberName, content, onRetry, onSignOut }: HomeScreenViewProps) {
  const displayMemberName = content.status === "ready" ? content.activeMemberName : currentMemberName;

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.root}>
      <View style={styles.memberBar}>
        <View style={styles.memberTextGroup}>
          <Text style={styles.memberLabel}>Signed in</Text>
          <Text style={styles.memberName} numberOfLines={1}>
            {displayMemberName}
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

      {content.status === "ready" ? (
        <ActiveList.Provider
          initialState={content.initialList}
          currentMemberName={displayMemberName}
          adapter={content.adapter}
        >
          <ActiveList.Screen>
            <ActiveList.Header />
            <ActiveList.Items />
            <ActiveList.AddItemForm />
          </ActiveList.Screen>
        </ActiveList.Provider>
      ) : content.status === "loading" ? (
        <HomeStatus title="Preparing your Household" body="Loading your Household List.">
          <ActivityIndicator />
        </HomeStatus>
      ) : (
        <HomeStatus title="Household unavailable" body={content.message}>
          {onRetry ? (
            <Pressable
              accessibilityRole="button"
              onPress={onRetry}
              style={({ pressed }) => [styles.retryButton, pressed ? styles.retryButtonPressed : undefined]}>
              <Text style={styles.retryButtonLabel}>Try again</Text>
            </Pressable>
          ) : null}
        </HomeStatus>
      )}
    </SafeAreaView>
  );
}

function HomeStatus({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  return (
    <View style={styles.statusRoot}>
      <View style={styles.statusCard}>
        <Text style={styles.statusTitle}>{title}</Text>
        <Text style={styles.statusBody}>{body}</Text>
        {children}
      </View>
    </View>
  );
}

function memberName(content: HomeContentState, user: ReturnType<typeof useUser>["user"]): string {
  if (content.status === "ready") {
    return content.activeMemberName;
  }

  return user?.fullName ?? user?.firstName ?? user?.primaryEmailAddress?.emailAddress ?? "Member";
}

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  memberBar: {
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
  memberTextGroup: {
    flex: 1,
    minWidth: 0,
  },
  memberLabel: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  memberName: {
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
  statusRoot: {
    flex: 1,
    justifyContent: "center",
    padding: theme.spacing(5),
    backgroundColor: theme.colors.background,
  },
  statusCard: {
    alignItems: "center",
    gap: theme.spacing(3),
    padding: theme.spacing(7),
    borderRadius: theme.radii.card,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  statusTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  statusBody: {
    color: theme.colors.textMuted,
    fontSize: 15,
    textAlign: "center",
  },
  retryButton: {
    minHeight: 44,
    paddingHorizontal: theme.spacing(4),
    borderRadius: theme.radii.control,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
  },
  retryButtonPressed: {
    opacity: 0.72,
  },
  retryButtonLabel: {
    color: theme.colors.inverseText,
    fontSize: 16,
    fontWeight: "700",
  },
}));
