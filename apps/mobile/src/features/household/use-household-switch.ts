import { useAuth } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { useMemo, useReducer } from "react";
import {
	createHouseholdApiClient,
	type HouseholdApiClient,
} from "@mobile/features/household/api";
import { track } from "@mobile/lib/analytics";
import type {
	AuthenticatedAppSession,
	AuthenticatedAppSessionReloadOptions,
} from "@mobile/session";
import { toast } from "@mobile/ui/toast";

export type HouseholdSwitchState = {
	code: string;
	householdName: string;
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
	| { type: "operationFailed" };

export function useHouseholdSwitch(
	session: AuthenticatedAppSession,
	reloadSession: (options?: AuthenticatedAppSessionReloadOptions) => void,
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

		try {
			await client.switchHousehold(householdId);
			finishHouseholdChange(reloadSession, router);
		} catch (error) {
			toast.error(messageFromError(error));
			dispatch({ type: "operationFailed" });
		}
	}

	async function createHousehold() {
		if (operationInProgress(state.operation)) return;
		dispatch({
			type: "operationStarted",
			operation: { status: "creatingHousehold" },
		});

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
			toast.error(messageFromError(error));
			dispatch({ type: "operationFailed" });
		}
	}

	async function joinByCode() {
		if (operationInProgress(state.operation)) return;
		// The form validates before calling, so an empty code cannot reach here.
		const code = state.code.trim();
		if (!code) return;
		dispatch({
			type: "operationStarted",
			operation: { status: "joiningByCode" },
		});

		try {
			await client.joinByCode(code);
			finishHouseholdChange(reloadSession, router);
		} catch (error) {
			toast.error(messageFromError(error));
			dispatch({ type: "operationFailed" });
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
		return { ...state, operation: action.operation };
	}
	return { ...state, operation: { status: "idle" } };
}

function operationInProgress(operation: HouseholdSwitchOperation): boolean {
	return operation.status !== "idle";
}

function messageFromError(error: unknown): string {
	return error instanceof Error ? error.message : "Something went wrong.";
}

function finishHouseholdChange(
	reloadSession: (options?: AuthenticatedAppSessionReloadOptions) => void,
	router: ReturnType<typeof useRouter>,
): void {
	reloadSession({ mode: "retireCurrent" });
	router.replace("/");
}
