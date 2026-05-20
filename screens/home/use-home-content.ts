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
	ActiveListDataSource,
	ActiveListInitialState,
} from "@/components/active-list";
import {
	type CachedHouseholdSession,
	discardCachedHouseholdSessionIfUnauthorized,
	getHouseholdSession,
	type HouseholdSession,
	readCachedHouseholdSession,
	saveCachedHouseholdSession,
} from "@/lib/services/household";

import { createHouseholdActiveListDataSource } from "./active-list-data-source";

export type HomeContentState =
	| { status: "loading" }
	| { status: "error"; message: string }
	| {
			status: "ready";
			activeMemberName: string;
			initialList: ActiveListInitialState;
			dataSource: ActiveListDataSource;
	  };

type HomeHouseholdSession = HouseholdSession | CachedHouseholdSession;

type OpenedHome = {
	session: HomeHouseholdSession;
	initialList: ActiveListInitialState;
	dataSource: ActiveListDataSource;
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
	renderedDataSource: ActiveListDataSource | null;
	pendingDataSources: Set<ActiveListDataSource>;
	closedDataSources: Set<ActiveListDataSource>;
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
		renderedDataSource: null,
		pendingDataSources: new Set<ActiveListDataSource>(),
		closedDataSources: new Set<ActiveListDataSource>(),
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
			[...run.pendingDataSources].map((dataSource) =>
				closeDataSource(run, dataSource),
			),
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

		await closeRenderedHomeBeforeFreshOpen(run);
		if (run.cancelled || run.signingOutRef.current) return;

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
	const dataSource = createDataSourceFromSession(session);
	run.pendingDataSources.add(dataSource);

	try {
		const initialList = await dataSource.load();
		if (afterLoad) {
			await afterLoad();
		}

		run.pendingDataSources.delete(dataSource);
		return { session, initialList, dataSource };
	} catch (error) {
		await closeDataSource(run, dataSource).catch(() => undefined);
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
		await closeDataSource(run, opened.dataSource).catch(() => undefined);
		return;
	}

	if (source === "cached") {
		run.cachedRendered = true;
	} else {
		run.freshRendered = true;
	}
	run.renderedDataSource = opened.dataSource;

	run.setContent({
		status: "ready",
		activeMemberName: activeMemberNameFromSession(opened.session),
		initialList: opened.initialList,
		dataSource: opened.dataSource,
	});
}

async function closeRenderedHomeBeforeFreshOpen(run: HomeLoadRun) {
	const renderedDataSource = run.renderedDataSource;
	if (!renderedDataSource) return;

	run.renderedDataSource = null;
	run.cachedRendered = false;
	run.setContent({ status: "loading" });
	await closeDataSource(run, renderedDataSource).catch(() => undefined);
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

async function closeDataSource(
	run: HomeLoadRun,
	dataSource: ActiveListDataSource,
) {
	if (run.closedDataSources.has(dataSource)) return;

	run.closedDataSources.add(dataSource);
	run.pendingDataSources.delete(dataSource);
	await dataSource.close();
}

function createDataSourceFromSession(
	session: HomeHouseholdSession,
): ActiveListDataSource {
	return createHouseholdActiveListDataSource({
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
