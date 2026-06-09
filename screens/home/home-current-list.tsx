import { Host, RNHostView } from "@expo/ui/swift-ui";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
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
	const [currentListRevision, setCurrentListRevision] = useState(0);
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
	const handleCurrentListDeletedWithoutFallback = useCallback(
		(listId: string) => {
			setSelectedListId(null);
			excludePostLoadUnavailableList(listId);
		},
		[excludePostLoadUnavailableList],
	);
	const refreshCurrentList = useCallback(() => {
		setCurrentListRevision((revision) => revision + 1);
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
			<HomeZeroActiveList
				session={session}
				onListSelected={setSelectedListId}
			/>
		);
	}

	return (
		<HomeCurrentListResource
			key={homeActiveListBoundaryKey(session, resolveState.listId)}
			currentListRevision={currentListRevision}
			session={session}
			listId={resolveState.listId}
			onCurrentListDeletedWithoutFallback={
				handleCurrentListDeletedWithoutFallback
			}
			onCurrentListRenamed={refreshCurrentList}
			onListUnavailable={excludePostLoadUnavailableList}
			onListSelected={setSelectedListId}
		/>
	);
}

function HomeZeroActiveList({
	session,
	onListSelected,
}: {
	session: AuthenticatedAppSession;
	onListSelected: (listId: string) => void;
}) {
	const [isSwitcherPresented, setIsSwitcherPresented] = useState(false);

	return (
		<Host style={styles.host}>
			<HomeStatus
				title="No active Lists"
				body="Create a List to start adding Items."
			>
				<Pressable
					accessibilityRole="button"
					onPress={() => setIsSwitcherPresented(true)}
					style={({ pressed }) => [
						styles.createButton,
						pressed ? styles.buttonPressed : undefined,
					]}
				>
					<Text style={styles.createButtonLabel}>Create List</Text>
				</Pressable>
			</HomeStatus>
			<HomeListSwitcherSheet
				currentListId={null}
				initialMode="create"
				isPresented={isSwitcherPresented}
				onCurrentListDeletedWithoutFallback={() => {}}
				onCurrentListRenamed={() => {}}
				onIsPresentedChange={setIsSwitcherPresented}
				onListSelected={onListSelected}
				session={session}
			/>
		</Host>
	);
}

function HomeCurrentListResource({
	session,
	listId,
	currentListRevision,
	onCurrentListDeletedWithoutFallback,
	onCurrentListRenamed,
	onListUnavailable,
	onListSelected,
}: {
	session: AuthenticatedAppSession;
	listId: string;
	currentListRevision: number;
	onCurrentListDeletedWithoutFallback: (listId: string) => void;
	onCurrentListRenamed: () => void;
	onListUnavailable: (listId: string) => void;
	onListSelected: (listId: string) => void;
}) {
	const currentMemberName = homeSessionMemberName(session);
	const [isSwitcherPresented, setIsSwitcherPresented] = useState(false);
	const list = useHomeCurrentList(session, listId, {
		onUnavailable: onListUnavailable,
		refreshKey: currentListRevision,
	});
	const loadState = list.state;
	const boundaryKey = homeActiveListBoundaryKey(session, listId);
	const providerKey = `${boundaryKey}:${currentListRevision}`;

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
			<RNHostView>
				<View style={styles.hostContent}>
					<ActiveList.Provider
						key={providerKey}
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
				</View>
			</RNHostView>
			<HomeListSwitcherSheet
				currentListId={listId}
				initialMode="switcher"
				isPresented={isSwitcherPresented}
				onCurrentListDeletedWithoutFallback={
					onCurrentListDeletedWithoutFallback
				}
				onCurrentListRenamed={onCurrentListRenamed}
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

const styles = StyleSheet.create((theme) => ({
	host: {
		flex: 1,
	},
	hostContent: {
		flex: 1,
	},
	createButton: {
		minHeight: theme.spacing(11),
		paddingHorizontal: theme.spacing(4),
		borderRadius: theme.radii.control,
		borderCurve: "continuous",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: theme.colors.primary,
	},
	buttonPressed: {
		opacity: theme.opacities.pressed,
	},
	createButtonLabel: {
		...theme.typography.callout,
		color: theme.colors.inverseText,
		fontWeight: theme.fontWeights.bold,
	},
}));
