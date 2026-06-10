import { useState } from "react";
import { ActivityIndicator } from "react-native";
import { ActiveList } from "@/components/active-list";
import type { AuthenticatedAppSession } from "@/lib/services/session";
import { HomeListSwitcher } from "./home-list-switcher";
import { HomeRetryButton, HomeStatus } from "./home-status";
import { useHomeCurrentList } from "./use-home-current-list";

export function HomeCurrentList({
	session,
}: {
	session: AuthenticatedAppSession;
}) {
	return (
		<HomeCurrentListResource key={session.resourceKey} session={session} />
	);
}

function HomeCurrentListResource({
	session,
}: {
	session: AuthenticatedAppSession;
}) {
	const currentMemberName = homeSessionMemberName(session);
	const list = useHomeCurrentList(session);
	const loadState = list.state;
	const [switcherOpen, setSwitcherOpen] = useState(false);

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

	if (loadState.status === "error") {
		return (
			<HomeStatus title="List unavailable" body={loadState.message}>
				<HomeRetryButton onPress={list.retry} />
			</HomeStatus>
		);
	}

	if (loadState.status === "zeroActive") {
		// Temporary display-only zero-active state; the create flow lands later.
		return (
			<HomeStatus
				title="No active Lists"
				body="Create a List to start adding Items."
			/>
		);
	}

	return (
		<>
			<ActiveList.Provider
				key={`${session.resourceKey}:${loadState.listId}`}
				initialState={loadState.initialList}
				currentMemberName={currentMemberName}
				onLoadList={loadState.actions.loadList}
				onAddItem={loadState.actions.addItem}
				onSetItemChecked={loadState.actions.setItemChecked}
				syncCoordinator={session.services.sync}
			>
				<ActiveList.Screen>
					<ActiveList.Header onPressListName={() => setSwitcherOpen(true)} />
					<ActiveList.Items />
					<ActiveList.AddItemForm />
				</ActiveList.Screen>
			</ActiveList.Provider>
			{switcherOpen ? (
				<HomeListSwitcher
					session={session}
					currentListId={loadState.listId}
					onDismiss={() => setSwitcherOpen(false)}
					// Task 5 re-resolution: re-reads the freshly stored selection and
					// remounts the Active List boundary via the listId-keyed Provider.
					onSwitched={list.retry}
				/>
			) : null}
		</>
	);
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
