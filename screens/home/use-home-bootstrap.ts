import { useEffect, useEffectEvent, useState } from "react";

import type {
	ActiveListDataAdapter,
	ActiveListInitialState,
} from "@/components/active-list";
import { createRemoteActiveListAdapter } from "@/lib/app/active-list-adapter";
import { bootstrapWithClerk } from "@/lib/app/bootstrap-client";

export type HomeContentState =
	| { status: "loading" }
	| { status: "error"; message: string }
	| {
			status: "ready";
			activeMemberName: string;
			initialList: ActiveListInitialState;
			adapter: ActiveListDataAdapter;
	  };

export type UseHomeBootstrapParams = {
	isAuthLoaded: boolean;
	isSignedIn: boolean | undefined;
	getToken: () => Promise<string | null>;
};

export type UseHomeBootstrapResult = {
	state: HomeContentState;
	actions: {
		retry: () => void;
	};
};

export function useHomeBootstrap({
	isAuthLoaded,
	isSignedIn,
	getToken,
}: UseHomeBootstrapParams): UseHomeBootstrapResult {
	const [state, setState] = useState<HomeContentState>({ status: "loading" });
	const [loadAttempt, setLoadAttempt] = useState(0);
	const getSessionToken = useEffectEvent(() => getToken());

	// biome-ignore lint/correctness/useExhaustiveDependencies: getSessionToken is a non-reactive Effect Event; auth state and loadAttempt own retriggering.
	useEffect(() => {
		if (!isAuthLoaded || !isSignedIn) return;

		let cancelled = false;
		let handedOffAdapter = false;
		let adapter: ActiveListDataAdapter | null = null;

		async function closeUnclaimedAdapter() {
			if (handedOffAdapter || !adapter) return;

			const current = adapter;
			adapter = null;
			await current.close();
		}

		setState({ status: "loading" });

		async function loadHome() {
			try {
				const bootstrap = await bootstrapWithClerk(getSessionToken);
				if (cancelled) return;

				adapter = createRemoteActiveListAdapter({
					household: bootstrap.activeHousehold,
					list: bootstrap.activeList,
					currentUser: bootstrap.user,
					members: bootstrap.members,
					database: bootstrap.householdDatabase,
				});
				const initialList = await adapter.load();

				if (cancelled) {
					await closeUnclaimedAdapter();
					return;
				}

				const activeMemberName =
					bootstrap.activeMember.displayName ??
					bootstrap.user.email ??
					"Member";
				handedOffAdapter = true;
				setState({ status: "ready", activeMemberName, initialList, adapter });
			} catch {
				await closeUnclaimedAdapter().catch(() => undefined);
				if (!cancelled) {
					setState({
						status: "error",
						message: "Unable to prepare your Household. Please try again.",
					});
				}
			}
		}

		void loadHome();

		return () => {
			cancelled = true;
			void closeUnclaimedAdapter().catch(() => undefined);
		};
	}, [isAuthLoaded, isSignedIn, loadAttempt]);

	function retry() {
		setLoadAttempt((attempt) => attempt + 1);
	}

	return { state, actions: { retry } };
}
