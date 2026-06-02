import { useAuth } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { useMemo, useReducer } from "react";
import type { AuthenticatedAppSessionReloadOptions } from "@/components/session";
import {
	createHouseholdApiClient,
	type HouseholdApiClient,
} from "@/lib/client-api/households";
import type { AuthenticatedAppSession } from "@/lib/services/session";

export type HouseholdSwitchState = {
	code: string;
	notice: string | null;
	operation: HouseholdSwitchOperation;
};

export type HouseholdSwitchOperation =
	| { status: "idle" }
	| { status: "joiningByCode" }
	| { status: "switchingHousehold"; householdId: string };

type Action =
	| { type: "codeChanged"; code: string }
	| { type: "operationStarted"; operation: HouseholdSwitchOperation }
	| { type: "notice"; notice: string | null };

export function useHouseholdSwitch(
	session: AuthenticatedAppSession,
	reloadSession: (options?: AuthenticatedAppSessionReloadOptions) => void,
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
		const result = await switchActiveHouseholdWithSessionBoundary({
			session,
			householdId,
			client,
			reloadSession,
			navigateHome: () => router.replace("/"),
		});
		if (result.status === "failed") {
			dispatch({ type: "notice", notice: result.notice });
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
		try {
			await client.joinByCode(code);
			reloadSession({ activeHouseholdChanged: true });
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

export async function switchActiveHouseholdWithSessionBoundary({
	session,
	householdId,
	client,
	reloadSession,
	navigateHome,
}: {
	session: AuthenticatedAppSession;
	householdId: string;
	client: Pick<HouseholdApiClient, "switchHousehold">;
	reloadSession: (options?: AuthenticatedAppSessionReloadOptions) => void;
	navigateHome: () => void;
}): Promise<{ status: "switched" } | { status: "failed"; notice: string }> {
	try {
		const syncResult = await session.services.sync.requestSync({
			reason: "manualRefresh",
		});
		if (!syncResult) return syncBeforeSwitchFailure();
	} catch {
		return syncBeforeSwitchFailure();
	}

	try {
		await client.switchHousehold(householdId);
		reloadSession({ activeHouseholdChanged: true });
		navigateHome();
		return { status: "switched" };
	} catch (error) {
		return { status: "failed", notice: messageFromError(error) };
	}
}

function reducer(
	state: HouseholdSwitchState,
	action: Action,
): HouseholdSwitchState {
	if (action.type === "codeChanged") return { ...state, code: action.code };
	if (action.type === "operationStarted") {
		return { ...state, operation: action.operation, notice: null };
	}
	return { ...state, operation: { status: "idle" }, notice: action.notice };
}

function operationInProgress(operation: HouseholdSwitchOperation): boolean {
	return operation.status !== "idle";
}

function syncBeforeSwitchFailure(): { status: "failed"; notice: string } {
	return {
		status: "failed",
		notice: "Unable to sync this Household before switching. Try again.",
	};
}

function messageFromError(error: unknown): string {
	return error instanceof Error ? error.message : "Something went wrong.";
}
