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
} from "@/client/features/household/api";
import type {
	AuthenticatedAppSession,
	AuthenticatedAppSessionReloadOptions,
} from "@/client/session";
import {
	type UploadQueueMonitor,
	uploadQueueMonitor,
} from "@/client/session/upload-queue";
import { toast } from "@/client/ui/toast";

const UPLOAD_QUEUE_DRAIN_TIMEOUT_MS = 10_000;

export type HouseholdSettingsState =
	| { status: "loading" }
	| { status: "error"; message: string }
	| {
			status: "ready";
			members: HouseholdMember[];
			invitations: PendingInvitation[];
			joinCode: HouseholdJoinCode;
			renamedHouseholdName: string | null;
			operation: HouseholdSettingsOperation;
	  };

export type HouseholdSettingsOperation =
	| { status: "idle" }
	| { status: "renamingHousehold" }
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
	renameHousehold: (name: string) => Promise<boolean>;
	createInvitation: (email: string) => Promise<void>;
	revokeInvitation: (invitationId: string) => Promise<void>;
	removeMember: (membershipId: string) => Promise<void>;
	setMemberRole: (
		membershipId: string,
		role: "owner" | "member",
	) => Promise<void>;
	leaveHousehold: (options: LeaveHouseholdOptions) => Promise<void>;
	regenerateJoinCode: () => Promise<void>;
	setJoinCodeEnabled: (enabled: boolean) => Promise<void>;
	copyText: (text: string, confirmation: string) => Promise<void>;
};

export type LeaveHouseholdOptions = {
	confirmDiscardUnsyncedChanges: () => Promise<boolean>;
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
			renamedHouseholdName: string | null;
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
	| { type: "operationFinished"; loadKey: string }
	| {
			type: "invitationCreated";
			loadKey: string;
			response: CreateInvitationResponse;
			invitations: PendingInvitation[];
	  }
	| {
			type: "householdRenamed";
			loadKey: string;
			household: { id: string; name: string };
	  }
	| { type: "invitationRevoked"; loadKey: string; invitationId: string }
	| { type: "membersChanged"; loadKey: string; members: HouseholdMember[] }
	| { type: "joinCodeChanged"; loadKey: string; joinCode: HouseholdJoinCode };

export function useHouseholdSettings(
	session: AuthenticatedAppSession,
	clientProp?: HouseholdApiClient,
	reloadSession: (
		options?: AuthenticatedAppSessionReloadOptions,
	) => void = () => undefined,
	uploadQueue: UploadQueueMonitor = uploadQueueMonitor,
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
	const loadKey = session.activeHousehold.id;
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

	async function renameHousehold(name: string): Promise<boolean> {
		if (!startOperation({ status: "renamingHousehold" })) return false;
		try {
			const household = await resolveClient().renameHousehold({
				householdId,
				name,
			});
			dispatch({ type: "householdRenamed", loadKey, household });
			toast.success("Household renamed.");
			reloadSession({ mode: "freshOnly" });
			return true;
		} catch (error) {
			toast.error(messageFromError(error));
			dispatch({ type: "operationFinished", loadKey });
			return false;
		} finally {
			operationInFlightRef.current = false;
		}
	}

	async function createInvitation(email: string) {
		const normalizedEmail = normalizeInvitationEmail(email);
		// The form validates before calling, so an invalid address here is a
		// programming error, not something to report to the person inviting.
		if (!normalizedEmail) return;
		if (!startOperation({ status: "creatingInvitation" })) return;
		try {
			const client = resolveClient();
			const response = await client.createInvitation({
				householdId,
				email: normalizedEmail,
			});
			const invitations = await client.listInvitations(householdId);
			dispatch({ type: "invitationCreated", loadKey, response, invitations });
			reportInvitationCreated(response);
		} catch (error) {
			toast.error(messageFromError(error));
			dispatch({ type: "operationFinished", loadKey });
		} finally {
			operationInFlightRef.current = false;
		}
	}

	async function revokeInvitation(invitationId: string) {
		if (!startOperation({ status: "revokingInvitation", invitationId })) return;
		try {
			await resolveClient().revokeInvitation(invitationId);
			toast.success("Invitation revoked.");
			dispatch({ type: "invitationRevoked", loadKey, invitationId });
		} catch (error) {
			toast.error(messageFromError(error));
			dispatch({ type: "operationFinished", loadKey });
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
			toast.success("Member removed.");
			reloadSession();
		} catch (error) {
			toast.error(messageFromError(error));
			dispatch({ type: "operationFinished", loadKey });
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
			toast.success("Member role changed.");
			reloadSession();
		} catch (error) {
			toast.error(messageFromError(error));
			dispatch({ type: "operationFinished", loadKey });
		} finally {
			operationInFlightRef.current = false;
		}
	}

	async function leaveHousehold(options: LeaveHouseholdOptions) {
		if (!startOperation({ status: "leavingHousehold" })) return;
		try {
			const drainResult = await drainUploadQueueBeforeLeave(uploadQueue);
			if (drainResult === "blocked") {
				const confirmed = await options.confirmDiscardUnsyncedChanges();
				if (!confirmed) {
					dispatch({ type: "operationFinished", loadKey });
					return;
				}
			}
			await resolveClient().leaveHousehold(householdId);
			reloadSession({ mode: "retireCurrent" });
		} catch (error) {
			toast.error(messageFromError(error));
			dispatch({ type: "operationFinished", loadKey });
		} finally {
			operationInFlightRef.current = false;
		}
	}

	async function regenerateJoinCode() {
		if (!startOperation({ status: "regeneratingJoinCode" })) return;
		try {
			const joinCode = await resolveClient().regenerateJoinCode(householdId);
			dispatch({ type: "joinCodeChanged", loadKey, joinCode });
			toast.success("Household Join Code regenerated.");
		} catch (error) {
			toast.error(messageFromError(error));
			dispatch({ type: "operationFinished", loadKey });
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
			toast.success(
				enabled
					? "Household Join Code enabled."
					: "Household Join Code disabled.",
			);
		} catch (error) {
			toast.error(messageFromError(error));
			dispatch({ type: "operationFinished", loadKey });
		} finally {
			operationInFlightRef.current = false;
		}
	}

	async function copyText(text: string, confirmation: string) {
		if (!startOperation({ status: "copyingText" })) return;
		try {
			await Clipboard.setStringAsync(text);
			toast.success(confirmation);
		} catch {
			toast.error("Unable to copy. Please try again.");
		} finally {
			dispatch({ type: "operationFinished", loadKey });
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
			renameHousehold,
			createInvitation,
			revokeInvitation,
			removeMember,
			setMemberRole,
			leaveHousehold,
			regenerateJoinCode,
			setJoinCodeEnabled,
			copyText,
		},
	};
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
			status: "ready",
			loadKey: action.loadKey,
			attempt: action.attempt,
			members: action.members,
			invitations: action.invitations,
			joinCode: action.joinCode,
			renamedHouseholdName: null,
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
	if (action.type === "operationFinished") {
		return { ...state, operation: { status: "idle" } };
	}
	if (action.type === "invitationCreated") {
		return {
			...state,
			invitations: action.invitations,
			operation: { status: "idle" },
		};
	}
	if (action.type === "householdRenamed") {
		return {
			...state,
			renamedHouseholdName: action.household.name,
			operation: { status: "idle" },
		};
	}
	if (action.type === "invitationRevoked") {
		return {
			...state,
			invitations: state.invitations.filter(
				(invitation) => invitation.id !== action.invitationId,
			),
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
	return {
		status: "ready",
		members: resource.members,
		invitations: resource.invitations,
		joinCode: resource.joinCode,
		renamedHouseholdName: resource.renamedHouseholdName,
		operation: resource.operation,
	};
}

/** Invitations can succeed in several shapes, one of which is worth a warning. */
function reportInvitationCreated(response: CreateInvitationResponse): void {
	if (response.reusedExisting) {
		toast.success("Existing pending Invitation found.");
		return;
	}
	if (response.emailDelivery.status === "failed") {
		toast.warning("Invitation created, but email delivery failed.", {
			description: "Copy the link to share it.",
		});
		return;
	}
	toast.success(
		response.emailDelivery.status === "sent"
			? "Invitation emailed."
			: "Invitation link created.",
	);
}

type UploadQueueDrainResult = "drained" | "blocked";

async function drainUploadQueueBeforeLeave(
	uploadQueue: UploadQueueMonitor,
): Promise<UploadQueueDrainResult> {
	return waitForUploadQueueDrain(uploadQueue, UPLOAD_QUEUE_DRAIN_TIMEOUT_MS);
}

function waitForUploadQueueDrain(
	uploadQueue: UploadQueueMonitor,
	timeoutMs: number,
): Promise<UploadQueueDrainResult> {
	return new Promise((resolve) => {
		let settled = false;
		let unsubscribe: () => void = () => undefined;
		const timeout = setTimeout(() => settle("blocked"), timeoutMs);

		function settle(result: UploadQueueDrainResult) {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			unsubscribe();
			resolve(result);
		}

		async function checkQueue() {
			if (settled) return;
			try {
				// An empty queue is drained even while offline — there is nothing
				// left to lose, so the count check must precede the connectivity gate.
				const stats = await uploadQueue.getUploadQueueStats();
				if (settled) return;
				if (stats.count === 0) {
					settle("drained");
					return;
				}
				const state = uploadQueue.getUploadQueueState();
				if (!state.connected && !state.connecting) settle("blocked");
			} catch {
				settle("blocked");
			}
		}

		try {
			const subscribed = uploadQueue.subscribe(() => {
				void checkQueue();
			});
			if (settled) {
				subscribed();
			} else {
				unsubscribe = subscribed;
			}
			void checkQueue();
		} catch {
			settle("blocked");
		}
	});
}

function messageFromError(error: unknown): string {
	return error instanceof Error ? error.message : "Something went wrong.";
}

export function normalizeInvitationEmail(email: string): string | null {
	const normalized = email.trim().toLowerCase();
	return isInvitationEmail(normalized) ? normalized : null;
}

function isInvitationEmail(email: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
