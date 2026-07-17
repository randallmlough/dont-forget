import { useCallback, useRef } from "react";
import { setCurrentListSelection } from "@/client/features/list/current-selection";
import { track } from "@/client/lib/analytics";
import type { AuthenticatedAppSession } from "@/client/session";

/**
 * Shared Current List switch flow for the quick-list chips and the Home List
 * switcher: persists the explicit local selection, then emits `list_switched`
 * only after persistence succeeds. Resolves false — emitting nothing and
 * changing nothing — for a current-List tap, a still-running switch, or a
 * persistence failure.
 */
export function useSelectList(session: AuthenticatedAppSession) {
	const switchingRef = useRef(false);
	const userId = session.activeMember.userId;
	const householdId = session.activeHousehold.id;

	return useCallback(
		async (listId: string, currentListId: string | null): Promise<boolean> => {
			if (listId === currentListId || switchingRef.current) return false;
			switchingRef.current = true;
			try {
				await setCurrentListSelection(userId, householdId, listId);
			} catch {
				switchingRef.current = false;
				return false;
			}
			track("list_switched", {
				household_id: householdId,
				list_id: listId,
				user_id: userId,
			});
			switchingRef.current = false;
			return true;
		},
		[householdId, userId],
	);
}
