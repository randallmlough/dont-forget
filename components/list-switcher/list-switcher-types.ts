import type { ListSummary } from "@/lib/services/list";

export type ListSwitcherSegment = "active" | "archived";

export type ListSwitcherListState =
	| { status: "idle"; lists: ListSummary[] }
	| { status: "loading"; lists: ListSummary[] }
	| { status: "ready"; lists: ListSummary[] }
	| { status: "error"; lists: ListSummary[] };
