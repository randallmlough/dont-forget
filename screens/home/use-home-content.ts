import {
	type Dispatch,
	type RefObject,
	type SetStateAction,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

import type {
	ActiveListDataAdapter,
	ActiveListInitialState,
} from "@/components/active-list";
import { createHouseholdActiveListAdapter } from "@/lib/app/active-list-adapter";
import {
	type CachedHouseholdSession,
	discardCachedHouseholdSessionIfUnauthorized,
	getHouseholdSession,
	type HouseholdSession,
	readCachedHouseholdSession,
	saveCachedHouseholdSession,
} from "@/lib/services/household";

export type HomeContentState =
	| { status: "loading" }
	| { status: "error"; message: string }
	| {
			status: "ready";
			activeMemberName: string;
			initialList: ActiveListInitialState;
			adapter: ActiveListDataAdapter;
	  };

type HomeHouseholdSession = HouseholdSession | CachedHouseholdSession;

type OpenedHome = {
	session: HomeHouseholdSession;
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
	const [content, setContent] = useState<HomeContentState>({
		status: "loading",
	});
	const [loadAttempt, setLoadAttempt] = useState(0);
	const getTokenRef = useRef(getToken);

	useEffect(() => {
		getTokenRef.current = getToken;
	}, [getToken]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: loadAttempt intentionally retriggers Home content loading on retry; getToken freshness is owned by getTokenRef.
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

	run.setContent((current) =>
		current.status === "ready" ? current : { status: "loading" },
	);

	const cachedAttempt = loadCachedHome(run);
	if (run.isLoaded && run.isSignedIn) {
		void loadFreshHome(run, cachedAttempt);
	} else if (run.isLoaded) {
		void showErrorIfNoListRendered(run, cachedAttempt);
	}

	return () => {
		run.cancelled = true;
		void Promise.all(
			[...run.pendingAdapters].map((adapter) => closeAdapter(run, adapter)),
		).catch(() => undefined);
	};
}

async function loadCachedHome(run: HomeLoadRun) {
	const cached = await readCachedHouseholdSession().catch(() => null);
	if (!cached || run.cancelled || run.signingOutRef.current) return;

	try {
		const opened = await openHome(run, cached);
		await renderOpenedHome(run, opened, "cached");
	} catch {
		// Cached metadata is best-effort; a fresh Household Session decides the final state.
	}
}

async function loadFreshHome(run: HomeLoadRun, cachedAttempt: Promise<void>) {
	try {
		const session = await getHouseholdSession(() => run.getToken());
		if (run.cancelled || run.signingOutRef.current) return;

		const discarded =
			await discardCachedHouseholdSessionIfUnauthorized(session);
		if (run.cancelled || run.signingOutRef.current) return;

		if (discarded) {
			run.cachedInvalidated = true;
			run.cachedRendered = false;
			run.setContent({ status: "loading" });
		}

		const opened = await openHome(run, session, async () => {
			// Offline reopen is best-effort; online Home should still render if storage rejects.
			await saveCachedHouseholdSession(session).catch(() => undefined);
		});
		await renderOpenedHome(run, opened, "fresh");
	} catch {
		await showErrorIfNoListRendered(run, cachedAttempt);
	}
}

async function openHome(
	run: HomeLoadRun,
	session: HomeHouseholdSession,
	afterLoad?: () => Promise<void>,
): Promise<OpenedHome> {
	const adapter = createAdapterFromSession(session);
	run.pendingAdapters.add(adapter);

	try {
		const initialList = await adapter.load();
		if (afterLoad) {
			await afterLoad();
		}

		run.pendingAdapters.delete(adapter);
		return { session, initialList, adapter };
	} catch (error) {
		await closeAdapter(run, adapter).catch(() => undefined);
		throw error;
	}
}

async function renderOpenedHome(
	run: HomeLoadRun,
	opened: OpenedHome,
	source: "cached" | "fresh",
) {
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
		activeMemberName: activeMemberNameFromSession(opened.session),
		initialList: opened.initialList,
		adapter: opened.adapter,
	});
}

async function showErrorIfNoListRendered(
	run: HomeLoadRun,
	cachedAttempt: Promise<void>,
) {
	await cachedAttempt.catch(() => undefined);
	if (
		!run.cancelled &&
		!run.signingOutRef.current &&
		!run.cachedRendered &&
		!run.freshRendered
	) {
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

function createAdapterFromSession(
	session: HomeHouseholdSession,
): ActiveListDataAdapter {
	return createHouseholdActiveListAdapter({
		household: session.activeHousehold,
		activeMember: session.activeMember,
		list: session.activeList,
		currentUser: session.user,
		members: session.members,
		database: session.householdDatabase,
	});
}

function activeMemberNameFromSession(session: HomeHouseholdSession): string {
	return session.activeMember.displayName ?? session.user.email ?? "Member";
}
