import { useCallback, useEffect, useState } from "react";

import { track } from "@/lib/analytics";
import {
	clearCurrentListSelection,
	setCurrentListSelection,
} from "@/lib/local-storage";
import type { ListSummary } from "@/lib/services/list";
import type { AuthenticatedAppSession } from "@/lib/services/session";

export type HomeListSwitcherState =
	| { status: "loading" }
	| { status: "error" }
	| { status: "ready"; summaries: ListSummary[] };

export type HomeListSwitcherMode =
	| { name: "switcher"; message: string | null }
	| {
			name: "create";
			draftName: string;
			message: string | null;
			isSubmitting: boolean;
	  }
	| {
			name: "rename";
			summary: ListSummary;
			draftName: string;
			message: string | null;
			isSubmitting: boolean;
	  }
	| {
			name: "confirmDelete";
			summary: ListSummary;
			message: string | null;
			isSubmitting: boolean;
	  };

export function useHomeListSwitcher({
	currentListId,
	initialMode,
	isPresented,
	onCurrentListDeletedWithoutFallback,
	onCurrentListRenamed,
	onIsPresentedChange,
	onListSelected,
	session,
}: {
	currentListId: string | null;
	initialMode: "switcher" | "create";
	isPresented: boolean;
	onCurrentListDeletedWithoutFallback: (listId: string) => void;
	onCurrentListRenamed: () => void;
	onIsPresentedChange: (isPresented: boolean) => void;
	onListSelected: (listId: string) => void;
	session: AuthenticatedAppSession;
}): {
	mode: HomeListSwitcherMode;
	state: HomeListSwitcherState;
	switchingListId: string | null;
	backToSwitcher: () => void;
	createList: () => Promise<void>;
	deleteList: () => Promise<void>;
	openCreate: () => void;
	openDelete: (summary: ListSummary) => void;
	openRename: (summary: ListSummary) => void;
	renameList: () => Promise<void>;
	retry: () => void;
	selectList: (listId: string) => Promise<void>;
	setDraftName: (value: string) => void;
} {
	const [state, setState] = useState<HomeListSwitcherState>({
		status: "loading",
	});
	const [mode, setMode] = useState<HomeListSwitcherMode>(() =>
		initialHomeListSwitcherMode(initialMode),
	);
	const [switchingListId, setSwitchingListId] = useState<string | null>(null);

	const loadSummaries = useCallback(async () => {
		setState({ status: "loading" });

		try {
			const summaries = await session.services.lists.listLists({
				archive: "active",
				sort: "recentActivity",
			});
			setState({ status: "ready", summaries });
		} catch {
			setState({ status: "error" });
		}
	}, [session.services.lists]);

	useEffect(() => {
		if (!isPresented) return;
		setMode(initialHomeListSwitcherMode(initialMode));
	}, [initialMode, isPresented]);

	useEffect(() => {
		if (!isPresented || mode.name !== "switcher") return;
		void loadSummaries();
	}, [isPresented, loadSummaries, mode.name]);

	const selectList = useCallback(
		async (listId: string) => {
			if (listId === currentListId || switchingListId) return;

			setSwitchingListId(listId);
			try {
				await setCurrentListSelection(
					session.user.id,
					session.activeHousehold.id,
					listId,
				);
				track("list_switched", {
					household_id: session.activeHousehold.id,
					list_id: listId,
					user_id: session.user.id,
				});
				onListSelected(listId);
				onIsPresentedChange(false);
			} finally {
				setSwitchingListId(null);
			}
		},
		[
			currentListId,
			onIsPresentedChange,
			onListSelected,
			session.activeHousehold.id,
			session.user.id,
			switchingListId,
		],
	);

	const requestLocalWriteSync = useCallback(async () => {
		await session.services.sync.requestSync({ reason: "localWrite" });
	}, [session.services.sync]);

	const backToSwitcher = useCallback(() => {
		setMode({ name: "switcher", message: null });
	}, []);

	const openCreate = useCallback(() => {
		setMode({
			name: "create",
			draftName: "",
			message: null,
			isSubmitting: false,
		});
	}, []);

	const openRename = useCallback((summary: ListSummary) => {
		setMode({
			name: "rename",
			summary,
			draftName: summary.name,
			message: null,
			isSubmitting: false,
		});
	}, []);

	const openDelete = useCallback((summary: ListSummary) => {
		setMode({
			name: "confirmDelete",
			summary,
			message: null,
			isSubmitting: false,
		});
	}, []);

	const setDraftName = useCallback((value: string) => {
		setMode((current) => {
			if (current.name !== "create" && current.name !== "rename") {
				return current;
			}

			return { ...current, draftName: value, message: null };
		});
	}, []);

	const createList = useCallback(async () => {
		if (mode.name !== "create" || mode.isSubmitting) return;

		setMode({ ...mode, isSubmitting: true, message: null });
		try {
			const result = await session.services.lists.createList({
				name: mode.draftName,
			});
			if (result.status === "invalidName") {
				setMode({
					...mode,
					isSubmitting: false,
					message: listNameValidationMessage(result.reason),
				});
				return;
			}

			await setCurrentListSelection(
				session.user.id,
				session.activeHousehold.id,
				result.list.id,
			);
			onListSelected(result.list.id);
			onIsPresentedChange(false);
			if (result.didWrite) {
				await requestLocalWriteSync();
			}
		} catch {
			setMode({
				...mode,
				isSubmitting: false,
				message: "Unable to create this List. Please try again.",
			});
		}
	}, [
		mode,
		onIsPresentedChange,
		onListSelected,
		requestLocalWriteSync,
		session.activeHousehold.id,
		session.services.lists,
		session.user.id,
	]);

	const renameList = useCallback(async () => {
		if (mode.name !== "rename" || mode.isSubmitting) return;

		setMode({ ...mode, isSubmitting: true, message: null });
		try {
			const result = await session.services.lists.renameList({
				listId: mode.summary.id,
				name: mode.draftName,
			});

			if (result.status === "invalidName") {
				setMode({
					...mode,
					isSubmitting: false,
					message: listNameValidationMessage(result.reason),
				});
				return;
			}

			if (result.status === "missing") {
				setMode({
					...mode,
					isSubmitting: false,
					message: "This List is no longer available.",
				});
				return;
			}

			if (result.status === "deleted") {
				setMode({
					...mode,
					isSubmitting: false,
					message: "This List was deleted.",
				});
				return;
			}

			if (result.didWrite) {
				await loadSummaries();
				if (result.list.id === currentListId) {
					onCurrentListRenamed();
				}
				await requestLocalWriteSync();
			}

			setMode({ name: "switcher", message: null });
		} catch {
			setMode({
				...mode,
				isSubmitting: false,
				message: "Unable to rename this List. Please try again.",
			});
		}
	}, [
		currentListId,
		loadSummaries,
		mode,
		onCurrentListRenamed,
		requestLocalWriteSync,
		session.services.lists,
	]);

	const deleteList = useCallback(async () => {
		if (mode.name !== "confirmDelete" || mode.isSubmitting) return;

		setMode({ ...mode, isSubmitting: true, message: null });
		try {
			const result = await session.services.lists.deleteList({
				listId: mode.summary.id,
			});

			if (result.status === "missing") {
				setMode({
					...mode,
					isSubmitting: false,
					message: "This List is no longer available.",
				});
				return;
			}

			if (result.status === "deleted" && !result.didWrite) {
				setMode({
					...mode,
					isSubmitting: false,
					message: "This List was already deleted.",
				});
				return;
			}

			if (mode.summary.id === currentListId) {
				const activeLists = await session.services.lists.listLists({
					archive: "active",
					sort: "recentActivity",
				});
				const fallback = activeLists[0] ?? null;

				if (fallback) {
					await setCurrentListSelection(
						session.user.id,
						session.activeHousehold.id,
						fallback.id,
					);
					onListSelected(fallback.id);
				} else {
					await clearCurrentListSelection(
						session.user.id,
						session.activeHousehold.id,
					);
					onCurrentListDeletedWithoutFallback(mode.summary.id);
				}

				onIsPresentedChange(false);
			} else {
				await loadSummaries();
				setMode({ name: "switcher", message: null });
			}

			if (result.didWrite) {
				await requestLocalWriteSync();
			}
		} catch {
			setMode({
				...mode,
				isSubmitting: false,
				message: "Unable to delete this List. Please try again.",
			});
		}
	}, [
		currentListId,
		loadSummaries,
		mode,
		onCurrentListDeletedWithoutFallback,
		onIsPresentedChange,
		onListSelected,
		requestLocalWriteSync,
		session.activeHousehold.id,
		session.services.lists,
		session.user.id,
	]);

	return {
		mode,
		state,
		switchingListId,
		backToSwitcher,
		createList,
		deleteList,
		openCreate,
		openDelete,
		openRename,
		renameList,
		retry: loadSummaries,
		selectList,
		setDraftName,
	};
}

function initialHomeListSwitcherMode(
	initialMode: "switcher" | "create",
): HomeListSwitcherMode {
	if (initialMode === "create") {
		return {
			name: "create",
			draftName: "",
			message: null,
			isSubmitting: false,
		};
	}

	return { name: "switcher", message: null };
}

function listNameValidationMessage(reason: "required" | "tooLong"): string {
	switch (reason) {
		case "required":
			return "Enter a List name.";
		case "tooLong":
			return "List names must be 80 characters or fewer.";
	}
}
