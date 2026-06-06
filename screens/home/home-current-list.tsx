import { useState } from "react";
import { ActivityIndicator, Pressable, Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { ActiveList } from "@/components/active-list";
import { ListSwitcher } from "@/components/list-switcher/list-switcher";
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
	const [switcherOpen, setSwitcherOpen] = useState(false);
	const [zeroActiveSwitcherMode, setZeroActiveSwitcherMode] = useState<
		"create" | "archived" | null
	>(null);
	const list = useHomeCurrentList(session);
	const loadState = list.state;

	async function selectList(listId: string) {
		if (
			loadState.status !== "ready" &&
			loadState.status !== "deleted-current"
		) {
			return;
		}
		if (await loadState.actions.selectList(listId)) {
			setSwitcherOpen(false);
		}
	}

	async function createList(name: string) {
		if (
			loadState.status !== "ready" &&
			loadState.status !== "zero-active" &&
			loadState.status !== "deleted-current"
		) {
			return { status: "failed" as const };
		}
		const result = await loadState.actions.createList(name);
		if (result.status === "created") {
			setSwitcherOpen(false);
			setZeroActiveSwitcherMode(null);
		}
		return result;
	}

	async function renameList(listId: string, name: string) {
		if (loadState.status !== "ready") {
			return { status: "failed" as const };
		}
		return loadState.actions.renameList(listId, name);
	}

	async function archiveList(listId: string) {
		if (loadState.status !== "ready") {
			return { status: "failed" as const };
		}
		const isCurrentList = listId === loadState.currentList.id;
		const result = await loadState.actions.archiveList(listId);
		if (
			isCurrentList &&
			(result.status === "archived" ||
				result.status === "unchanged" ||
				result.status === "missing" ||
				result.status === "deleted")
		) {
			setSwitcherOpen(false);
		}
		return result;
	}

	async function deleteList(listId: string) {
		if (
			loadState.status !== "ready" &&
			loadState.status !== "deleted-current"
		) {
			return { status: "failed" as const };
		}
		const isCurrentList =
			loadState.status === "ready" && listId === loadState.currentList.id;
		const result = await loadState.actions.deleteList(listId);
		if (
			isCurrentList &&
			(result.status === "deleted" ||
				result.status === "already-deleted" ||
				result.status === "missing")
		) {
			setSwitcherOpen(false);
		}
		return result;
	}

	async function unarchiveList(listId: string) {
		if (
			loadState.status !== "ready" &&
			loadState.status !== "zero-active" &&
			loadState.status !== "deleted-current"
		) {
			return { status: "failed" as const };
		}
		const result = await loadState.actions.unarchiveList(listId);
		if (result.status === "unarchived" || result.status === "unchanged") {
			setSwitcherOpen(false);
			setZeroActiveSwitcherMode(null);
		}
		return result;
	}

	async function loadListSummaries(
		input: Parameters<
			AuthenticatedAppSession["services"]["lists"]["listLists"]
		>[0],
	) {
		return session.services.lists.listLists(input);
	}

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

	if (loadState.status === "zero-active") {
		return (
			<>
				<HomeStatus
					title="No active Lists"
					body="Create a List to start adding Items."
				>
					<Pressable
						accessibilityRole="button"
						onPress={() => setZeroActiveSwitcherMode("create")}
						style={({ pressed }) => [
							styles.primaryButton,
							pressed ? styles.pressed : undefined,
						]}
					>
						<Text style={styles.primaryButtonLabel}>Create List</Text>
					</Pressable>
					{loadState.hasArchivedLists ? (
						<Pressable
							accessibilityRole="button"
							onPress={() => setZeroActiveSwitcherMode("archived")}
							style={({ pressed }) => [
								styles.secondaryButton,
								pressed ? styles.pressed : undefined,
							]}
						>
							<Text style={styles.secondaryButtonLabel}>View Archived</Text>
						</Pressable>
					) : null}
				</HomeStatus>
				<ListSwitcher
					visible={zeroActiveSwitcherMode !== null}
					activeLists={[]}
					hasArchivedLists={loadState.hasArchivedLists}
					currentListId={null}
					initialMode={
						zeroActiveSwitcherMode === "create" ? "create" : "switch"
					}
					initialSegment={
						zeroActiveSwitcherMode === "archived" ? "archived" : "active"
					}
					isCreating={loadState.isCreating}
					onSelectList={() => undefined}
					onLoadLists={loadListSummaries}
					onCreateList={createList}
					onUnarchiveList={unarchiveList}
					onClose={() => setZeroActiveSwitcherMode(null)}
					onCancelCreate={() => setZeroActiveSwitcherMode(null)}
				/>
			</>
		);
	}

	if (loadState.status === "deleted-current") {
		return (
			<>
				<HomeStatus
					title="This List was deleted."
					body="Switch to another List or create a new one."
				>
					<Pressable
						accessibilityRole="button"
						onPress={() => setSwitcherOpen(true)}
						style={({ pressed }) => [
							styles.secondaryButton,
							pressed ? styles.pressed : undefined,
						]}
					>
						<Text style={styles.secondaryButtonLabel}>Switch List</Text>
					</Pressable>
					<Pressable
						accessibilityRole="button"
						onPress={() => setZeroActiveSwitcherMode("create")}
						style={({ pressed }) => [
							styles.primaryButton,
							pressed ? styles.pressed : undefined,
						]}
					>
						<Text style={styles.primaryButtonLabel}>Create List</Text>
					</Pressable>
				</HomeStatus>
				<ListSwitcher
					visible={switcherOpen || zeroActiveSwitcherMode === "create"}
					activeLists={loadState.activeLists}
					hasArchivedLists={loadState.hasArchivedLists}
					currentListId={null}
					initialMode={
						zeroActiveSwitcherMode === "create" ? "create" : "switch"
					}
					isCreating={loadState.isCreating}
					isSwitching={loadState.isSwitching}
					onSelectList={(listId) => void selectList(listId)}
					onLoadLists={loadState.actions.loadListSummaries}
					onCreateList={createList}
					onDeleteList={deleteList}
					onUnarchiveList={unarchiveList}
					onClose={() => {
						setSwitcherOpen(false);
						setZeroActiveSwitcherMode(null);
					}}
					onCancelCreate={() => setZeroActiveSwitcherMode(null)}
				/>
			</>
		);
	}

	return (
		<>
			<ActiveList.Provider
				key={`${loadState.currentList.id}:${loadState.currentList.updatedAt}`}
				initialState={loadState.initialList}
				currentMemberName={currentMemberName}
				onLoadList={loadState.actions.loadList}
				onAddItem={loadState.actions.addItem}
				onSetItemChecked={loadState.actions.setItemChecked}
				syncCoordinator={session.services.sync}
				readOnly={loadState.currentList.archived}
			>
				<ActiveList.Screen>
					<ActiveList.Header
						currentListName={loadState.currentList.name}
						onOpenListSwitcher={() => {
							setSwitcherOpen(true);
						}}
					/>
					{loadState.currentList.archived ? (
						<ArchivedCurrentListNotice
							onRestore={() => void unarchiveList(loadState.currentList.id)}
							onSwitchList={() => setSwitcherOpen(true)}
						/>
					) : null}
					<ActiveList.Items />
					<ActiveList.AddItemForm />
				</ActiveList.Screen>
			</ActiveList.Provider>
			<ListSwitcher
				visible={switcherOpen}
				activeLists={loadState.activeLists}
				hasArchivedLists={loadState.hasArchivedLists}
				currentListId={loadState.currentList.id}
				isCreating={loadState.isCreating}
				canRenameLists
				isRenaming={loadState.isRenaming}
				isSwitching={loadState.isSwitching}
				onSelectList={(listId) => void selectList(listId)}
				onLoadLists={loadState.actions.loadListSummaries}
				onCreateList={createList}
				onRenameList={renameList}
				onArchiveList={archiveList}
				onDeleteList={deleteList}
				onUnarchiveList={unarchiveList}
				onClose={() => setSwitcherOpen(false)}
				initialSegment={loadState.currentList.archived ? "archived" : "active"}
			/>
		</>
	);
}

function ArchivedCurrentListNotice({
	onRestore,
	onSwitchList,
}: {
	onRestore: () => void;
	onSwitchList: () => void;
}) {
	return (
		<HomeStatus
			title="This List is archived"
			body="Restore it to make changes, or switch to an active List."
		>
			<Pressable
				accessibilityRole="button"
				onPress={onRestore}
				style={({ pressed }) => [
					styles.primaryButton,
					pressed ? styles.pressed : undefined,
				]}
			>
				<Text style={styles.primaryButtonLabel}>Restore</Text>
			</Pressable>
			<Pressable
				accessibilityRole="button"
				onPress={onSwitchList}
				style={({ pressed }) => [
					styles.secondaryButton,
					pressed ? styles.pressed : undefined,
				]}
			>
				<Text style={styles.secondaryButtonLabel}>Switch List</Text>
			</Pressable>
		</HomeStatus>
	);
}

const styles = StyleSheet.create((theme) => ({
	primaryButton: {
		minHeight: theme.spacing(12),
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: theme.spacing(5),
		borderRadius: theme.radii.control,
		borderCurve: "continuous",
		backgroundColor: theme.colors.primary,
	},
	primaryButtonLabel: {
		...theme.typography.callout,
		color: theme.colors.inverseText,
		fontWeight: theme.fontWeights.bold,
	},
	secondaryButton: {
		minHeight: theme.spacing(12),
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: theme.spacing(5),
		borderRadius: theme.radii.control,
		borderCurve: "continuous",
		borderWidth: theme.borders.thin,
		borderColor: theme.colors.border,
		backgroundColor: theme.colors.surface,
	},
	secondaryButtonLabel: {
		...theme.typography.callout,
		color: theme.colors.text,
		fontWeight: theme.fontWeights.bold,
	},
	pressed: {
		opacity: theme.opacities.pressed,
	},
}));

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
