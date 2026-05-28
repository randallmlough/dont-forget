import { useCallback, useEffect, useMemo, useState } from "react";
import type { ActiveHouseholdContentState } from "@/components/active-household";
import type {
	ActiveListInitialState,
	ActiveListItem,
} from "@/components/active-list";
import type { Item } from "@/lib/services/item";

type ReadyActiveHouseholdContent = Extract<
	ActiveHouseholdContentState,
	{ status: "ready" }
>;

export type ListActions = {
	loadList: () => Promise<ActiveListInitialState>;
	addItem: (name: string) => Promise<ActiveListItem>;
	setItemChecked: (itemId: string, checked: boolean) => Promise<void>;
};

export type ListState =
	| { status: "loading"; retryAttempt: number }
	| { status: "error"; message: string }
	| {
			status: "ready";
			initialList: ActiveListInitialState;
			actions: ListActions;
	  };

export function useList(
	content: ReadyActiveHouseholdContent,
	listId: string,
): {
	state: ListState;
	retry: () => void;
} {
	const [state, setState] = useState<ListState>({
		status: "loading",
		retryAttempt: 0,
	});
	const [retryAttempt, setRetryAttempt] = useState(0);
	const memberNames = useMemo(() => {
		const names = new Map<string, string | null>();
		for (const member of content.members) {
			names.set(member.userId, member.displayName);
		}
		names.set(
			content.activeMember.userId,
			content.activeMember.displayName ?? content.activeMemberName,
		);
		return names;
	}, [content.activeMember, content.activeMemberName, content.members]);

	const loadList = useCallback(async (): Promise<ActiveListInitialState> => {
		const [list, items] = await Promise.all([
			content.listService.getList({ listId }),
			content.itemService.listItems({ listId }),
		]);

		return {
			householdName: content.household.name,
			listName: list.name,
			items: items.map((item) => activeListItemFromItem(item, memberNames)),
		};
	}, [
		content.household.name,
		content.itemService,
		content.listService,
		listId,
		memberNames,
	]);

	const addItem = useCallback(
		async (name: string): Promise<ActiveListItem> => {
			const item = await content.itemService.addItem({
				listId,
				userId: content.activeMember.userId,
				name,
			});
			return activeListItemFromItem(item, memberNames);
		},
		[content.activeMember.userId, content.itemService, listId, memberNames],
	);

	const setItemChecked = useCallback(
		async (itemId: string, checked: boolean) => {
			await content.itemService.setItemChecked({
				listId,
				itemId,
				userId: content.activeMember.userId,
				checked,
			});
		},
		[content.activeMember.userId, content.itemService, listId],
	);

	const actions = useMemo<ListActions>(
		() => ({ addItem, loadList, setItemChecked }),
		[addItem, loadList, setItemChecked],
	);

	useEffect(() => {
		let cancelled = false;
		setState({ status: "loading", retryAttempt });

		loadList()
			.then((initialList) => {
				if (!cancelled) setState({ status: "ready", initialList, actions });
			})
			.catch(() => {
				if (!cancelled) {
					setState({
						status: "error",
						message: "Unable to load this List. Please try again.",
					});
				}
			});

		return () => {
			cancelled = true;
		};
	}, [actions, loadList, retryAttempt]);

	return {
		state,
		retry: () => setRetryAttempt((attempt) => attempt + 1),
	};
}

function activeListItemFromItem(
	item: Item,
	memberNames: Map<string, string | null>,
): ActiveListItem {
	return {
		id: item.id,
		name: item.name,
		checked: item.checked,
		checkedByMemberName:
			item.checked && item.checkedByUserId
				? (memberNames.get(item.checkedByUserId) ?? null)
				: null,
	};
}
