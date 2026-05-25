import {
	type Dispatch,
	type MutableRefObject,
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
	ActiveListSyncCoordinator,
} from "@/components/active-list";
import { type Logger, useLogger } from "@/lib/logger";
import {
	type CachedHouseholdSession,
	clearUnauthorizedCachedHouseholdSessionMetadata,
	createHouseholdCurrentListDataSource,
	deleteCachedHouseholdSessionLocalData,
	getHouseholdSession,
	type HouseholdSession,
	readCachedHouseholdSession,
	readUnauthorizedCachedHouseholdSession,
	saveCachedHouseholdSession,
} from "@/lib/services/household";
import { createDefaultSyncCoordinator } from "@/lib/services/sync";

export type HomeContentState =
	| { status: "loading" }
	| { status: "error"; message: string }
	| {
			status: "ready";
			activeMemberName: string;
			initialList: ActiveListInitialState;
			dataSource: ActiveListDataSource;
			syncCoordinator: ActiveListSyncCoordinator;
	  };

type HomeHouseholdSession = HouseholdSession | CachedHouseholdSession;

type OpenedHome = {
	session: HomeHouseholdSession;
	initialList: ActiveListInitialState;
	dataSource: ActiveListDataSource;
	syncCoordinator: ActiveListSyncCoordinator;
};

type OpenedHomeResource = Pick<OpenedHome, "dataSource" | "syncCoordinator">;
type PendingHomeResource = Pick<
	OpenedHome,
	"dataSource" | "session" | "syncCoordinator"
>;

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
	logger: Logger;
	setContent: Dispatch<SetStateAction<HomeContentState>>;
	renderedHomeRef: MutableRefObject<OpenedHome | null>;
	closedDataSources: Set<ActiveListDataSource>;
	cancelled: boolean;
	cachedRendered: boolean;
	cachedInvalidated: boolean;
	freshRendered: boolean;
	pendingHomes: Set<PendingHomeResource>;
};

type HomeLoadOptions = Pick<
	HomeLoadRun,
	| "getToken"
	| "isLoaded"
	| "isSignedIn"
	| "signingOutRef"
	| "logger"
	| "setContent"
	| "renderedHomeRef"
	| "closedDataSources"
>;

export function useHomeContent({
	getToken,
	isLoaded,
	isSignedIn,
	signingOutRef,
}: UseHomeContentOptions): {
	closeCurrentHome: () => Promise<void>;
	content: HomeContentState;
	retry: () => void;
} {
	const logger = useLogger();
	const [content, setContent] = useState<HomeContentState>({
		status: "loading",
	});
	const [loadAttempt, setLoadAttempt] = useState(0);
	const getTokenRef = useRef(getToken);
	const loggerRef = useRef(logger);
	const renderedHomeRef = useRef<OpenedHome | null>(null);
	const closedDataSourcesRef = useRef(new Set<ActiveListDataSource>());

	useEffect(() => {
		getTokenRef.current = getToken;
	}, [getToken]);

	useEffect(() => {
		loggerRef.current = logger;
	}, [logger]);

	useEffect(() => {
		const closedDataSources = closedDataSourcesRef.current;

		return () => {
			const renderedHome = renderedHomeRef.current;
			renderedHomeRef.current = null;
			if (renderedHome) {
				void closeOpenedHome({
					closedDataSources,
					home: renderedHome,
				}).catch(() => undefined);
			}
		};
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: loadAttempt intentionally retriggers Home content loading on retry; getToken and logger freshness are owned by refs.
	useEffect(() => {
		return startHomeLoad({
			getToken: () => getTokenRef.current(),
			isLoaded,
			isSignedIn,
			logger: loggerRef.current,
			renderedHomeRef,
			closedDataSources: closedDataSourcesRef.current,
			setContent,
			signingOutRef,
		});
	}, [isLoaded, isSignedIn, loadAttempt, signingOutRef]);

	const retry = useCallback(() => {
		setLoadAttempt((attempt) => attempt + 1);
	}, []);

	const closeCurrentHome = useCallback(async () => {
		const renderedHome = renderedHomeRef.current;
		renderedHomeRef.current = null;
		if (renderedHome) {
			await closeOpenedHome({
				closedDataSources: closedDataSourcesRef.current,
				home: renderedHome,
			});
		}
	}, []);

	return { closeCurrentHome, content, retry };
}

function startHomeLoad(options: HomeLoadOptions): () => void {
	const run: HomeLoadRun = {
		...options,
		cancelled: false,
		cachedRendered: false,
		cachedInvalidated: false,
		freshRendered: false,
		pendingHomes: new Set<PendingHomeResource>(),
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
			[...run.pendingHomes].map((home) =>
				closeOpenedHome({
					closedDataSources: run.closedDataSources,
					home,
					pendingHomes: run.pendingHomes,
				}),
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

		const unauthorizedCached =
			await readUnauthorizedCachedHouseholdSession(session);
		if (run.cancelled || run.signingOutRef.current) return;

		if (unauthorizedCached) {
			run.cachedInvalidated = true;
			run.cachedRendered = false;
			run.setContent({ status: "loading" });
			await closeCachedHomeResources(run, unauthorizedCached);
			if (run.cancelled || run.signingOutRef.current) return;

			await deleteCachedHouseholdSessionLocalData(unauthorizedCached);
			await clearUnauthorizedCachedHouseholdSessionMetadata(
				unauthorizedCached,
				session,
			);
			if (run.cancelled || run.signingOutRef.current) return;
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
	const syncCoordinator = createDefaultSyncCoordinator({
		syncAuthorized: dataSource.syncAuthorized,
		sync: dataSource.sync,
		logger: run.logger.with({ household_id: session.activeHousehold.id }),
	});
	const home = { session, dataSource, syncCoordinator };
	run.pendingHomes.add(home);

	try {
		const initialList = await dataSource.load();
		if (afterLoad) {
			await afterLoad();
		}

		run.pendingHomes.delete(home);
		return { session, initialList, dataSource, syncCoordinator };
	} catch (error) {
		await closeOpenedHome({
			closedDataSources: run.closedDataSources,
			home,
			pendingHomes: run.pendingHomes,
		}).catch(() => undefined);
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
		await closeOpenedHome({
			closedDataSources: run.closedDataSources,
			home: opened,
		}).catch(() => undefined);
		return;
	}

	if (source === "cached") {
		run.cachedRendered = true;
	} else {
		run.freshRendered = true;
	}
	const previousRenderedHome = run.renderedHomeRef.current;
	if (previousRenderedHome && previousRenderedHome !== opened) {
		await closeOpenedHome({
			closedDataSources: run.closedDataSources,
			home: previousRenderedHome,
		}).catch(() => undefined);
	}
	run.renderedHomeRef.current = opened;

	run.setContent({
		status: "ready",
		activeMemberName: activeMemberNameFromSession(opened.session),
		initialList: opened.initialList,
		dataSource: opened.dataSource,
		syncCoordinator: opened.syncCoordinator,
	});

	if (source === "fresh") {
		opened.syncCoordinator.start();
	}
}

async function closeRenderedHomeBeforeFreshOpen(run: HomeLoadRun) {
	const renderedHome = run.renderedHomeRef.current;
	if (!renderedHome) return;

	run.renderedHomeRef.current = null;
	run.cachedRendered = false;
	run.setContent({ status: "loading" });
	await closeOpenedHome({
		closedDataSources: run.closedDataSources,
		home: renderedHome,
	}).catch(() => undefined);
}

async function closeCachedHomeResources(
	run: HomeLoadRun,
	cached: CachedHouseholdSession,
) {
	const renderedHome = run.renderedHomeRef.current;
	if (renderedHome && isHomeForCachedSession(renderedHome, cached)) {
		await closeOpenedHome({
			closedDataSources: run.closedDataSources,
			home: renderedHome,
		});
		run.renderedHomeRef.current = null;
	}

	const pendingCachedHomes = [...run.pendingHomes].filter((home) =>
		isHomeForCachedSession(home, cached),
	);
	for (const home of pendingCachedHomes) {
		await closeOpenedHome({
			closedDataSources: run.closedDataSources,
			home,
			pendingHomes: run.pendingHomes,
		});
	}
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

async function closeOpenedHome({
	closedDataSources,
	home,
	pendingHomes,
}: {
	closedDataSources: Set<ActiveListDataSource>;
	home: OpenedHomeResource | PendingHomeResource;
	pendingHomes?: Set<PendingHomeResource>;
}) {
	const { dataSource, syncCoordinator } = home;
	if (closedDataSources.has(dataSource)) {
		if (pendingHomes && "session" in home) {
			pendingHomes.delete(home);
		}
		return;
	}

	await syncCoordinator.stop();
	await dataSource.close();
	if (pendingHomes && "session" in home) {
		pendingHomes.delete(home);
	}
	closedDataSources.add(dataSource);
}

function isHomeForCachedSession(
	home: Pick<OpenedHome, "session">,
	cached: CachedHouseholdSession,
): boolean {
	return (
		home.session.activeHousehold.id === cached.activeHousehold.id &&
		!("authToken" in home.session.householdDatabase)
	);
}

function createDataSourceFromSession(
	session: HomeHouseholdSession,
): ActiveListDataSource {
	return createHouseholdCurrentListDataSource({
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
