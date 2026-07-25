import { Stack, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useNavigationDrawer } from "@/client/app-shell/navigation-drawer-context";
import { CurrentList } from "@/client/features/list/current-list";
import {
	HomeRetryButton,
	HomeStatus,
} from "@/client/features/list/home-status";
import { useHomeCurrentList } from "@/client/features/list/use-home-current-list";
import { useListRows } from "@/client/features/list/use-list-rows";
import { useSelectList } from "@/client/features/list/use-select-list";
import {
	type AuthenticatedAppSession,
	type AuthenticatedAppSessionState,
	useAuthenticatedAppSession,
	useSyncState,
} from "@/client/session";

const FALLBACK_TITLE = "Home";

export type HomeScreenViewProps = {
	state: AuthenticatedAppSessionState;
	onRetry?: () => void;
};

export default function HomeScreen() {
	const { state, session, retry } = useAuthenticatedAppSession();
	const { open } = useNavigationDrawer();
	const router = useRouter();
	const openLists = () => router.replace("/lists");

	if (session) {
		return (
			<HomeScreenResource
				key={session.activeHousehold.id}
				session={session}
				onOpenNavigation={open}
				onOpenLists={openLists}
			/>
		);
	}

	return (
		<>
			<HomeStackHeader
				title={FALLBACK_TITLE}
				onOpenNavigation={open}
				onOpenLists={openLists}
			/>
			<HomeScreenView state={state} onRetry={retry} />
		</>
	);
}

type HomeScreenResourceProps = {
	session: AuthenticatedAppSession;
	onOpenNavigation: () => void;
	onOpenLists: () => void;
};

function HomeScreenResource({
	session,
	onOpenNavigation,
	onOpenLists,
}: HomeScreenResourceProps) {
	// The Current List resolves here, not inside CurrentList, so the native
	// stack title survives the loading, error, and zeroActive states. A
	// Stack.Title rendered inside the active List surface would unmount in
	// those states and drop the title with it.
	const currentList = useHomeCurrentList(session);
	const syncState = useSyncState();
	const { rows } = useListRows(session);
	const selectList = useSelectList(session);
	const [focusedListId, setFocusedListId] = useState<string | null>(null);
	const persistedListIdRef = useRef<string | null>(null);
	const currentListId =
		currentList.state.status === "active" ? currentList.state.listId : null;
	const listSummaries = rows.status === "ready" ? rows.summaries : [];
	const currentListIsActive = listSummaries.some(
		(summary) => summary.id === currentListId,
	);
	const resolvedFocusedListId =
		focusedListId &&
		listSummaries.some((summary) => summary.id === focusedListId)
			? focusedListId
			: currentListIsActive
				? currentListId
				: (listSummaries[0]?.id ?? null);

	useEffect(() => {
		if (persistedListIdRef.current === null && currentListId !== null) {
			persistedListIdRef.current = currentListId;
		}
	}, [currentListId]);

	async function focusList(listId: string): Promise<boolean> {
		const persistedListId = persistedListIdRef.current ?? currentListId;
		if (listId === persistedListId) {
			setFocusedListId(listId);
			return true;
		}

		setFocusedListId(listId);
		const didSelect = await selectList(listId, persistedListId);
		if (!didSelect) {
			setFocusedListId(persistedListId);
			return false;
		}

		persistedListIdRef.current = listId;
		return true;
	}

	return (
		<>
			<HomeStackHeader
				title={resolvedFocusedListId === null ? FALLBACK_TITLE : undefined}
				onOpenNavigation={onOpenNavigation}
				onOpenLists={onOpenLists}
			/>
			<CurrentList
				session={session}
				deps={{ currentList, syncState, listRows: rows }}
				focusedListId={resolvedFocusedListId}
				onFocusList={focusList}
				onOpenLists={onOpenLists}
			/>
		</>
	);
}

function HomeStackHeader({
	title,
	onOpenNavigation,
	onOpenLists,
}: {
	title?: string;
	onOpenNavigation: () => void;
	onOpenLists: () => void;
}) {
	return (
		<>
			{/* The enclosing Stack sets headerShown: false, so this route opts back in. */}
			<Stack.Screen
				options={{
					headerLargeTitle: title !== undefined,
					headerShown: true,
					title: title ?? "",
				}}
			/>
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.Button
					accessibilityHint="Opens the navigation drawer"
					accessibilityLabel="Open navigation"
					icon="sidebar.left"
					onPress={onOpenNavigation}
				/>
			</Stack.Toolbar>
			<Stack.Toolbar placement="right">
				<Stack.Toolbar.Button
					accessibilityHint="Opens Lists"
					accessibilityLabel="Open Lists"
					icon="list.bullet"
					onPress={onOpenLists}
				/>
			</Stack.Toolbar>
		</>
	);
}

export function HomeScreenView({ state, onRetry }: HomeScreenViewProps) {
	return (
		<View style={styles.root}>
			{state.status === "error" ? (
				<HomeStatus title="Household unavailable" body={state.message}>
					{onRetry ? <HomeRetryButton onPress={onRetry} /> : null}
				</HomeStatus>
			) : (
				<HomeStatus
					title="Preparing your Household"
					body="Loading your Household List."
				>
					<ActivityIndicator />
				</HomeStatus>
			)}
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	root: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
}));
