import { BottomSheet, Group, Host, RNHostView } from "@expo/ui/swift-ui";
import {
	interactiveDismissDisabled,
	presentationDetents,
	presentationDragIndicator,
} from "@expo/ui/swift-ui/modifiers";
import { useEffect, useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import {
	type ArchiveListResult,
	type CreateListResult,
	type DeleteListResult,
	LIST_NAME_MAX_LENGTH,
	type ListListsInput,
	type ListSummary,
	type RenameListResult,
	type RenameListValidationError,
	type UnarchiveListResult,
} from "@/lib/services/list";
import { ListNameForm } from "./list-name-form";
import { ListSwitcherConfirmation } from "./list-switcher-confirmation";
import { ListSwitcherEmptyState } from "./list-switcher-empty-state";
import { ListSwitcherRow } from "./list-switcher-row";
import { ListSwitcherSegmentButton } from "./list-switcher-segment-button";
import { styles } from "./list-switcher-styles";
import type { ListSwitcherSegment } from "./list-switcher-types";
import { useListSwitcherLists } from "./use-list-switcher-lists";

type ListSwitcherCreateResult =
	| { status: "created" }
	| Extract<CreateListResult, { status: "invalid" }>
	| { status: "failed" };

type ListSwitcherRenameResult =
	| { status: "renamed" }
	| { status: "unchanged" }
	| Extract<RenameListResult, { status: "invalid" | "missing" | "deleted" }>
	| { status: "failed" };

type ListSwitcherArchiveResult =
	| { status: "archived" }
	| { status: "unchanged" }
	| Extract<ArchiveListResult, { status: "missing" | "deleted" }>
	| { status: "failed" };

type ListSwitcherUnarchiveResult =
	| { status: "unarchived" }
	| { status: "unchanged" }
	| Extract<UnarchiveListResult, { status: "missing" | "deleted" }>
	| { status: "failed" };

type ListSwitcherDeleteResult =
	| { status: "deleted" }
	| Extract<DeleteListResult, { status: "already-deleted" | "missing" }>
	| { status: "failed" };

type ListSwitcherBaseProps = {
	visible: boolean;
	activeLists: ListSummary[];
	hasArchivedLists?: boolean;
	currentListId: string | null;
	isSwitching?: boolean;
	initialSegment?: ListSwitcherSegment;
	initialMode?: "switch" | "create";
	isCreating?: boolean;
	onSelectList: (listId: string) => void;
	onLoadLists?: (input: ListListsInput) => Promise<ListSummary[]>;
	onCreateList: (name: string) => Promise<ListSwitcherCreateResult>;
	onArchiveList?: (listId: string) => Promise<ListSwitcherArchiveResult>;
	onDeleteList?: (listId: string) => Promise<ListSwitcherDeleteResult>;
	onUnarchiveList?: (listId: string) => Promise<ListSwitcherUnarchiveResult>;
	onClose: () => void;
	onCancelCreate?: () => void;
};

type ListSwitcherRenameEnabledProps = {
	canRenameLists: true;
	isRenaming?: boolean;
	onRenameList: (
		listId: string,
		name: string,
	) => Promise<ListSwitcherRenameResult>;
};

type ListSwitcherRenameDisabledProps = {
	canRenameLists?: false;
	isRenaming?: never;
	onRenameList?: never;
};

export type ListSwitcherProps = ListSwitcherBaseProps &
	(ListSwitcherRenameEnabledProps | ListSwitcherRenameDisabledProps);

type SheetState =
	| { mode: "switch"; actionsTarget: ListSummary | null; error: string | null }
	| { mode: "create"; draft: string; error: string | null }
	| {
			mode: "rename";
			target: ListSummary;
			draft: string;
			error: string | null;
	  }
	| { mode: "confirmArchive"; target: ListSummary; error: string | null }
	| { mode: "confirmDelete"; target: ListSummary; error: string | null };

type StaleLifecycleResult = { status: "missing" } | { status: "deleted" };

export function ListSwitcher({
	visible,
	activeLists,
	hasArchivedLists = false,
	currentListId,
	isSwitching = false,
	initialSegment = "active",
	initialMode = "switch",
	isCreating = false,
	onSelectList,
	onLoadLists,
	onCreateList,
	onArchiveList,
	onDeleteList,
	onUnarchiveList,
	onClose,
	onCancelCreate,
	...renameProps
}: ListSwitcherProps) {
	const [sheetState, setSheetState] = useState<SheetState>(() =>
		initialSheetState(initialMode),
	);
	const [isArchiving, setIsArchiving] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const {
		debouncedSearchText,
		listState,
		loadLists,
		searchText,
		segment,
		setSearchText,
		setSegment,
	} = useListSwitcherLists({
		activeLists,
		initialSegment,
		onLoadLists,
		visible,
	});
	const draft =
		sheetState.mode === "create" || sheetState.mode === "rename"
			? sheetState.draft
			: "";
	const isRenaming =
		renameProps.canRenameLists && renameProps.isRenaming
			? renameProps.isRenaming
			: false;
	const trimmedDraft = draft.trim();
	const isTooLong = trimmedDraft.length > LIST_NAME_MAX_LENGTH;
	const canCreate = trimmedDraft.length > 0 && !isTooLong && !isCreating;
	const canRename =
		trimmedDraft.length > 0 &&
		!isTooLong &&
		!isRenaming &&
		sheetState.mode === "rename";
	const isBusy = isCreating || isRenaming || isArchiving || isDeleting;

	useEffect(() => {
		if (!visible) {
			setSheetState(initialSheetState(initialMode));
			setIsArchiving(false);
			setIsDeleting(false);
			return;
		}

		setSheetState(initialSheetState(initialMode));
		setIsArchiving(false);
		setIsDeleting(false);
	}, [visible, initialMode]);

	useEffect(() => {
		if (!visible || sheetState.mode !== "switch") return;
		void loadLists();
	}, [loadLists, sheetState.mode, visible]);

	function resetFormState() {
		setSheetState({ mode: "switch", actionsTarget: null, error: null });
	}

	function changeSegment(nextSegment: ListSwitcherSegment) {
		if (nextSegment === segment) return;
		setSheetState({ mode: "switch", actionsTarget: null, error: null });
		setSegment(nextSegment);
	}

	function closeSheet() {
		if (isBusy) return;
		resetFormState();
		onClose();
	}

	function cancelForm() {
		if (isCreating || isRenaming) return;
		resetFormState();
		if (sheetState.mode === "create" && onCancelCreate) {
			onCancelCreate();
			return;
		}
	}

	function changeFormDraft(value: string) {
		setSheetState((state) => {
			if (state.mode !== "create" && state.mode !== "rename") return state;
			return { ...state, draft: value, error: null };
		});
	}

	function setFormError(message: string) {
		setSheetState((state) => {
			return { ...state, error: message };
		});
	}

	function handleStaleLifecycleResult(result: StaleLifecycleResult) {
		setFormError(
			result.status === "missing"
				? "List is no longer available."
				: "List was deleted.",
		);
		void loadLists();
	}

	function toggleListActions(list: ListSummary) {
		if (isSwitching || isRenaming) return;
		setSheetState((state) => {
			if (state.mode !== "switch") return state;
			return {
				mode: "switch",
				actionsTarget: state.actionsTarget?.id === list.id ? null : list,
				error: null,
			};
		});
	}

	function startRename(list: ListSummary) {
		if (!renameProps.canRenameLists || isSwitching || isRenaming) return;
		setSheetState({
			mode: "rename",
			target: list,
			draft: list.name,
			error: null,
		});
	}

	function startArchive(list: ListSummary) {
		if (!onArchiveList || isSwitching || isRenaming) return;
		setSheetState({ mode: "confirmArchive", target: list, error: null });
	}

	function startDelete(list: ListSummary) {
		if (!onDeleteList || isSwitching || isRenaming) return;
		setSheetState({ mode: "confirmDelete", target: list, error: null });
	}

	async function submitArchive() {
		if (sheetState.mode !== "confirmArchive" || !onArchiveList || isArchiving) {
			return;
		}

		setSheetState({ ...sheetState, error: null });
		setIsArchiving(true);
		try {
			const result = await onArchiveList(sheetState.target.id);
			if (result.status === "archived" || result.status === "unchanged") {
				resetFormState();
				return;
			}
			if (result.status === "missing") {
				handleStaleLifecycleResult(result);
				return;
			}
			if (result.status === "deleted") {
				handleStaleLifecycleResult(result);
				return;
			}

			setFormError("List could not be archived.");
		} finally {
			setIsArchiving(false);
		}
	}

	async function submitDelete() {
		if (sheetState.mode !== "confirmDelete" || !onDeleteList || isDeleting) {
			return;
		}

		setSheetState({ ...sheetState, error: null });
		setIsDeleting(true);
		try {
			const result = await onDeleteList(sheetState.target.id);
			if (result.status === "deleted") {
				resetFormState();
				return;
			}
			if (result.status === "missing") {
				handleStaleLifecycleResult(result);
				return;
			}
			if (result.status === "already-deleted") {
				setFormError("List was deleted.");
				void loadLists();
				return;
			}

			setFormError("List could not be deleted.");
		} finally {
			setIsDeleting(false);
		}
	}

	async function submitUnarchive(list: ListSummary) {
		if (!onUnarchiveList || isSwitching || isRenaming) return;

		const result = await onUnarchiveList(list.id);
		if (result.status === "unarchived" || result.status === "unchanged") {
			resetFormState();
			onClose();
			return;
		}
		if (result.status === "missing" || result.status === "deleted") {
			handleStaleLifecycleResult(result);
		}
	}

	async function submitCreate() {
		if (!canCreate || sheetState.mode !== "create") return;

		setSheetState({ ...sheetState, error: null });
		const result = await onCreateList(sheetState.draft);
		if (result.status === "created") {
			resetFormState();
			onClose();
			return;
		}

		setFormError("Unable to create this List. Please try again.");
	}

	async function submitRename() {
		if (
			!canRename ||
			sheetState.mode !== "rename" ||
			!renameProps.canRenameLists ||
			!renameProps.onRenameList
		) {
			return;
		}

		if (trimmedDraft === sheetState.target.name.trim()) {
			resetFormState();
			return;
		}

		setSheetState({ ...sheetState, error: null });
		const result = await renameProps.onRenameList(
			sheetState.target.id,
			sheetState.draft,
		);
		if (result.status === "renamed" || result.status === "unchanged") {
			resetFormState();
			return;
		}

		if (result.status === "missing") {
			handleStaleLifecycleResult(result);
			return;
		}

		if (result.status === "deleted") {
			handleStaleLifecycleResult(result);
			return;
		}

		if (result.status === "invalid") {
			setFormError(listNameValidationMessage(result.error.code));
			return;
		}

		setFormError("List could not be renamed.");
	}

	return (
		<Host matchContents>
			<BottomSheet
				isPresented={visible}
				onIsPresentedChange={(isPresented) => {
					if (!isPresented) closeSheet();
				}}
			>
				<Group
					modifiers={[
						presentationDetents(["medium", "large"]),
						presentationDragIndicator("visible"),
						interactiveDismissDisabled(isBusy),
					]}
				>
					<RNHostView>
						<View
							accessibilityLabel="List switcher"
							accessibilityViewIsModal
							style={[styles.sheet, styles.flexSheet]}
						>
							{sheetState.mode === "create" ? (
								<ListNameForm
									canSubmit={canCreate}
									draft={sheetState.draft}
									error={sheetState.error}
									isSubmitting={isCreating}
									isTooLong={isTooLong}
									onCancel={cancelForm}
									onChangeDraft={changeFormDraft}
									onSubmit={() => void submitCreate()}
									submitLabel="Create"
									submittingLabel="Creating"
									title="Create List"
								/>
							) : sheetState.mode === "rename" ? (
								<ListNameForm
									canSubmit={canRename}
									draft={sheetState.draft}
									error={sheetState.error}
									isSubmitting={isRenaming}
									isTooLong={isTooLong}
									onCancel={cancelForm}
									onChangeDraft={changeFormDraft}
									onSubmit={() => void submitRename()}
									submitLabel="Save"
									submittingLabel="Saving"
									title="Rename List"
								/>
							) : sheetState.mode === "confirmArchive" ? (
								<ListSwitcherConfirmation
									body={`${sheetState.target.name} will move to Archived Lists. You can restore it later.`}
									confirmLabel="Archive"
									error={sheetState.error}
									isSubmitting={isArchiving}
									onCancel={resetFormState}
									onConfirm={() => void submitArchive()}
									submittingLabel="Archiving"
									title="Archive this List?"
									variant="primary"
								/>
							) : sheetState.mode === "confirmDelete" ? (
								<ListSwitcherConfirmation
									body={`${sheetState.target.name} will be removed from the app. This cannot be undone.`}
									confirmAccessibilityHint={`Permanently removes ${sheetState.target.name}`}
									confirmLabel="Delete"
									error={sheetState.error}
									isSubmitting={isDeleting}
									onCancel={resetFormState}
									onConfirm={() => void submitDelete()}
									submittingLabel="Deleting"
									title="Delete this List?"
									variant="destructive"
								/>
							) : (
								<>
									<View style={styles.header}>
										<Text style={styles.title}>Current List</Text>
										<Pressable
											accessibilityRole="button"
											disabled={isSwitching}
											onPress={closeSheet}
											style={({ pressed }) => [
												styles.closeButton,
												isSwitching ? styles.disabledRow : undefined,
												pressed ? styles.pressed : undefined,
											]}
										>
											<Text style={styles.closeButtonLabel}>Close</Text>
										</Pressable>
									</View>

									<View style={styles.segmentedControl}>
										<ListSwitcherSegmentButton
											active={segment === "active"}
											label="Active"
											onPress={() => changeSegment("active")}
										/>
										<ListSwitcherSegmentButton
											active={segment === "archived"}
											label="Archived"
											onPress={() => changeSegment("archived")}
										/>
									</View>

									<View style={styles.searchGroup}>
										<TextInput
											accessibilityLabel="Search Lists"
											autoCapitalize="none"
											autoCorrect={false}
											clearButtonMode="never"
											onChangeText={setSearchText}
											placeholder="Search Lists"
											returnKeyType="search"
											multiline={false}
											style={[styles.input, styles.searchInput]}
											value={searchText}
										/>
										{searchText ? (
											<Pressable
												accessibilityRole="button"
												onPress={() => setSearchText("")}
												style={({ pressed }) => [
													styles.clearSearchButton,
													pressed ? styles.pressed : undefined,
												]}
											>
												<Text style={styles.clearSearchLabel}>Clear</Text>
											</Pressable>
										) : null}
									</View>
									{sheetState.error ? (
										<Text style={styles.errorText}>{sheetState.error}</Text>
									) : null}

									{listState.status === "error" ? (
										<View style={styles.emptyState}>
											<Text style={styles.emptyStateTitle}>
												Lists could not be loaded.
											</Text>
											<Pressable
												accessibilityRole="button"
												onPress={() => void loadLists()}
												style={({ pressed }) => [
													styles.secondaryButton,
													pressed ? styles.pressed : undefined,
												]}
											>
												<Text style={styles.secondaryButtonLabel}>
													Try Again
												</Text>
											</Pressable>
										</View>
									) : (
										<FlatList
											data={listState.lists}
											keyExtractor={(list) => list.id}
											style={styles.rows}
											contentContainerStyle={styles.rowsContent}
											ListEmptyComponent={
												<ListSwitcherEmptyState
													hasArchivedLists={hasArchivedLists}
													searchText={debouncedSearchText}
													segment={segment}
													onCreateList={() =>
														setSheetState({
															mode: "create",
															draft: "",
															error: null,
														})
													}
													onViewArchived={() => changeSegment("archived")}
												/>
											}
											renderItem={({ item: list }) => {
												const isArchivedRow = segment === "archived";
												const actionsOpen =
													sheetState.mode === "switch" &&
													sheetState.actionsTarget?.id === list.id;
												return (
													<ListSwitcherRow
														actionsOpen={actionsOpen}
														canRenameLists={Boolean(renameProps.canRenameLists)}
														currentListId={currentListId}
														isArchivedRow={isArchivedRow}
														isRenaming={isRenaming}
														isSwitching={isSwitching}
														list={list}
														onSelectList={onSelectList}
														onStartArchive={
															onArchiveList ? startArchive : undefined
														}
														onStartDelete={
															onDeleteList ? startDelete : undefined
														}
														onStartRename={startRename}
														onUnarchiveList={
															onUnarchiveList
																? (target) => void submitUnarchive(target)
																: undefined
														}
														onToggleActions={toggleListActions}
													/>
												);
											}}
										/>
									)}
									<View style={styles.footerActions}>
										<Pressable
											accessibilityRole="button"
											disabled={isSwitching}
											onPress={() =>
												setSheetState({
													mode: "create",
													draft: "",
													error: null,
												})
											}
											style={({ pressed }) => [
												styles.primaryButton,
												isSwitching ? styles.disabledRow : undefined,
												pressed ? styles.pressed : undefined,
											]}
										>
											<Text style={styles.primaryButtonLabel}>Create List</Text>
										</Pressable>
									</View>
								</>
							)}
						</View>
					</RNHostView>
				</Group>
			</BottomSheet>
		</Host>
	);
}

function initialSheetState(initialMode: "switch" | "create"): SheetState {
	if (initialMode === "create") {
		return { mode: "create", draft: "", error: null };
	}
	return { mode: "switch", actionsTarget: null, error: null };
}

function listNameValidationMessage(
	code: RenameListValidationError["code"],
): string {
	if (code === "name-too-long") {
		return "List name must be 80 characters or fewer.";
	}
	return "List name is required.";
}
