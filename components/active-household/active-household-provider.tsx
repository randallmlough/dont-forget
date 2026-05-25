import { useAuth, useUser } from "@clerk/clerk-expo";
import {
	createContext,
	type PropsWithChildren,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type {
	ActiveListDataSource,
	ActiveListInitialState,
	ActiveListSyncCoordinator,
} from "@/components/active-list";
import { reset, track } from "@/lib/analytics";
import { asError } from "@/lib/errors";
import { useLogger } from "@/lib/logger";

import {
	type ActiveHouseholdActivation,
	type ActiveHouseholdController,
	type ActiveHouseholdSnapshot,
	clearCachedHouseholdSessionMetadata,
	createActiveHouseholdController,
	deleteCachedHouseholdSessionLocalData,
	readCachedHouseholdSession,
} from "@/lib/services/household";

export type ActiveHouseholdContentState =
	| { status: "loading" }
	| { status: "error"; message: string }
	| {
			status: "ready";
			activeMemberName: string;
			resourceKey: string;
			initialList: ActiveListInitialState;
			dataSource: ActiveListDataSource;
			syncCoordinator: ActiveListSyncCoordinator;
	  };

export type ActiveHouseholdContextValue = {
	content: ActiveHouseholdContentState;
	currentMemberName: string;
	retry: () => void;
	signOut: () => Promise<void>;
};

type ActiveHouseholdProviderAuth = ActiveHouseholdActivation & {
	signOut: () => Promise<void>;
};

type ActiveHouseholdProviderAnalytics = {
	track: typeof track;
	reset: typeof reset;
};

type ActiveHouseholdProviderProps = PropsWithChildren<{
	controller?: ActiveHouseholdController;
	auth?: ActiveHouseholdProviderAuth;
	fallbackMemberName?: string;
	analytics?: ActiveHouseholdProviderAnalytics;
	readCachedHouseholdSession?: typeof readCachedHouseholdSession;
	deleteCachedHouseholdSessionLocalData?: typeof deleteCachedHouseholdSessionLocalData;
	clearCachedHouseholdSessionMetadata?: typeof clearCachedHouseholdSessionMetadata;
}>;

const defaultAnalytics: ActiveHouseholdProviderAnalytics = { track, reset };

const ActiveHouseholdContext =
	createContext<ActiveHouseholdContextValue | null>(null);

export function ActiveHouseholdProvider({
	children,
	controller: controllerProp,
	auth: authProp,
	fallbackMemberName,
	analytics = defaultAnalytics,
	readCachedHouseholdSession:
		readCachedHouseholdSessionProp = readCachedHouseholdSession,
	deleteCachedHouseholdSessionLocalData:
		deleteCachedHouseholdSessionLocalDataProp = deleteCachedHouseholdSessionLocalData,
	clearCachedHouseholdSessionMetadata:
		clearCachedHouseholdSessionMetadataProp = clearCachedHouseholdSessionMetadata,
}: ActiveHouseholdProviderProps) {
	const clerkAuth = useAuth();
	const { user } = useUser();
	const logger = useLogger();
	const auth = useMemo(
		() =>
			authProp ?? {
				getToken: clerkAuth.getToken,
				authReady: clerkAuth.isLoaded,
				signedIn: Boolean(clerkAuth.isSignedIn),
				signOut: clerkAuth.signOut,
			},
		[
			authProp,
			clerkAuth.getToken,
			clerkAuth.isLoaded,
			clerkAuth.isSignedIn,
			clerkAuth.signOut,
		],
	);
	const controllerRef = useRef<ActiveHouseholdController | null>(null);
	controllerRef.current ??= controllerProp ?? createActiveHouseholdController();
	const controller = controllerRef.current;
	const [snapshot, setSnapshot] = useState<ActiveHouseholdSnapshot>(() =>
		controller.getSnapshot(),
	);
	const [retryAttempt, setRetryAttempt] = useState(0);
	const signingOutRef = useRef(false);

	useEffect(() => {
		const subscription = controller.subscribe(setSnapshot);
		setSnapshot(controller.getSnapshot());
		return () => subscription.remove();
	}, [controller]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: retryAttempt intentionally retriggers active Household activation.
	useEffect(() => {
		void controller.activate({
			getToken: auth.getToken,
			authReady: auth.authReady,
			signedIn: auth.signedIn,
		});
	}, [auth.authReady, auth.getToken, auth.signedIn, controller, retryAttempt]);

	useEffect(() => {
		return () => {
			void controller.dispose().catch(() => undefined);
		};
	}, [controller]);

	const retry = useCallback(() => {
		setRetryAttempt((attempt) => attempt + 1);
	}, []);

	const signOutAction = auth.signOut;
	const signOut = useCallback(async () => {
		if (signingOutRef.current) return;
		signingOutRef.current = true;

		analytics.track("user_signed_out", {});
		analytics.reset();
		await controller.dispose().catch((error) => {
			logger.error("active Household sign-out dispose failed", {
				error: asError(error),
			});
		});

		try {
			const cached = await readCachedHouseholdSessionProp();
			if (cached) {
				await deleteCachedHouseholdSessionLocalDataProp(cached);
			}
			await clearCachedHouseholdSessionMetadataProp();
		} catch (error) {
			logger.error("active Household sign-out local cleanup failed", {
				error: asError(error),
			});
		}

		await signOutAction();
	}, [
		analytics,
		clearCachedHouseholdSessionMetadataProp,
		controller,
		deleteCachedHouseholdSessionLocalDataProp,
		logger,
		readCachedHouseholdSessionProp,
		signOutAction,
	]);

	const currentMemberName =
		fallbackMemberName ??
		user?.fullName ??
		user?.firstName ??
		user?.primaryEmailAddress?.emailAddress ??
		"Member";

	const value = useMemo<ActiveHouseholdContextValue>(
		() => ({
			content: contentFromSnapshot(snapshot),
			currentMemberName,
			retry,
			signOut,
		}),
		[currentMemberName, retry, signOut, snapshot],
	);

	return (
		<ActiveHouseholdContext.Provider value={value}>
			{children}
		</ActiveHouseholdContext.Provider>
	);
}

export function useActiveHousehold(): ActiveHouseholdContextValue {
	const value = useContext(ActiveHouseholdContext);
	if (!value) {
		throw new Error(
			"useActiveHousehold must be used inside ActiveHouseholdProvider",
		);
	}
	return value;
}

function contentFromSnapshot(
	snapshot: ActiveHouseholdSnapshot,
): ActiveHouseholdContentState {
	if (snapshot.status === "ready") {
		return contentFromView(snapshot.view);
	}

	if (snapshot.status === "loading" && snapshot.previous) {
		return contentFromView(snapshot.previous);
	}

	if (snapshot.status === "error") {
		return { status: "error", message: snapshot.message };
	}

	return { status: "loading" };
}

function contentFromView(
	view: Extract<ActiveHouseholdSnapshot, { status: "ready" }>["view"],
): ActiveHouseholdContentState {
	return {
		status: "ready",
		activeMemberName: view.activeMemberName,
		resourceKey: view.currentList.resourceKey,
		initialList: view.currentList.initialState,
		dataSource: view.currentList.dataSource,
		syncCoordinator: view.currentList.syncCoordinator,
	};
}
