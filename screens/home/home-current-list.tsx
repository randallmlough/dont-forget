import { ActivityIndicator } from "react-native";
import { ActiveList } from "@/components/active-list";
import { DEFAULT_LIST_ID } from "@/lib/bootstrap";
import type { AuthenticatedAppSession } from "@/lib/services/session";
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
	const list = useHomeCurrentList(session, DEFAULT_LIST_ID);
	const loadState = list.state;

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

	return (
		<ActiveList.Provider
			initialState={loadState.initialList}
			currentMemberName={currentMemberName}
			onLoadList={loadState.actions.loadList}
			onAddItem={loadState.actions.addItem}
			onSetItemChecked={loadState.actions.setItemChecked}
			syncCoordinator={session.services.sync}
		>
			<ActiveList.Screen>
				<ActiveList.Header />
				<ActiveList.Items />
				<ActiveList.AddItemForm />
			</ActiveList.Screen>
		</ActiveList.Provider>
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
