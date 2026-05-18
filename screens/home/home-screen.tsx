import { useAuth, useUser } from "@clerk/clerk-expo";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

import { ActiveList, type ActiveListDataAdapter, type ActiveListInitialState } from "@/components/active-list";
import { reset, track } from "@/lib/analytics";
import { bootstrapWithClerk } from "@/lib/app/bootstrap-client";
import { createHouseholdActiveListAdapter } from "@/lib/app/active-list-adapter";
import {
  clearCachedHouseholdSession,
  discardCachedBootstrapMetadataIfUnauthorized,
  readCachedBootstrapMetadata,
  saveCachedBootstrapMetadata,
  type CachedBootstrapMetadata,
} from "@/lib/app/offline-bootstrap-cache";
import type { BootstrapResponse } from "@/lib/bootstrap";

type HomeContentState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      activeMemberName: string;
      initialList: ActiveListInitialState;
      adapter: ActiveListDataAdapter;
    };

type HomeBootstrap = BootstrapResponse | CachedBootstrapMetadata;

type OpenedHome = {
  bootstrap: HomeBootstrap;
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
  const signingOutRef = useRef(false);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    let cancelled = false;
    let cachedRendered = false;
    let cachedInvalidated = false;
    let freshRendered = false;
    const pendingAdapters = new Set<ActiveListDataAdapter>();
    const closedAdapters = new Set<ActiveListDataAdapter>();

    setContent((current) => (current.status === "ready" ? current : { status: "loading" }));

    async function closeAdapter(adapter: ActiveListDataAdapter) {
      if (closedAdapters.has(adapter)) return;

      closedAdapters.add(adapter);
      pendingAdapters.delete(adapter);
      await adapter.close();
    }

    async function openHome(bootstrap: HomeBootstrap, afterLoad?: () => Promise<void>): Promise<OpenedHome> {
      const adapter = createAdapterFromBootstrap(bootstrap);
      pendingAdapters.add(adapter);

      try {
        const initialList = await adapter.load();
        if (afterLoad) {
          await afterLoad();
        }

        pendingAdapters.delete(adapter);
        return { bootstrap, initialList, adapter };
      } catch (error) {
        await closeAdapter(adapter).catch(() => undefined);
        throw error;
      }
    }

    async function renderOpenedHome(opened: OpenedHome, source: "cached" | "fresh") {
      if (cancelled || signingOutRef.current || (source === "cached" && (freshRendered || cachedInvalidated))) {
        await closeAdapter(opened.adapter).catch(() => undefined);
        return;
      }

      if (source === "cached") {
        cachedRendered = true;
      } else {
        freshRendered = true;
      }

      setContent({
        status: "ready",
        activeMemberName: activeMemberNameFromBootstrap(opened.bootstrap),
        initialList: opened.initialList,
        adapter: opened.adapter,
      });
    }

    async function showErrorIfNoListRendered(cachedAttempt: Promise<void>) {
      await cachedAttempt.catch(() => undefined);
      if (!cancelled && !signingOutRef.current && !cachedRendered && !freshRendered) {
        setContent({
          status: "error",
          message: "Unable to prepare your Household. Please try again.",
        });
      }
    }

    async function loadCachedHome() {
      const cached = await readCachedBootstrapMetadata().catch(() => null);
      if (!cached || cancelled || signingOutRef.current) return;

      try {
        const opened = await openHome(cached);
        await renderOpenedHome(opened, "cached");
      } catch {
        // Cached metadata is best-effort; fresh bootstrap decides the final state.
      }
    }

    async function loadFreshHome(cachedAttempt: Promise<void>) {
      try {
        const bootstrap = await bootstrapWithClerk(() => getTokenRef.current());
        if (cancelled || signingOutRef.current) return;

        const discarded = await discardCachedBootstrapMetadataIfUnauthorized(bootstrap);
        if (cancelled || signingOutRef.current) return;

        if (discarded) {
          cachedInvalidated = true;
          cachedRendered = false;
          setContent({ status: "loading" });
        }

        const opened = await openHome(bootstrap, async () => {
          // Offline reopen is best-effort; online Home should still render if storage rejects.
          await saveCachedBootstrapMetadata(bootstrap).catch(() => undefined);
        });
        await renderOpenedHome(opened, "fresh");
      } catch {
        await showErrorIfNoListRendered(cachedAttempt);
      }
    }

    const cachedAttempt = loadCachedHome();
    if (isLoaded && isSignedIn) {
      void loadFreshHome(cachedAttempt);
    } else if (isLoaded) {
      void showErrorIfNoListRendered(cachedAttempt);
    }

    return () => {
      cancelled = true;
      void Promise.all([...pendingAdapters].map((adapter) => closeAdapter(adapter))).catch(() => undefined);
    };
  }, [isLoaded, isSignedIn, loadAttempt]);

  const currentMemberName = memberName(content, user);

  const retry = useCallback(() => {
    setLoadAttempt((attempt) => attempt + 1);
  }, []);

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

function createAdapterFromBootstrap(bootstrap: HomeBootstrap): ActiveListDataAdapter {
  return createHouseholdActiveListAdapter({
    household: bootstrap.activeHousehold,
    activeMember: bootstrap.activeMember,
    list: bootstrap.activeList,
    currentUser: bootstrap.user,
    members: bootstrap.members,
    database: bootstrap.householdDatabase,
  });
}

function activeMemberNameFromBootstrap(bootstrap: HomeBootstrap): string {
  return bootstrap.activeMember.displayName ?? bootstrap.user.email ?? "Member";
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
