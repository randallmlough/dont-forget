import { useCallback, useEffect, useMemo, useState } from "react";
import type {
	ActiveListInitialState,
	ActiveListItem,
} from "@/components/active-list";
import type { Item } from "@/lib/services/item";
import type { AuthenticatedAppSession } from "@/lib/services/session";

export type HomeCurrentListActions = {
	loadList: () => Promise<ActiveListInitialState>;
	addItem: (name: string) => Promise<ActiveListItem>;
	setItemChecked: (itemId: string, checked: boolean) => Promise<void>;
};

export type HomeCurrentListState =
	| { status: "loading"; retryAttempt: number }
	| { status: "error"; message: string }
	| {
			status: "ready";
			initialList: ActiveListInitialState;
			actions: HomeCurrentListActions;
	  };

export function useHomeCurrentList(
	session: AuthenticatedAppSession,
	listId: string,
): {
	state: HomeCurrentListState;
	retry: () => void;
} {
	const [state, setState] = useState<HomeCurrentListState>({
		status: "loading",
		retryAttempt: 0,
	});
	const [retryAttempt, setRetryAttempt] = useState(0);
	const memberNames = useMemo(() => {
		const names = new Map<string, string | null>();
		for (const member of session.members) {
			names.set(member.userId, member.displayName);
		}
		names.set(
			session.activeMember.userId,
			session.activeMember.displayName ??
				session.user.displayName ??
				session.user.email ??
				"Member",
		);
		return names;
	}, [
		session.activeMember.displayName,
		session.activeMember.userId,
		session.members,
		session.user.displayName,
		session.user.email,
	]);

	const loadList = useCallback(async (): Promise<ActiveListInitialState> => {
		const [list, items] = await Promise.all([
			session.services.lists.getList({ listId }),
			session.services.items.listItems({ listId }),
		]);

		return {
			householdName: session.activeHousehold.name,
			listName: list.name,
			items: items.map((item) => activeListItemFromItem(item, memberNames)),
		};
	}, [
		session.activeHousehold.name,
		session.services.items,
		session.services.lists,
		listId,
		memberNames,
	]);

	const addItem = useCallback(
		async (name: string): Promise<ActiveListItem> => {
			const item = await session.services.items.addItem({
				listId,
				userId: session.activeMember.userId,
				name,
			});
			return activeListItemFromItem(item, memberNames);
		},
		[session.activeMember.userId, session.services.items, listId, memberNames],
	);

	const setItemChecked = useCallback(
		async (itemId: string, checked: boolean) => {
			await session.services.items.setItemChecked({
				listId,
				itemId,
				userId: session.activeMember.userId,
				checked,
			});
		},
		[session.activeMember.userId, session.services.items, listId],
	);

	const actions = useMemo<HomeCurrentListActions>(
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
