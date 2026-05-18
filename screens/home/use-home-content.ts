import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";

import { type ActiveListDataAdapter, type ActiveListInitialState } from "@/components/active-list";
import { createHouseholdActiveListAdapter } from "@/lib/app/active-list-adapter";
import { bootstrapWithClerk } from "@/lib/app/bootstrap-client";
import {
  discardCachedBootstrapMetadataIfUnauthorized,
  readCachedBootstrapMetadata,
  saveCachedBootstrapMetadata,
  type CachedBootstrapMetadata,
} from "@/lib/app/offline-bootstrap-cache";
import type { BootstrapResponse } from "@/lib/bootstrap";

export type HomeContentState =
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

type UseHomeContentOptions = {
  getToken: () => Promise<string | null>;
  isLoaded: boolean;
  isSignedIn: boolean;
  signingOutRef: RefObject<boolean>;
};

type HomeLoadRun = {
  getToken: () => Promise<string | null>;
  isLoaded: boolean;
  isSignedIn: boolean;
  signingOutRef: RefObject<boolean>;
  setContent: Dispatch<SetStateAction<HomeContentState>>;
  cancelled: boolean;
  cachedRendered: boolean;
  cachedInvalidated: boolean;
  freshRendered: boolean;
  pendingAdapters: Set<ActiveListDataAdapter>;
  closedAdapters: Set<ActiveListDataAdapter>;
};

type HomeLoadOptions = Pick<
  HomeLoadRun,
  "getToken" | "isLoaded" | "isSignedIn" | "signingOutRef" | "setContent"
>;

export function useHomeContent({
  getToken,
  isLoaded,
  isSignedIn,
  signingOutRef,
}: UseHomeContentOptions): { content: HomeContentState; retry: () => void } {
  const [content, setContent] = useState<HomeContentState>({ status: "loading" });
  const [loadAttempt, setLoadAttempt] = useState(0);
  const getTokenRef = useRef(getToken);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    return startHomeLoad({
      getToken: () => getTokenRef.current(),
      isLoaded,
      isSignedIn,
      setContent,
      signingOutRef,
    });
  }, [isLoaded, isSignedIn, loadAttempt, signingOutRef]);

  const retry = useCallback(() => {
    setLoadAttempt((attempt) => attempt + 1);
  }, []);

  return { content, retry };
}

function startHomeLoad(options: HomeLoadOptions): () => void {
  const run: HomeLoadRun = {
    ...options,
    cancelled: false,
    cachedRendered: false,
    cachedInvalidated: false,
    freshRendered: false,
    pendingAdapters: new Set<ActiveListDataAdapter>(),
    closedAdapters: new Set<ActiveListDataAdapter>(),
  };

  run.setContent((current) => (current.status === "ready" ? current : { status: "loading" }));

  const cachedAttempt = loadCachedHome(run);
  if (run.isLoaded && run.isSignedIn) {
    void loadFreshHome(run, cachedAttempt);
  } else if (run.isLoaded) {
    void showErrorIfNoListRendered(run, cachedAttempt);
  }

  return () => {
    run.cancelled = true;
    void Promise.all([...run.pendingAdapters].map((adapter) => closeAdapter(run, adapter))).catch(
      () => undefined,
    );
  };
}

async function loadCachedHome(run: HomeLoadRun) {
  const cached = await readCachedBootstrapMetadata().catch(() => null);
  if (!cached || run.cancelled || run.signingOutRef.current) return;

  try {
    const opened = await openHome(run, cached);
    await renderOpenedHome(run, opened, "cached");
  } catch {
    // Cached metadata is best-effort; fresh bootstrap decides the final state.
  }
}

async function loadFreshHome(run: HomeLoadRun, cachedAttempt: Promise<void>) {
  try {
    const bootstrap = await bootstrapWithClerk(() => run.getToken());
    if (run.cancelled || run.signingOutRef.current) return;

    const discarded = await discardCachedBootstrapMetadataIfUnauthorized(bootstrap);
    if (run.cancelled || run.signingOutRef.current) return;

    if (discarded) {
      run.cachedInvalidated = true;
      run.cachedRendered = false;
      run.setContent({ status: "loading" });
    }

    const opened = await openHome(run, bootstrap, async () => {
      // Offline reopen is best-effort; online Home should still render if storage rejects.
      await saveCachedBootstrapMetadata(bootstrap).catch(() => undefined);
    });
    await renderOpenedHome(run, opened, "fresh");
  } catch {
    await showErrorIfNoListRendered(run, cachedAttempt);
  }
}

async function openHome(
  run: HomeLoadRun,
  bootstrap: HomeBootstrap,
  afterLoad?: () => Promise<void>,
): Promise<OpenedHome> {
  const adapter = createAdapterFromBootstrap(bootstrap);
  run.pendingAdapters.add(adapter);

  try {
    const initialList = await adapter.load();
    if (afterLoad) {
      await afterLoad();
    }

    run.pendingAdapters.delete(adapter);
    return { bootstrap, initialList, adapter };
  } catch (error) {
    await closeAdapter(run, adapter).catch(() => undefined);
    throw error;
  }
}

async function renderOpenedHome(run: HomeLoadRun, opened: OpenedHome, source: "cached" | "fresh") {
  if (
    run.cancelled ||
    run.signingOutRef.current ||
    (source === "cached" && (run.freshRendered || run.cachedInvalidated))
  ) {
    await closeAdapter(run, opened.adapter).catch(() => undefined);
    return;
  }

  if (source === "cached") {
    run.cachedRendered = true;
  } else {
    run.freshRendered = true;
  }

  run.setContent({
    status: "ready",
    activeMemberName: activeMemberNameFromBootstrap(opened.bootstrap),
    initialList: opened.initialList,
    adapter: opened.adapter,
  });
}

async function showErrorIfNoListRendered(run: HomeLoadRun, cachedAttempt: Promise<void>) {
  await cachedAttempt.catch(() => undefined);
  if (!run.cancelled && !run.signingOutRef.current && !run.cachedRendered && !run.freshRendered) {
    run.setContent({
      status: "error",
      message: "Unable to prepare your Household. Please try again.",
    });
  }
}

async function closeAdapter(run: HomeLoadRun, adapter: ActiveListDataAdapter) {
  if (run.closedAdapters.has(adapter)) return;

  run.closedAdapters.add(adapter);
  run.pendingAdapters.delete(adapter);
  await adapter.close();
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
