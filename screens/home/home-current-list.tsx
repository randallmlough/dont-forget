import { Host } from "@expo/ui/swift-ui";
import { useCallback, useState } from "react";
import { ActivityIndicator } from "react-native";
import { ActiveList } from "@/components/active-list";
import type { AuthenticatedAppSession } from "@/lib/services/session";
import { HomeListSwitcherSheet } from "./home-list-switcher";
import { HomeRetryButton, HomeStatus } from "./home-status";
import { useHomeActiveListResolverWithExclusions } from "./use-home-active-list-resolver";
import { useHomeCurrentList } from "./use-home-current-list";

export function HomeCurrentList({
	session,
}: {
	session: AuthenticatedAppSession;
}) {
	return (
		<HomeCurrentListResolver key={session.resourceKey} session={session} />
	);
}

function HomeCurrentListResolver({
	session,
}: {
	session: AuthenticatedAppSession;
}) {
	const [postLoadExcludedListIds, setPostLoadExcludedListIds] = useState<
		string[]
	>([]);
	const [selectedListId, setSelectedListId] = useState<string | null>(null);
	const resolver = useHomeActiveListResolverWithExclusions(
		session,
		postLoadExcludedListIds,
		selectedListId,
	);
	const excludePostLoadUnavailableList = useCallback((listId: string) => {
		setPostLoadExcludedListIds((current) =>
			current.includes(listId) ? current : [...current, listId],
		);
	}, []);
	const resolveState = resolver.state;

	if (resolveState.status === "loading") {
		return (
			<HomeStatus
				title="Preparing your Household"
				body="Loading your Household List."
			>
				<ActivityIndicator />
			</HomeStatus>
		);
	}

	if (resolveState.status === "error") {
		return (
			<HomeStatus title="List unavailable" body={resolveState.message}>
				<HomeRetryButton onPress={resolver.retry} />
			</HomeStatus>
		);
	}

	if (resolveState.status === "zeroActive") {
		return (
			<HomeStatus
				title="No active Lists"
				body="Create a List to start adding Items."
			>
				{null}
			</HomeStatus>
		);
	}

	return (
		<HomeCurrentListResource
			key={homeActiveListBoundaryKey(session, resolveState.listId)}
			session={session}
			listId={resolveState.listId}
			onListUnavailable={excludePostLoadUnavailableList}
			onListSelected={setSelectedListId}
		/>
	);
}

function HomeCurrentListResource({
	session,
	listId,
	onListUnavailable,
	onListSelected,
}: {
	session: AuthenticatedAppSession;
	listId: string;
	onListUnavailable: (listId: string) => void;
	onListSelected: (listId: string) => void;
}) {
	const currentMemberName = homeSessionMemberName(session);
	const [isSwitcherPresented, setIsSwitcherPresented] = useState(false);
	const list = useHomeCurrentList(session, listId, {
		onUnavailable: onListUnavailable,
	});
	const loadState = list.state;
	const boundaryKey = homeActiveListBoundaryKey(session, listId);

	if (loadState.status === "loading") {
		return (
			<HomeStatus
				title="Preparing your Household"
				body="Loading your Household List."
			>
				<ActivityIndicator />
			</HomeStatus>
		);
	}

	if (loadState.status === "unavailable") {
		return (
			<HomeStatus
				title="Preparing your Household"
				body="Loading your Household List."
			>
				<ActivityIndicator />
			</HomeStatus>
		);
	}

	if (loadState.status === "error") {
		return (
			<HomeStatus title="List unavailable" body={loadState.message}>
				<HomeRetryButton onPress={list.retry} />
			</HomeStatus>
		);
	}

	return (
		<Host style={styles.host}>
			<ActiveList.Provider
				key={boundaryKey}
				initialState={loadState.initialList}
				currentMemberName={currentMemberName}
				onLoadList={loadState.actions.loadList}
				onAddItem={loadState.actions.addItem}
				onSetItemChecked={loadState.actions.setItemChecked}
				syncCoordinator={session.services.sync}
			>
				<ActiveList.Screen>
					<ActiveList.Header
						onPressCurrentList={() => setIsSwitcherPresented(true)}
					/>
					<ActiveList.Items />
					<ActiveList.AddItemForm />
				</ActiveList.Screen>
			</ActiveList.Provider>
			<HomeListSwitcherSheet
				currentListId={listId}
				isPresented={isSwitcherPresented}
				onIsPresentedChange={setIsSwitcherPresented}
				onListSelected={onListSelected}
				session={session}
			/>
		</Host>
	);
}

export function homeActiveListBoundaryKey(
	session: Pick<AuthenticatedAppSession, "resourceKey">,
	listId: string,
): string {
	return `${session.resourceKey}:${listId}`;
}

export function homeSessionMemberName(
	session: AuthenticatedAppSession | null,
): string {
	if (!session) return "Member";
	return (
		session.activeMember.displayName ??
		session.user.displayName ??
		session.user.email ??
		"Member"
	);
}

const styles = {
	host: { flex: 1 },
};
