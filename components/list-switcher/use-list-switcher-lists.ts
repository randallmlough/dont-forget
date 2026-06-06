import { useCallback, useEffect, useRef, useState } from "react";
import type { ListListsInput, ListSummary } from "@/lib/services/list";
import type {
	ListSwitcherListState,
	ListSwitcherSegment,
} from "./list-switcher-types";

export function useListSwitcherLists({
	activeLists,
	initialSegment,
	onLoadLists,
	visible,
}: {
	activeLists: ListSummary[];
	initialSegment: ListSwitcherSegment;
	onLoadLists?: (input: ListListsInput) => Promise<ListSummary[]>;
	visible: boolean;
}) {
	const [segment, setSegment] = useState<ListSwitcherSegment>(initialSegment);
	const [searchText, setSearchText] = useState("");
	const [debouncedSearchText, setDebouncedSearchText] = useState("");
	const [listState, setListState] = useState<ListSwitcherListState>({
		status: "idle",
		lists: initialSegment === "active" ? activeLists : [],
	});
	const loadRequestId = useRef(0);
	const resetStateRef = useRef({ initialSegment, visible });

	useEffect(() => {
		const wasVisible = resetStateRef.current.visible;
		const previousInitialSegment = resetStateRef.current.initialSegment;
		resetStateRef.current = { initialSegment, visible };

		if (!visible) {
			loadRequestId.current += 1;
			return;
		}

		if (wasVisible && previousInitialSegment === initialSegment) {
			return;
		}

		setSegment(initialSegment);
		setSearchText("");
		setDebouncedSearchText("");
		setListState({
			status: "idle",
			lists: initialSegment === "active" ? activeLists : [],
		});
	}, [activeLists, initialSegment, visible]);

	useEffect(() => {
		const timeout = setTimeout(() => {
			setDebouncedSearchText(searchText);
		}, 300);
		return () => clearTimeout(timeout);
	}, [searchText]);

	const loadLists = useCallback(async () => {
		const requestId = loadRequestId.current + 1;
		loadRequestId.current = requestId;
		const requestIsCurrent = () =>
			visible && loadRequestId.current === requestId;
		const request: ListListsInput = {
			archive: segment,
			searchText: debouncedSearchText,
		};
		const fallbackLists = segment === "active" ? activeLists : [];

		setListState((state) => ({
			status: "loading",
			lists:
				state.status === "idle" && segment === "active"
					? fallbackLists
					: state.lists,
		}));

		try {
			const lists = onLoadLists
				? await onLoadLists(request)
				: segment === "active"
					? activeLists
					: [];
			if (requestIsCurrent()) {
				setListState({ status: "ready", lists });
			}
		} catch {
			if (requestIsCurrent()) {
				setListState((state) => ({ status: "error", lists: state.lists }));
			}
		}
	}, [activeLists, debouncedSearchText, onLoadLists, segment, visible]);

	return {
		debouncedSearchText,
		listState,
		loadLists,
		searchText,
		segment,
		setSearchText,
		setSegment,
	};
}
