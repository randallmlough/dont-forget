import { useEffect, useState } from "react";
import type { ActiveHouseholdContentState } from "@/components/active-household";
import type { ActiveListInitialState } from "@/components/active-list";

type ReadyActiveHouseholdContent = Extract<
	ActiveHouseholdContentState,
	{ status: "ready" }
>;

export type CurrentListLoadState =
	| { status: "loading"; retryAttempt: number }
	| { status: "error"; message: string }
	| { status: "ready"; initialList: ActiveListInitialState };

export function useCurrentListLoad(content: ReadyActiveHouseholdContent): {
	state: CurrentListLoadState;
	retry: () => void;
} {
	const [state, setState] = useState<CurrentListLoadState>({
		status: "loading",
		retryAttempt: 0,
	});
	const [retryAttempt, setRetryAttempt] = useState(0);

	useEffect(() => {
		let cancelled = false;
		setState({ status: "loading", retryAttempt });

		content.dataSource
			.load()
			.then((initialList) => {
				if (!cancelled) setState({ status: "ready", initialList });
			})
			.catch(() => {
				if (!cancelled) {
					setState({
						status: "error",
						message: "Unable to load your Current List. Please try again.",
					});
				}
			});

		return () => {
			cancelled = true;
		};
	}, [content.dataSource, retryAttempt]);

	return {
		state,
		retry: () => setRetryAttempt((attempt) => attempt + 1),
	};
}
