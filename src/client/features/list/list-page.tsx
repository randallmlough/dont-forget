import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import type { ItemListOption } from "@/client/features/item/item-view-types";
import { useItemEditor } from "@/client/features/item/use-item-editor";
import type { ListSummary } from "@/client/features/list/list-service";
import {
	type AuthenticatedAppSession,
	sessionMemberDisplayName,
} from "@/client/session";
import { Button } from "@/client/ui/button";
import { StatusCard } from "@/client/ui/status-card";
import { ListItems } from "./list-items";
import { ListOverview } from "./list-overview";
import type { ActiveListSyncState } from "./list-view-types";
import { type ListPageState, useListPage } from "./use-list-page";

export type ListPageScrollState = {
	offsetY: SharedValue<number>;
	largeTitleHeight: SharedValue<number>;
};

export type ListPageEditorOwnerToken = symbol;

export type ListPageAddItemRequest = {
	key: number;
	ownerToken: ListPageEditorOwnerToken;
};

export type ListPageEditorEvent =
	| {
			type: "registered";
			listId: string;
			ownerToken: ListPageEditorOwnerToken;
			finish: () => Promise<boolean>;
	  }
	| {
			type: "unregistered";
			listId: string;
			ownerToken: ListPageEditorOwnerToken;
	  }
	| {
			type: "activityChanged";
			listId: string;
			ownerToken: ListPageEditorOwnerToken;
			active: boolean;
	  }
	| {
			type: "creationRequestAcknowledged";
			listId: string;
			ownerToken: ListPageEditorOwnerToken;
			requestKey: number;
	  };

export type ListPageProps = {
	session: AuthenticatedAppSession;
	summary: ListSummary;
	listSummaries: readonly ListSummary[];
	syncState: ActiveListSyncState;
	focused: boolean;
	addItemRequest: ListPageAddItemRequest | null;
	scrollState: ListPageScrollState;
	topContentInset: number;
	onItemEditorEvent: (event: ListPageEditorEvent) => void;
};

export function ListPage({
	summary,
	session,
	syncState,
	listSummaries,
	focused,
	scrollState,
	addItemRequest,
	topContentInset,
	onItemEditorEvent,
}: ListPageProps) {
	const state = useListPage(session, summary);
	const active = state.status === "active";

	// Only a page rendering its List publishes to the header: `ListItems` returns
	// the offset to the top on focus and `ActiveListPage` republishes its large
	// title height. A focused page that is loading or failed has neither, so it
	// zeroes both itself; otherwise the values the page the pager just left
	// measured keep the header's collapsed title showing over this page's own
	// large title.
	useEffect(() => {
		if (!focused || active) return;
		scrollState.offsetY.set(0);
		scrollState.largeTitleHeight.set(0);
	}, [active, scrollState, focused]);

	if (state.status === "loading") {
		return (
			<View style={[styles.page, { paddingTop: topContentInset }]}>
				<ListPageTitle title={summary.name} />
				<StatusCard
					title="Preparing your Household"
					body="Loading your Household List."
				>
					<ActivityIndicator />
				</StatusCard>
			</View>
		);
	}

	if (state.status === "error") {
		return (
			<View style={[styles.page, { paddingTop: topContentInset }]}>
				<ListPageTitle title={summary.name} />
				<StatusCard title="List unavailable" body={state.message}>
					<Button onPress={state.retry}>Try again</Button>
				</StatusCard>
			</View>
		);
	}

	return (
		<ActiveListPage
			addItemRequest={addItemRequest}
			focused={focused}
			listSummaries={listSummaries}
			loadState={state}
			scrollState={scrollState}
			session={session}
			summary={summary}
			syncState={syncState}
			topContentInset={topContentInset}
			onItemEditorEvent={onItemEditorEvent}
		/>
	);
}

function ActiveListPage({
	loadState,
	session,
	syncState,
	listSummaries,
	summary,
	focused,
	scrollState,
	addItemRequest,
	onItemEditorEvent,
	topContentInset,
}: ListPageProps & {
	loadState: Extract<ListPageState, { status: "active" }>;
}) {
	const insets = useSafeAreaInsets();
	const { theme } = useUnistyles();
	const [largeTitleHeight, setLargeTitleHeight] = useState(0);
	const [editorOwnerToken] = useState<ListPageEditorOwnerToken>(() =>
		Symbol(loadState.listId),
	);
	const publishEditorActivity = useCallback(
		(active: boolean) => {
			onItemEditorEvent({
				type: "activityChanged",
				listId: loadState.listId,
				ownerToken: editorOwnerToken,
				active,
			});
		},
		[editorOwnerToken, loadState.listId, onItemEditorEvent],
	);
	const acknowledgeCreationRequest = useCallback(
		(requestKey: number) => {
			onItemEditorEvent({
				type: "creationRequestAcknowledged",
				listId: loadState.listId,
				ownerToken: editorOwnerToken,
				requestKey,
			});
		},
		[editorOwnerToken, loadState.listId, onItemEditorEvent],
	);
	const itemEditor = useItemEditor({
		currentListId: loadState.listId,
		items: loadState.list.items,
		listOptions: itemListOptions({
			currentListId: loadState.listId,
			currentListName: summary.name,
			summaries: listSummaries,
		}),
		creationRequestKey:
			focused && addItemRequest?.ownerToken === editorOwnerToken
				? addItemRequest.key
				: null,
		onActiveChange: publishEditorActivity,
		onCreationRequestAcknowledged: acknowledgeCreationRequest,
		onAddItem: loadState.actions.addItem,
		onUpdateItem: loadState.actions.updateItem,
		onSetItemChecked: loadState.actions.setItemChecked,
	});
	const itemEditorActions = itemEditor.actions;

	useLayoutEffect(() => {
		onItemEditorEvent({
			type: "registered",
			listId: loadState.listId,
			ownerToken: editorOwnerToken,
			finish: itemEditorActions.finish,
		});
		return () => {
			onItemEditorEvent({
				type: "unregistered",
				listId: loadState.listId,
				ownerToken: editorOwnerToken,
			});
		};
	}, [
		editorOwnerToken,
		itemEditorActions,
		loadState.listId,
		onItemEditorEvent,
	]);

	// Editing ends when the pager carries this page out of focus, whichever
	// interaction changed focus. The blur is a no-op on an idle editor.
	useEffect(() => {
		if (focused) return;
		void itemEditorActions.blurInlineEditor(() => undefined);
	}, [focused, itemEditorActions]);

	// Only the focused page publishes to the header, and it republishes on focus
	// so the header collapses against this page's large title rather than the
	// one measured by the page the pager just left.
	useEffect(() => {
		if (!focused) return;
		scrollState.largeTitleHeight.set(largeTitleHeight);
	}, [focused, scrollState, largeTitleHeight]);

	return (
		<ListItems
			bottomContentInset={insets.bottom + theme.spacing(20)}
			editor={itemEditor}
			focused={focused}
			items={loadState.list.items}
			listOverview={
				<View>
					<ListPageTitle
						title={summary.name}
						onMeasureHeight={setLargeTitleHeight}
					/>
					<ListOverview
						state={loadState.list}
						meta={{
							currentMemberName: sessionMemberDisplayName(session),
							syncState,
						}}
					/>
				</View>
			}
			scrollOffsetY={focused ? scrollState.offsetY : undefined}
			topContentInset={topContentInset}
			testID={`home-list-items-${summary.id}`}
		/>
	);
}

function ListPageTitle({
	title,
	onMeasureHeight,
}: {
	title: string;
	onMeasureHeight?: (height: number) => void;
}) {
	return (
		<Text
			accessibilityRole="header"
			style={styles.pageTitle}
			onLayout={(event) => onMeasureHeight?.(event.nativeEvent.layout.height)}
		>
			{title}
		</Text>
	);
}

function itemListOptions({
	currentListId,
	currentListName,
	summaries,
}: {
	currentListId: string;
	currentListName: string;
	summaries: readonly ListSummary[];
}): ItemListOption[] {
	return [
		{ id: currentListId, name: currentListName },
		...summaries
			.filter((summary) => summary.id !== currentListId)
			.map((summary) => ({ id: summary.id, name: summary.name })),
	];
}

const styles = StyleSheet.create((theme) => ({
	page: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
	pageTitle: {
		fontSize: theme.fontSizes["5xl"],
		fontWeight: theme.fontWeights.bold,
		lineHeight: theme.lineHeights["5xl"],
		color: theme.colors.foreground,
		paddingHorizontal: theme.spacing(5),
		paddingTop: theme.spacing(2),
		paddingBottom: theme.spacing(2),
		backgroundColor: theme.colors.background,
	},
}));
