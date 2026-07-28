import { Stack, useRouter } from "expo-router";
import { useHeaderHeight } from "expo-router/build/react-navigation/elements";
import { useMemo, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import Animated, {
	Extrapolation,
	interpolate,
	useAnimatedStyle,
	useSharedValue,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useNavigationDrawer } from "@/client/app-shell/navigation-drawer-context";
import type { ListSummary } from "@/client/features/list/list-service";
import { useListCollection } from "@/client/features/list/use-list-collection";
import {
	type AuthenticatedAppSession,
	type AuthenticatedAppSessionState,
	useAuthenticatedAppSession,
	useSyncState,
} from "@/client/session";
import { Button } from "@/client/ui/button";
import { StatusCard } from "@/client/ui/status-card";
import { HomeAddItemButton } from "./home-add-item-button";
import {
	type CollapsedTitleScroll,
	type HomeAddItemRequest,
	HomeListPager,
	type HomeListPickerPhase,
} from "./home-list-pager";
import { HomeListToolbar } from "./home-list-toolbar";

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
	// The collapsed title renders inside the native header, above the scroll
	// edge effect, so the focused List page publishes its scroll state up here
	// instead of drawing a title bar of its own underneath that effect.
	const offsetY = useSharedValue(0);
	const largeTitleHeight = useSharedValue(0);
	const pagerDrift = useSharedValue(0);
	const collapsedTitleScroll = useMemo<CollapsedTitleScroll>(
		() => ({ offsetY, largeTitleHeight, pagerDrift }),
		[offsetY, largeTitleHeight, pagerDrift],
	);
	const syncState = useSyncState();
	const collection = useListCollection(session);
	// The Current List resolves here, not inside HomeListPager, so the native
	// stack header keeps its fallback title through the loading, error, and
	// zeroActive states, where no List page is mounted to own a title.
	const [focusedListId, setFocusedListId] = useState<string | null>(null);
	// Home's interaction state lives here because the native bottom toolbar
	// renders from the page component, outside the List surface it drives.
	const [itemEditorActive, setItemEditorActive] = useState(false);
	const [addItemRequest, setAddItemRequest] =
		useState<HomeAddItemRequest | null>(null);
	const [pickerPhase, setPickerPhase] = useState<HomeListPickerPhase>("closed");
	const [selectionPending, setSelectionPending] = useState(false);
	const currentListId =
		collection.state.status === "active"
			? collection.state.currentListId
			: null;
	const listSummaries =
		collection.state.status === "active" ||
		collection.state.status === "resolvingCurrentList"
			? collection.state.summaries
			: [];
	const resolvedFocusedListId = resolveFocusedListId({
		focusedListId,
		currentListId,
		listSummaries,
	});
	const focusedIndex = Math.max(
		0,
		listSummaries.findIndex((summary) => summary.id === resolvedFocusedListId),
	);
	const focusedListName = listSummaries[focusedIndex]?.name;

	async function focusList(listId: string): Promise<boolean> {
		if (selectionPending) return false;
		setFocusedListId(listId);
		setSelectionPending(true);
		try {
			const outcome = await collection.actions.selectList({ listId });
			if (
				outcome.status === "selected" ||
				outcome.status === "alreadyCurrent"
			) {
				return true;
			}
			setFocusedListId(outcome.currentListId);
			return false;
		} finally {
			setSelectionPending(false);
		}
	}

	/**
	 * Moves the pager onto a List while the page control is still under the
	 * finger. The pager parks on the focused List without animating, so this
	 * alone is the instant page switch; the write waits for the finger to lift.
	 */
	function scrubToPage(index: number) {
		const summary = listSummaries[index];
		if (summary) setFocusedListId(summary.id);
	}

	function commitPage(index: number) {
		const summary = listSummaries[index];
		if (summary) void focusList(summary.id);
	}

	function startAddingItem() {
		if (resolvedFocusedListId === null) return;
		setAddItemRequest((current) => ({
			key: (current?.key ?? 0) + 1,
			listId: resolvedFocusedListId,
		}));
		setItemEditorActivity(true);
	}

	function setItemEditorActivity(active: boolean) {
		// An unselected Household falls back to its most recently active List.
		// Pin the visible List while editing so a write that changes activity
		// ordering cannot carry the user to the Item's destination List.
		if (active && resolvedFocusedListId !== null) {
			setFocusedListId(resolvedFocusedListId);
		}
		setItemEditorActive(active);
	}

	return (
		<>
			<HomeStackHeader
				collapsedListTitle={
					focusedListName === undefined
						? undefined
						: { name: focusedListName, scroll: collapsedTitleScroll }
				}
				title={focusedListName === undefined ? FALLBACK_TITLE : undefined}
				onOpenNavigation={onOpenNavigation}
				onOpenLists={onOpenLists}
			/>
			{listSummaries.length > 0 ? (
				<HomeListToolbar
					disabled={itemEditorActive}
					focusedIndex={focusedIndex}
					lists={listSummaries}
					pickerOpen={pickerPhase === "open"}
					onClosePicker={() => setPickerPhase("closing")}
					onCommitPage={commitPage}
					onOpenPicker={() => setPickerPhase("open")}
					onScrubToPage={scrubToPage}
				/>
			) : null}
			<View style={styles.content}>
				<HomeListPager
					session={session}
					addItemRequest={addItemRequest}
					collectionState={collection.state}
					syncState={syncState}
					focusedListId={resolvedFocusedListId}
					collapsedTitleScroll={collapsedTitleScroll}
					pickerPhase={pickerPhase}
					selectionPending={selectionPending}
					onFocusList={focusList}
					onItemEditorActiveChange={setItemEditorActivity}
					onOpenLists={onOpenLists}
					onRetry={collection.actions.retry}
					onPickerPhaseChange={setPickerPhase}
					topContentInset={headerHeight}
				/>
				{listSummaries.length > 0 &&
				pickerPhase === "closed" &&
				!itemEditorActive ? (
					<HomeAddItemButton onPress={startAddingItem} />
				) : null}
			</View>
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
 * Home's native stack header. It always owns the toolbar buttons. Outside the
 * List pager it owns a plain large title; with a pager on screen it goes
 * transparent so each List page scrolls under Apple's scroll edge effect, and
 * the focused List's name collapses into the native title slot instead.
 */
function HomeStackHeader({
	collapsedListTitle,
	title,
	onOpenNavigation,
	onOpenLists,
}: {
	collapsedListTitle?: { name: string; scroll: CollapsedTitleScroll };
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
			{collapsedListTitle ? (
				<Stack.Title asChild>
					<CollapsedListTitle
						scroll={collapsedListTitle.scroll}
						title={collapsedListTitle.name}
					/>
				</Stack.Title>
			) : null}
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

/**
 * The focused List's name, sitting in the native header's title slot so it
 * keeps the system title position and paints above the scroll edge effect
 * rather than under it. It fades in over the last stretch of the focused page's
 * large title, and back out as the pager carries that page away. It repeats the
 * large title, which stays the page's heading for assistive technology, so it
 * is hidden from assistive technology.
 */
function CollapsedListTitle({
	scroll,
	title,
}: {
	scroll: CollapsedTitleScroll;
	title: string;
}) {
	const { theme } = useUnistyles();
	const fadeDistance = theme.spacing(6);
	const titleStyle = useAnimatedStyle(() => {
		const collapsedAt = scroll.largeTitleHeight.get();
		if (collapsedAt <= 0) return { opacity: 0 };
		const collapsed = interpolate(
			scroll.offsetY.get(),
			[collapsedAt - fadeDistance, collapsedAt],
			[0, 1],
			Extrapolation.CLAMP,
		);
		return { opacity: collapsed * (1 - scroll.pagerDrift.get()) };
	});

	return (
		<Animated.View
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants"
			style={titleStyle}
			testID="home-collapsed-list-title"
		>
			<Text numberOfLines={1} style={styles.collapsedListTitle}>
				{title}
			</Text>
		</Animated.View>
	);
}

export function HomeScreenView({ state, onRetry }: HomeScreenViewProps) {
	return (
		<View style={styles.root}>
			{state.status === "error" ? (
				<StatusCard title="Household unavailable" body={state.message}>
					{onRetry ? <Button onPress={onRetry}>Try again</Button> : null}
				</StatusCard>
			) : (
				<StatusCard
					title="Preparing your Household"
					body="Loading your Household List."
				>
					<ActivityIndicator />
				</StatusCard>
			)}
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	root: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
	content: {
		flex: 1,
	},
	collapsedListTitle: {
		...theme.typography.headline,
		color: theme.colors.foreground,
		textAlign: "center",
	},
}));
