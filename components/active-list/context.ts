import { createContext, use } from "react";
import type {
	ActiveListActions,
	ActiveListMeta,
	ActiveListState,
} from "./types";

export type ActiveListContextValue = {
	state: ActiveListState;
	actions: ActiveListActions;
	meta: ActiveListMeta;
};

export const ActiveListContext = createContext<ActiveListContextValue | null>(
	null,
);

export function useActiveList(): ActiveListContextValue {
	const value = use(ActiveListContext);
	if (!value) {
		throw new Error("useActiveList must be used inside ActiveList.Provider");
	}
	return value;
}
