import { useAuth } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { type Dispatch, useMemo, useReducer } from "react";
import { track } from "@/lib/analytics";
import {
	createHouseholdApiClient,
	type HouseholdApiClient,
} from "@/lib/client-api/households";
import type { AuthenticatedAppSession } from "@/lib/services/session";

export type HouseholdSwitchState = {
	code: string;
	householdName: string;
	notice: string | null;
	operation: HouseholdSwitchOperation;
};

export type HouseholdSwitchOperation =
	| { status: "idle" }
	| { status: "creatingHousehold" }
	| { status: "joiningByCode" }
	| { status: "switchingHousehold"; householdId: string };

type Action =
	| { type: "codeChanged"; code: string }
	| { type: "householdNameChanged"; householdName: string }
	| { type: "operationStarted"; operation: HouseholdSwitchOperation }
	| { type: "notice"; notice: string | null };

export function useHouseholdSwitch(
	session: AuthenticatedAppSession,
	reloadSession: (options?: { retireCurrent?: boolean }) => void,
	clientProp?: HouseholdApiClient,
): {
	state: HouseholdSwitchState;
	setCode: (code: string) => void;
	setHouseholdName: (name: string) => void;
	createHousehold: () => Promise<void>;
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
		householdName: "",
		notice: null,
		operation: { status: "idle" },
	});

	async function switchHousehold(householdId: string) {
		if (
			householdId === session.activeHousehold.id ||
			operationInProgress(state.operation)
		) {
			return;
		}
		dispatch({
			type: "operationStarted",
			operation: { status: "switchingHousehold", householdId },
		});
		const synced = await syncCurrentHousehold(
			session,
			"Unable to sync this Household before switching. Try again.",
			dispatch,
		);
		if (!synced) {
			return;
		}

		try {
			await client.switchHousehold(householdId);
			finishHouseholdChange(reloadSession, router);
		} catch (error) {
			dispatch({ type: "notice", notice: messageFromError(error) });
		}
	}

	async function createHousehold() {
		if (operationInProgress(state.operation)) return;
		dispatch({
			type: "operationStarted",
			operation: { status: "creatingHousehold" },
		});
		const synced = await syncCurrentHousehold(
			session,
			"Unable to sync this Household before creating a new Household. Try again.",
			dispatch,
		);
		if (!synced) {
			return;
		}

		try {
			const household = await client.createHousehold({
				name: state.householdName.trim() || undefined,
			});
			track("household_created", {
				household_id: household.id,
				created_by_user_id: session.user.id,
				source: "manual",
			});
			finishHouseholdChange(reloadSession, router);
		} catch (error) {
			dispatch({ type: "notice", notice: messageFromError(error) });
		}
	}

	async function joinByCode() {
		if (operationInProgress(state.operation)) return;
		const code = state.code.trim();
		if (!code) {
			dispatch({ type: "notice", notice: "Enter a Household Join Code." });
			return;
		}
		dispatch({
			type: "operationStarted",
			operation: { status: "joiningByCode" },
		});
		const synced = await syncCurrentHousehold(
			session,
			"Unable to sync this Household before joining. Try again.",
			dispatch,
		);
		if (!synced) {
			return;
		}

		try {
			await client.joinByCode(code);
			finishHouseholdChange(reloadSession, router);
		} catch (error) {
			dispatch({ type: "notice", notice: messageFromError(error) });
		}
	}

	return {
		state,
		setCode: (code) => dispatch({ type: "codeChanged", code }),
		setHouseholdName: (householdName) =>
			dispatch({ type: "householdNameChanged", householdName }),
		createHousehold,
		switchHousehold,
		joinByCode,
	};
}

function reducer(
	state: HouseholdSwitchState,
	action: Action,
): HouseholdSwitchState {
	if (action.type === "codeChanged") return { ...state, code: action.code };
	if (action.type === "householdNameChanged") {
		return { ...state, householdName: action.householdName };
	}
	if (action.type === "operationStarted") {
		return { ...state, operation: action.operation, notice: null };
	}
	return { ...state, operation: { status: "idle" }, notice: action.notice };
}

function operationInProgress(operation: HouseholdSwitchOperation): boolean {
	return operation.status !== "idle";
}

async function syncCurrentHousehold(
	session: AuthenticatedAppSession,
	failureNotice: string,
	dispatch: Dispatch<Action>,
): Promise<boolean> {
	try {
		const syncResult = await session.services.sync.requestSync({
			reason: "manualRefresh",
		});
		if (syncResult) return true;
	} catch {
		// User-facing notice below covers sync start and sync failure cases.
	}
	dispatch({ type: "notice", notice: failureNotice });
	return false;
}

function messageFromError(error: unknown): string {
	return error instanceof Error ? error.message : "Something went wrong.";
}

function finishHouseholdChange(
	reloadSession: (options?: { retireCurrent?: boolean }) => void,
	router: ReturnType<typeof useRouter>,
): void {
	reloadSession({ retireCurrent: true });
	router.replace("/");
}
