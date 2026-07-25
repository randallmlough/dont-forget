import { Stack, useRouter } from "expo-router";
import { useHeaderHeight } from "expo-router/build/react-navigation/elements";
import { useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useNavigationDrawer } from "@/client/app-shell/navigation-drawer-context";
import { CurrentList } from "@/client/features/list/current-list";
import {
	HomeRetryButton,
	HomeStatus,
} from "@/client/features/list/home-status";
import type { ListSummary } from "@/client/features/list/list-service";
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
	const headerHeight = useHeaderHeight();
	// The Current List resolves here, not inside CurrentList, so the native
	// stack header keeps its fallback title through the loading, error, and
	// zeroActive states, where no List page is mounted to own a title.
	const currentList = useHomeCurrentList(session);
	const syncState = useSyncState();
	const { rows } = useListRows(session);
	const selectList = useSelectList(session);
	const [focusedListId, setFocusedListId] = useState<string | null>(null);
	// The List whose selection is persisted. It trails `focusedListId`, which
	// moves with the pager before the switch is written.
	const persistedListIdRef = useRef<string | null>(null);
	const currentListId =
		currentList.state.status === "active" ? currentList.state.listId : null;
	const listSummaries = rows.status === "ready" ? rows.summaries : [];
	const resolvedFocusedListId = resolveFocusedListId({
		focusedListId,
		currentListId,
		listSummaries,
	});

	async function focusList(listId: string): Promise<boolean> {
		const persistedListId = persistedListIdRef.current ?? currentListId;
		setFocusedListId(listId);
		if (listId === persistedListId) return true;

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
				topContentInset={headerHeight}
			/>
		</>
	);
}

function resolveFocusedListId({
	focusedListId,
	currentListId,
	listSummaries,
}: {
	focusedListId: string | null;
	currentListId: string | null;
	listSummaries: readonly ListSummary[];
}): string | null {
	const isActive = (listId: string | null) =>
		listId !== null && listSummaries.some((summary) => summary.id === listId);

	if (isActive(focusedListId)) return focusedListId;
	if (isActive(currentListId)) return currentListId;
	return listSummaries[0]?.id ?? null;
}

/**
 * Home's native stack header. It always owns the toolbar buttons. It owns a
 * title only outside the List pager; with a pager on screen the header goes
 * transparent and empty so each List page can scroll under it and show its own
 * large and sticky titles.
 */
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
					headerTransparent: title === undefined,
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
