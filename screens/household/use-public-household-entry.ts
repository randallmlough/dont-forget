import { useAuth } from "@clerk/clerk-expo";
import { useEffect, useMemo, useReducer } from "react";
import {
	createHouseholdApiClient,
	type HouseholdApiClient,
	type HouseholdJoinCodePreview,
	type InvitationPreview,
} from "@/lib/client-api/households";

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

type Action =
	| { type: "loaded"; preview: InvitationPreview | HouseholdJoinCodePreview }
	| { type: "unavailable"; message: string }
	| { type: "working" }
	| { type: "failed"; message: string }
	| { type: "complete"; message: string };

export function usePublicHouseholdEntry({
	kind,
	secret,
	client: clientProp,
}: {
	kind: PublicEntryKind;
	secret: string | null;
	client?: HouseholdApiClient;
}): {
	state: PublicHouseholdEntryState;
	submit: () => Promise<void>;
} {
	const { getToken } = useAuth();
	const client = useMemo(
		() => clientProp ?? createHouseholdApiClient({ getToken }),
		[clientProp, getToken],
	);
	const [state, dispatch] = useReducer(reducer(kind), { status: "loading" });

	useEffect(() => {
		let cancelled = false;
		if (!secret) {
			dispatch({ type: "unavailable", message: unavailableMessage(kind) });
			return;
		}

		const preview =
			kind === "invitation"
				? client.previewInvitation(secret)
				: client.previewJoinCode(secret);
		preview
			.then((preview) => {
				if (!cancelled) dispatch({ type: "loaded", preview });
			})
			.catch(() => {
				if (!cancelled) {
					dispatch({ type: "unavailable", message: unavailableMessage(kind) });
				}
			});

		return () => {
			cancelled = true;
		};
	}, [client, kind, secret]);

	async function submit() {
		if (!secret || state.status !== "ready") return;
		dispatch({ type: "working" });
		try {
			if (kind === "invitation") {
				await client.acceptInvitation(secret);
			} else {
				await client.joinByCode(secret);
			}
			dispatch({ type: "complete", message: "Household joined." });
		} catch (error) {
			dispatch({ type: "failed", message: messageFromError(error) });
		}
	}

	return { state, submit };
}

function reducer(kind: PublicEntryKind) {
	return (
		state: PublicHouseholdEntryState,
		action: Action,
	): PublicHouseholdEntryState => {
		if (action.type === "unavailable") {
			return { status: "unavailable", message: action.message };
		}
		if (action.type === "loaded") {
			if (!action.preview.available) {
				return { status: "unavailable", message: unavailableMessage(kind) };
			}
			return {
				status: "ready",
				kind,
				householdName: action.preview.householdName,
				inviterDisplayName:
					"inviterDisplayName" in action.preview
						? action.preview.inviterDisplayName
						: undefined,
				working: false,
				error: null,
			};
		}
		if (action.type === "working" && state.status === "ready") {
			return { ...state, working: true, error: null };
		}
		if (action.type === "failed" && state.status === "ready") {
			return { ...state, working: false, error: action.message };
		}
		if (action.type === "complete") {
			return { status: "complete", message: action.message };
		}
		return state;
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
