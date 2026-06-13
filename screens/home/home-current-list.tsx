import { useState } from "react";
import { ActivityIndicator, Pressable, Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";
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
		return (
			<>
				<HomeStatus
					title="No active Lists"
					body="Create a List to start adding Items."
				>
					<Pressable
						accessibilityRole="button"
						onPress={() => setSwitcherOpen(true)}
						style={({ pressed }) => [
							styles.createButton,
							pressed ? styles.createButtonPressed : undefined,
						]}
					>
						<Text style={styles.createButtonLabel}>Create List</Text>
					</Pressable>
				</HomeStatus>
				{switcherOpen ? (
					<HomeListSwitcher
						session={session}
						currentListId={null}
						initialMode="create"
						onDismiss={() => setSwitcherOpen(false)}
						// A successful create persists the selection, then re-resolution
						// renders the new empty Current List.
						onSwitched={list.reload}
					/>
				) : null}
			</>
		);
	}

	return (
		<>
			<ActiveList.Provider
				key={`${session.resourceKey}:${loadState.listId}`}
				state={loadState.list}
				currentMemberName={currentMemberName}
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
					onSwitched={list.reload}
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

const styles = StyleSheet.create((theme) => ({
	createButton: {
		minHeight: theme.spacing(11),
		paddingHorizontal: theme.spacing(4),
		borderRadius: theme.radii.control,
		borderCurve: "continuous",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: theme.colors.primary,
	},
	createButtonPressed: {
		opacity: theme.opacities.pressed,
	},
	createButtonLabel: {
		...theme.typography.callout,
		color: theme.colors.inverseText,
		fontWeight: theme.fontWeights.bold,
	},
}));
