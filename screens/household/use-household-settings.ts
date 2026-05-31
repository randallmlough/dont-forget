import { useAuth } from "@clerk/clerk-expo";
import * as Clipboard from "expo-clipboard";
import { useEffect, useMemo, useReducer } from "react";
import {
	type CreateInvitationResponse,
	createHouseholdApiClient,
	type HouseholdApiClient,
	type HouseholdJoinCode,
	type HouseholdMember,
	type PendingInvitation,
} from "@/lib/client-api/households";
import type { AuthenticatedAppSession } from "@/lib/services/session";

export type HouseholdSettingsState =
	| { status: "loading" }
	| { status: "error"; message: string }
	| {
			status: "ready";
			members: HouseholdMember[];
			invitations: PendingInvitation[];
			joinCode: HouseholdJoinCode;
			notice: string | null;
			working: string | null;
	  };

export type HouseholdSettingsActions = {
	retry: () => void;
	createInvitation: (email: string) => Promise<void>;
	revokeInvitation: (invitationId: string) => Promise<void>;
	regenerateJoinCode: () => Promise<void>;
	setJoinCodeEnabled: (enabled: boolean) => Promise<void>;
	copyText: (text: string, notice: string) => Promise<void>;
	clearNotice: () => void;
};

type Resource =
	| { status: "loading"; loadKey: string; attempt: number }
	| { status: "error"; loadKey: string; attempt: number; message: string }
	| {
			status: "ready";
			loadKey: string;
			attempt: number;
			members: HouseholdMember[];
			invitations: PendingInvitation[];
			joinCode: HouseholdJoinCode;
			notice: string | null;
			working: string | null;
	  };

type Action =
	| { type: "retry"; loadKey: string }
	| {
			type: "loaded";
			loadKey: string;
			attempt: number;
			members: HouseholdMember[];
			invitations: PendingInvitation[];
			joinCode: HouseholdJoinCode;
	  }
	| { type: "failed"; loadKey: string; attempt: number; message: string }
	| { type: "working"; name: string }
	| { type: "notice"; notice: string | null }
	| {
			type: "invitationCreated";
			response: CreateInvitationResponse;
			invitations: PendingInvitation[];
	  }
	| { type: "invitationRevoked"; invitationId: string }
	| { type: "joinCodeChanged"; joinCode: HouseholdJoinCode };

export function useHouseholdSettings(
	session: AuthenticatedAppSession,
	clientProp?: HouseholdApiClient,
): { state: HouseholdSettingsState; actions: HouseholdSettingsActions } {
	const { getToken } = useAuth();
	const client = useMemo(
		() => clientProp ?? createHouseholdApiClient({ getToken }),
		[clientProp, getToken],
	);
	const loadKey = `${session.resourceKey}:${session.activeHousehold.id}`;
	const [resource, dispatch] = useReducer(reducer, loadKey, initialResource);
	const loadAttempt = resource.loadKey === loadKey ? resource.attempt : 0;
	const householdId = session.activeHousehold.id;

	useEffect(() => {
		let cancelled = false;

		Promise.all([
			client.listMembers(householdId),
			client.listInvitations(householdId),
			client.getJoinCode(householdId),
		])
			.then(([members, invitations, joinCode]) => {
				if (!cancelled) {
					dispatch({
						type: "loaded",
						loadKey,
						attempt: loadAttempt,
						members,
						invitations,
						joinCode,
					});
				}
			})
			.catch(() => {
				if (!cancelled) {
					dispatch({
						type: "failed",
						loadKey,
						attempt: loadAttempt,
						message: "Unable to load Household settings. Please try again.",
					});
				}
			});

		return () => {
			cancelled = true;
		};
	}, [client, householdId, loadAttempt, loadKey]);

	async function createInvitation(email: string) {
		dispatch({ type: "working", name: "createInvitation" });
		try {
			const response = await client.createInvitation({
				householdId,
				email: email.trim() || null,
			});
			const invitations = await client.listInvitations(householdId);
			dispatch({ type: "invitationCreated", response, invitations });
		} catch (error) {
			dispatch({ type: "notice", notice: messageFromError(error) });
		}
	}

	async function revokeInvitation(invitationId: string) {
		dispatch({ type: "working", name: `revoke:${invitationId}` });
		try {
			await client.revokeInvitation(invitationId);
			dispatch({ type: "invitationRevoked", invitationId });
		} catch (error) {
			dispatch({ type: "notice", notice: messageFromError(error) });
		}
	}

	async function regenerateJoinCode() {
		dispatch({ type: "working", name: "regenerateJoinCode" });
		try {
			const joinCode = await client.regenerateJoinCode(householdId);
			dispatch({ type: "joinCodeChanged", joinCode });
			dispatch({ type: "notice", notice: "Household Join Code regenerated." });
		} catch (error) {
			dispatch({ type: "notice", notice: messageFromError(error) });
		}
	}

	async function setJoinCodeEnabled(enabled: boolean) {
		dispatch({ type: "working", name: "setJoinCodeEnabled" });
		try {
			const joinCode = await client.setJoinCodeEnabled({
				householdId,
				enabled,
			});
			dispatch({ type: "joinCodeChanged", joinCode });
			dispatch({
				type: "notice",
				notice: enabled
					? "Household Join Code enabled."
					: "Household Join Code disabled.",
			});
		} catch (error) {
			dispatch({ type: "notice", notice: messageFromError(error) });
		}
	}

	async function copyText(text: string, notice: string) {
		dispatch({ type: "working", name: "copyText" });
		try {
			await Clipboard.setStringAsync(text);
			dispatch({ type: "notice", notice });
		} catch {
			dispatch({ type: "notice", notice: "Unable to copy. Please try again." });
		}
	}

	return {
		state: stateFromResource(resource, loadKey),
		actions: {
			retry: () => dispatch({ type: "retry", loadKey }),
			createInvitation,
			revokeInvitation,
			regenerateJoinCode,
			setJoinCodeEnabled,
			copyText,
			clearNotice: () => dispatch({ type: "notice", notice: null }),
		},
	};
}

function initialResource(loadKey: string): Resource {
	return { status: "loading", loadKey, attempt: 0 };
}

function reducer(state: Resource, action: Action): Resource {
	if (action.type === "retry") {
		return {
			status: "loading",
			loadKey: action.loadKey,
			attempt: state.loadKey === action.loadKey ? state.attempt + 1 : 0,
		};
	}

	if (
		(action.type === "loaded" || action.type === "failed") &&
		(state.loadKey !== action.loadKey || state.attempt !== action.attempt)
	) {
		return state;
	}

	if (action.type === "loaded") {
		return { ...action, status: "ready", notice: null, working: null };
	}
	if (action.type === "failed") {
		return {
			status: "error",
			loadKey: action.loadKey,
			attempt: action.attempt,
			message: action.message,
		};
	}
	if (state.status !== "ready") return state;
	if (action.type === "working") return { ...state, working: action.name };
	if (action.type === "notice") {
		return { ...state, notice: action.notice, working: null };
	}
	if (action.type === "invitationCreated") {
		return {
			...state,
			invitations: action.invitations,
			notice: invitationCreatedNotice(action.response),
			working: null,
		};
	}
	if (action.type === "invitationRevoked") {
		return {
			...state,
			invitations: state.invitations.filter(
				(invitation) => invitation.id !== action.invitationId,
			),
			notice: "Invitation revoked.",
			working: null,
		};
	}
	return { ...state, joinCode: action.joinCode, working: null };
}

function stateFromResource(
	resource: Resource,
	loadKey: string,
): HouseholdSettingsState {
	if (resource.loadKey !== loadKey || resource.status === "loading") {
		return { status: "loading" };
	}
	if (resource.status === "error") {
		return { status: "error", message: resource.message };
	}
	return resource;
}

function invitationCreatedNotice(response: CreateInvitationResponse): string {
	if (response.reusedExisting) return "Existing pending Invitation found.";
	if (response.emailDelivery.status === "failed") {
		return "Invitation created, but email delivery failed. Copy the link to share it.";
	}
	if (response.emailDelivery.status === "sent") return "Invitation emailed.";
	return "Invitation link created.";
}

function messageFromError(error: unknown): string {
	return error instanceof Error ? error.message : "Something went wrong.";
}
