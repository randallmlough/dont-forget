import { useAuth } from "@clerk/clerk-expo";
import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useReducer, useRef } from "react";
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
			operation: HouseholdSettingsOperation;
	  };

export type HouseholdSettingsOperation =
	| { status: "idle" }
	| { status: "creatingInvitation" }
	| { status: "revokingInvitation"; invitationId: string }
	| { status: "removingMember"; membershipId: string }
	| { status: "changingRole"; membershipId: string }
	| { status: "leavingHousehold" }
	| { status: "regeneratingJoinCode" }
	| { status: "settingJoinCodeEnabled" }
	| { status: "copyingText" };

export type HouseholdSettingsActions = {
	retry: () => void;
	createInvitation: (email: string) => Promise<void>;
	revokeInvitation: (invitationId: string) => Promise<void>;
	removeMember: (membershipId: string) => Promise<void>;
	setMemberRole: (
		membershipId: string,
		role: "owner" | "member",
	) => Promise<void>;
	leaveHousehold: () => Promise<void>;
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
			operation: HouseholdSettingsOperation;
	  };

type Action =
	| { type: "loadStarted"; loadKey: string; attempt: number }
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
	| {
			type: "operationStarted";
			loadKey: string;
			operation: HouseholdSettingsOperation;
	  }
	| { type: "notice"; loadKey: string; notice: string | null }
	| {
			type: "invitationCreated";
			loadKey: string;
			response: CreateInvitationResponse;
			invitations: PendingInvitation[];
	  }
	| { type: "invitationRevoked"; loadKey: string; invitationId: string }
	| { type: "membersChanged"; loadKey: string; members: HouseholdMember[] }
	| { type: "joinCodeChanged"; loadKey: string; joinCode: HouseholdJoinCode };

export function useHouseholdSettings(
	session: AuthenticatedAppSession,
	clientProp?: HouseholdApiClient,
	reloadSession: (options?: { retireCurrent?: boolean }) => void = () =>
		undefined,
): { state: HouseholdSettingsState; actions: HouseholdSettingsActions } {
	const { getToken } = useAuth();
	// Latest-ref pattern: the resolved client stays stable across getToken
	// identity changes (so the load effect does not refetch) while always
	// calling the most recent token callback. Resolution happens in effects
	// and event handlers because react-hooks/refs forbids creating the
	// token-forwarding closure during render.
	const getTokenRef = useRef(getToken);
	const defaultClientRef = useRef<HouseholdApiClient | null>(null);
	useEffect(() => {
		getTokenRef.current = getToken;
	}, [getToken]);
	const resolveClient = useCallback((): HouseholdApiClient => {
		if (clientProp) return clientProp;
		defaultClientRef.current ??= createHouseholdApiClient({
			getToken: () => getTokenRef.current(),
		});
		return defaultClientRef.current;
	}, [clientProp]);
	const loadKey = `${session.resourceKey}:${session.activeHousehold.id}`;
	const [resource, dispatch] = useReducer(reducer, loadKey, initialResource);
	const operationInFlightRef = useRef(false);
	const loadAttempt = resource.loadKey === loadKey ? resource.attempt : 0;
	const householdId = session.activeHousehold.id;

	useEffect(() => {
		let cancelled = false;
		const client = resolveClient();
		dispatch({ type: "loadStarted", loadKey, attempt: loadAttempt });

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
	}, [householdId, loadAttempt, loadKey, resolveClient]);

	async function createInvitation(email: string) {
		const normalizedEmail = normalizeInvitationEmailInput(email);
		if (!normalizedEmail) {
			dispatch({
				type: "notice",
				loadKey,
				notice: "Enter a valid email address.",
			});
			return;
		}
		if (!startOperation({ status: "creatingInvitation" })) return;
		try {
			const client = resolveClient();
			const response = await client.createInvitation({
				householdId,
				email: normalizedEmail,
			});
			const invitations = await client.listInvitations(householdId);
			dispatch({ type: "invitationCreated", loadKey, response, invitations });
		} catch (error) {
			dispatch({ type: "notice", loadKey, notice: messageFromError(error) });
		} finally {
			operationInFlightRef.current = false;
		}
	}

	async function revokeInvitation(invitationId: string) {
		if (!startOperation({ status: "revokingInvitation", invitationId })) return;
		try {
			await resolveClient().revokeInvitation(invitationId);
			dispatch({ type: "invitationRevoked", loadKey, invitationId });
		} catch (error) {
			dispatch({ type: "notice", loadKey, notice: messageFromError(error) });
		} finally {
			operationInFlightRef.current = false;
		}
	}

	async function removeMember(membershipId: string) {
		if (!startOperation({ status: "removingMember", membershipId })) return;
		try {
			const client = resolveClient();
			await client.removeMember({ householdId, membershipId });
			const members = await client.listMembers(householdId);
			dispatch({ type: "membersChanged", loadKey, members });
			dispatch({ type: "notice", loadKey, notice: "Member removed." });
			reloadSession();
		} catch (error) {
			dispatch({ type: "notice", loadKey, notice: messageFromError(error) });
		} finally {
			operationInFlightRef.current = false;
		}
	}

	async function setMemberRole(membershipId: string, role: "owner" | "member") {
		if (!startOperation({ status: "changingRole", membershipId })) return;
		try {
			const client = resolveClient();
			await client.setMemberRole({ householdId, membershipId, role });
			const members = await client.listMembers(householdId);
			dispatch({ type: "membersChanged", loadKey, members });
			dispatch({ type: "notice", loadKey, notice: "Member role changed." });
			reloadSession();
		} catch (error) {
			dispatch({ type: "notice", loadKey, notice: messageFromError(error) });
		} finally {
			operationInFlightRef.current = false;
		}
	}

	async function leaveHousehold() {
		if (!startOperation({ status: "leavingHousehold" })) return;
		try {
			if (!(await syncCurrentHousehold(session))) {
				dispatch({
					type: "notice",
					loadKey,
					notice: "Unable to sync this Household before leaving. Try again.",
				});
				return;
			}
			await resolveClient().leaveHousehold(householdId);
			reloadSession({ retireCurrent: true });
		} catch (error) {
			dispatch({ type: "notice", loadKey, notice: messageFromError(error) });
		} finally {
			operationInFlightRef.current = false;
		}
	}

	async function regenerateJoinCode() {
		if (!startOperation({ status: "regeneratingJoinCode" })) return;
		try {
			const joinCode = await resolveClient().regenerateJoinCode(householdId);
			dispatch({ type: "joinCodeChanged", loadKey, joinCode });
			dispatch({
				type: "notice",
				loadKey,
				notice: "Household Join Code regenerated.",
			});
		} catch (error) {
			dispatch({ type: "notice", loadKey, notice: messageFromError(error) });
		} finally {
			operationInFlightRef.current = false;
		}
	}

	async function setJoinCodeEnabled(enabled: boolean) {
		if (!startOperation({ status: "settingJoinCodeEnabled" })) return;
		try {
			const joinCode = await resolveClient().setJoinCodeEnabled({
				householdId,
				enabled,
			});
			dispatch({ type: "joinCodeChanged", loadKey, joinCode });
			dispatch({
				type: "notice",
				loadKey,
				notice: enabled
					? "Household Join Code enabled."
					: "Household Join Code disabled.",
			});
		} catch (error) {
			dispatch({ type: "notice", loadKey, notice: messageFromError(error) });
		} finally {
			operationInFlightRef.current = false;
		}
	}

	async function copyText(text: string, notice: string) {
		if (!startOperation({ status: "copyingText" })) return;
		try {
			await Clipboard.setStringAsync(text);
			dispatch({ type: "notice", loadKey, notice });
		} catch {
			dispatch({
				type: "notice",
				loadKey,
				notice: "Unable to copy. Please try again.",
			});
		} finally {
			operationInFlightRef.current = false;
		}
	}

	function startOperation(operation: HouseholdSettingsOperation): boolean {
		if (operationInFlightRef.current) return false;
		if (resource.status !== "ready" || resource.loadKey !== loadKey) {
			return false;
		}
		if (resource.operation.status !== "idle") {
			return false;
		}

		operationInFlightRef.current = true;
		dispatch({ type: "operationStarted", loadKey, operation });
		return true;
	}

	return {
		state: stateFromResource(resource, loadKey),
		actions: {
			retry: () => dispatch({ type: "retry", loadKey }),
			createInvitation,
			revokeInvitation,
			removeMember,
			setMemberRole,
			leaveHousehold,
			regenerateJoinCode,
			setJoinCodeEnabled,
			copyText,
			clearNotice: () => dispatch({ type: "notice", loadKey, notice: null }),
		},
	};
}

async function syncCurrentHousehold(
	session: AuthenticatedAppSession,
): Promise<boolean> {
	try {
		const syncResult = await session.services.sync.requestSync({
			reason: "manualRefresh",
		});
		return Boolean(syncResult);
	} catch {
		return false;
	}
}

function initialResource(loadKey: string): Resource {
	return { status: "loading", loadKey, attempt: 0 };
}

function reducer(state: Resource, action: Action): Resource {
	if (action.type === "loadStarted") {
		return {
			status: "loading",
			loadKey: action.loadKey,
			attempt: action.attempt,
		};
	}

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
		return {
			...action,
			status: "ready",
			notice: null,
			operation: { status: "idle" },
		};
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
	if (state.loadKey !== action.loadKey) return state;
	if (action.type === "operationStarted") {
		return { ...state, operation: action.operation };
	}
	if (action.type === "notice") {
		return { ...state, notice: action.notice, operation: { status: "idle" } };
	}
	if (action.type === "invitationCreated") {
		return {
			...state,
			invitations: action.invitations,
			notice: invitationCreatedNotice(action.response),
			operation: { status: "idle" },
		};
	}
	if (action.type === "invitationRevoked") {
		return {
			...state,
			invitations: state.invitations.filter(
				(invitation) => invitation.id !== action.invitationId,
			),
			notice: "Invitation revoked.",
			operation: { status: "idle" },
		};
	}
	if (action.type === "membersChanged") {
		return { ...state, members: action.members, operation: { status: "idle" } };
	}
	return { ...state, joinCode: action.joinCode, operation: { status: "idle" } };
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

function normalizeInvitationEmailInput(email: string): string | null {
	const normalized = email.trim().toLowerCase();
	return isInvitationEmail(normalized) ? normalized : null;
}

function isInvitationEmail(email: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
