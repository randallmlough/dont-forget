import { useAuth } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useReducer, useRef } from "react";
import {
	type AuthRedirectParams,
	authHrefWithIntent,
} from "@/client/features/auth/redirect-policy";
import {
	createHouseholdApiClient,
	type HouseholdApiClient,
	type HouseholdJoinCodePreview,
	type InvitationPreview,
} from "@/client/features/household/api";
import { JOIN_LINK_HOUSEHOLD_JOIN_CODE_SOURCE } from "@/shared/household-join-code-source";

type PublicEntryKind = "invitation" | "joinCode";

export type PublicHouseholdEntryState =
	| { status: "loading" }
	| { status: "unavailable"; message: string }
	| {
			status: "ready";
			kind: PublicEntryKind;
			householdName: string;
			inviterDisplayName?: string;
			working: boolean;
			error: string | null;
	  }
	| { status: "complete"; message: string };

type PublicHouseholdEntryResource =
	| { status: "loading"; entryKey: string }
	| { status: "unavailable"; entryKey: string; message: string }
	| {
			status: "ready";
			entryKey: string;
			kind: PublicEntryKind;
			householdName: string;
			inviterDisplayName?: string;
			working: boolean;
			error: string | null;
	  }
	| { status: "complete"; entryKey: string; message: string };

type Action =
	| {
			type: "loaded";
			entryKey: string;
			kind: PublicEntryKind;
			preview: InvitationPreview | HouseholdJoinCodePreview;
	  }
	| { type: "unavailable"; entryKey: string; message: string }
	| { type: "working"; entryKey: string }
	| { type: "failed"; entryKey: string; message: string }
	| { type: "complete"; entryKey: string; message: string };

export function usePublicHouseholdEntry({
	kind,
	secret,
	reloadSession,
	client: clientProp,
}: {
	kind: PublicEntryKind;
	secret: string | null;
	reloadSession: () => void;
	client?: HouseholdApiClient;
}): {
	state: PublicHouseholdEntryState;
	submit: () => Promise<void>;
} {
	const { getToken, isSignedIn } = useAuth();
	const router = useRouter();
	// Latest-ref pattern: the resolved client stays stable across getToken
	// identity changes (so the entry effect does not re-run) while always
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
	const entryKey = `${kind}:${secret ?? ""}`;
	const [resource, dispatch] = useReducer(reducer, {
		status: "loading",
		entryKey,
	});
	const state = stateFromResource(resource, entryKey);

	useEffect(() => {
		let cancelled = false;
		if (!secret) {
			dispatch({
				type: "unavailable",
				entryKey,
				message: unavailableMessage(kind),
			});
			return;
		}
		if (kind === "joinCode" && isSignedIn === undefined) {
			return;
		}
		if (kind === "joinCode" && isSignedIn === false) {
			dispatch({
				type: "loaded",
				entryKey,
				kind,
				preview: { available: true, householdName: "Household" },
			});
			return;
		}

		const client = resolveClient();
		const preview =
			kind === "invitation"
				? client.previewInvitation(secret)
				: client.previewJoinCode(secret);
		preview
			.then((preview) => {
				if (!cancelled) dispatch({ type: "loaded", entryKey, kind, preview });
			})
			.catch(() => {
				if (!cancelled) {
					dispatch({
						type: "unavailable",
						entryKey,
						message: unavailableMessage(kind),
					});
				}
			});

		return () => {
			cancelled = true;
		};
	}, [entryKey, isSignedIn, kind, resolveClient, secret]);

	async function submit() {
		if (!secret || state.status !== "ready") return;
		if (!isSignedIn) {
			router.push(authHrefWithIntent("/sign-in", intentParams(kind, secret)));
			return;
		}

		dispatch({ type: "working", entryKey });
		try {
			const client = resolveClient();
			if (kind === "invitation") {
				await client.acceptInvitation(secret);
			} else {
				await client.joinByCode(secret, JOIN_LINK_HOUSEHOLD_JOIN_CODE_SOURCE);
			}
			reloadSession();
			dispatch({ type: "complete", entryKey, message: "Household joined." });
			router.replace("/");
		} catch (error) {
			dispatch({
				type: "failed",
				entryKey,
				message: messageFromError(error),
			});
		}
	}

	return { state, submit };
}

function intentParams(
	kind: PublicEntryKind,
	secret: string,
): AuthRedirectParams {
	return kind === "invitation"
		? { next: "/invitations/accept", token: secret }
		: { next: "/households/join", code: secret };
}

function reducer(
	state: PublicHouseholdEntryResource,
	action: Action,
): PublicHouseholdEntryResource {
	if (action.type === "unavailable") {
		return {
			status: "unavailable",
			entryKey: action.entryKey,
			message: action.message,
		};
	}
	if (action.type === "loaded") {
		if (!action.preview.available) {
			return {
				status: "unavailable",
				entryKey: action.entryKey,
				message: unavailableMessage(action.kind),
			};
		}
		const inviterDisplayName =
			"inviterDisplayName" in action.preview
				? action.preview.inviterDisplayName
				: undefined;
		if (
			state.entryKey === action.entryKey &&
			state.status === "ready" &&
			state.kind === action.kind &&
			state.householdName === action.preview.householdName &&
			state.inviterDisplayName === inviterDisplayName &&
			state.working === false &&
			state.error === null
		) {
			return state;
		}
		return {
			status: "ready",
			entryKey: action.entryKey,
			kind: action.kind,
			householdName: action.preview.householdName,
			inviterDisplayName,
			working: false,
			error: null,
		};
	}
	if (state.entryKey !== action.entryKey) return state;
	if (action.type === "working" && state.status === "ready") {
		return { ...state, working: true, error: null };
	}
	if (action.type === "failed" && state.status === "ready") {
		return { ...state, working: false, error: action.message };
	}
	if (action.type === "complete") {
		return {
			status: "complete",
			entryKey: action.entryKey,
			message: action.message,
		};
	}
	return state;
}

function stateFromResource(
	resource: PublicHouseholdEntryResource,
	entryKey: string,
): PublicHouseholdEntryState {
	if (resource.entryKey !== entryKey) return { status: "loading" };
	if (resource.status === "loading") return { status: "loading" };
	if (resource.status === "unavailable") {
		return { status: "unavailable", message: resource.message };
	}
	if (resource.status === "complete") {
		return { status: "complete", message: resource.message };
	}
	return {
		status: "ready",
		kind: resource.kind,
		householdName: resource.householdName,
		inviterDisplayName: resource.inviterDisplayName,
		working: resource.working,
		error: resource.error,
	};
}

function unavailableMessage(kind: PublicEntryKind): string {
	return kind === "invitation"
		? "This Invitation is no longer available."
		: "This Household code is not available.";
}

function messageFromError(error: unknown): string {
	return error instanceof Error ? error.message : "Something went wrong.";
}
