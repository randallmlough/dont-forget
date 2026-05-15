import { useAuth, useUser } from "@clerk/clerk-expo";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

import { ActiveList, type ActiveListDataAdapter, type ActiveListInitialState } from "@/components/active-list";
import { reset, track } from "@/lib/analytics";
import { bootstrapWithClerk } from "@/lib/app/bootstrap-client";
import { createRemoteActiveListAdapter } from "@/lib/app/active-list-adapter";

type HomeContentState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      currentMemberName: string;
      initialList: ActiveListInitialState;
      adapter: ActiveListDataAdapter;
    };

export type HomeScreenViewProps = {
  currentMemberName: string;
  content: HomeContentState;
  onRetry?: () => void;
  onSignOut?: () => void;
};

export default function HomeScreen() {
  const { getToken, isLoaded, isSignedIn, signOut } = useAuth();
  const { user } = useUser();
  const [content, setContent] = useState<HomeContentState>({ status: "loading" });
  const [loadAttempt, setLoadAttempt] = useState(0);
  const getTokenRef = useRef(getToken);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    let cancelled = false;
    let handedOffAdapter = false;
    let adapter: ActiveListDataAdapter | null = null;

    async function closeUnclaimedAdapter() {
      if (handedOffAdapter || !adapter) return;

      const current = adapter;
      adapter = null;
      await current.close();
    }

    setContent({ status: "loading" });

    async function loadHome() {
      try {
        const bootstrap = await bootstrapWithClerk(() => getTokenRef.current());
        if (cancelled) return;

        adapter = createRemoteActiveListAdapter({
          household: bootstrap.activeHousehold,
          list: bootstrap.activeList,
          currentUser: bootstrap.user,
          members: bootstrap.members,
          database: bootstrap.householdDatabase,
        });
        const initialList = await adapter.load();

        if (cancelled) {
          await closeUnclaimedAdapter();
          return;
        }

        const currentMemberName = bootstrap.activeMember.displayName ?? bootstrap.user.email ?? "Member";
        handedOffAdapter = true;
        setContent({ status: "ready", currentMemberName, initialList, adapter });
      } catch {
        await closeUnclaimedAdapter().catch(() => undefined);
        if (!cancelled) {
          setContent({
            status: "error",
            message: "Unable to prepare your Household. Please try again.",
          });
        }
      }
    }

    void loadHome();

    return () => {
      cancelled = true;
      void closeUnclaimedAdapter().catch(() => undefined);
    };
  }, [isLoaded, isSignedIn, loadAttempt]);

  const currentMemberName = memberName(content, user);

  const retry = useCallback(() => {
    setLoadAttempt((attempt) => attempt + 1);
  }, []);

  function onSignOut() {
    track("user_signed_out", {});
    reset();
    void signOut();
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

      {content.status === "ready" ? (
        <ActiveList.Provider
          initialState={content.initialList}
          currentMemberName={currentMemberName}
          adapter={content.adapter}
        >
          <ActiveList.Screen>
            <ActiveList.Header />
            <ActiveList.Items />
            <ActiveList.AddItemForm />
          </ActiveList.Screen>
        </ActiveList.Provider>
      ) : content.status === "loading" ? (
        <HomeStatus title="Preparing your Household" body="Loading your durable List data.">
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
    return content.currentMemberName;
  }

  return user?.fullName ?? user?.firstName ?? user?.primaryEmailAddress?.emailAddress ?? "Member";
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
