import { useAuth } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { useMemo, useReducer } from "react";
import {
	createHouseholdApiClient,
	type HouseholdApiClient,
} from "@/lib/client-api/households";
import type { AuthenticatedAppSession } from "@/lib/services/session";

export type HouseholdSwitchState = {
	code: string;
	notice: string | null;
	working: "switch" | "join" | null;
};

type Action =
	| { type: "codeChanged"; code: string }
	| { type: "working"; working: HouseholdSwitchState["working"] }
	| { type: "notice"; notice: string | null };

export function useHouseholdSwitch(
	session: AuthenticatedAppSession,
	reloadSession: () => void,
	clientProp?: HouseholdApiClient,
): {
	state: HouseholdSwitchState;
	setCode: (code: string) => void;
	switchHousehold: (householdId: string) => Promise<void>;
	joinByCode: () => Promise<void>;
} {
	const { getToken } = useAuth();
	const router = useRouter();
	const client = useMemo(
		() => clientProp ?? createHouseholdApiClient({ getToken }),
		[clientProp, getToken],
	);
	const [state, dispatch] = useReducer(reducer, {
		code: "",
		notice: null,
		working: null,
	});

	async function switchHousehold(householdId: string) {
		if (householdId === session.activeHousehold.id) return;
		dispatch({ type: "working", working: "switch" });
		try {
			await session.services.sync.requestSync({ reason: "manualRefresh" });
		} catch {
			dispatch({
				type: "notice",
				notice: "Unable to sync this Household before switching. Try again.",
			});
			return;
		}

		try {
			await client.switchHousehold(householdId);
			reloadSession();
			router.replace("/");
		} catch (error) {
			dispatch({ type: "notice", notice: messageFromError(error) });
		}
	}

	async function joinByCode() {
		const code = state.code.trim();
		if (!code) {
			dispatch({ type: "notice", notice: "Enter a Household Join Code." });
			return;
		}
		dispatch({ type: "working", working: "join" });
		try {
			await client.joinByCode(code);
			reloadSession();
			router.replace("/");
		} catch (error) {
			dispatch({ type: "notice", notice: messageFromError(error) });
		}
	}

	return {
		state,
		setCode: (code) => dispatch({ type: "codeChanged", code }),
		switchHousehold,
		joinByCode,
	};
}

function reducer(
	state: HouseholdSwitchState,
	action: Action,
): HouseholdSwitchState {
	if (action.type === "codeChanged") return { ...state, code: action.code };
	if (action.type === "working") {
		return { ...state, working: action.working, notice: null };
	}
	return { ...state, working: null, notice: action.notice };
}

function messageFromError(error: unknown): string {
	return error instanceof Error ? error.message : "Something went wrong.";
}
