import { asError } from "@/lib/errors";

export type SyncInterruptionReason =
	| "networkUnavailable"
	| "recoverableEngineFailure";

export class SyncInterruptedError extends Error {
	readonly reason: SyncInterruptionReason;
	readonly cause: Error;

	constructor(reason: SyncInterruptionReason, cause: unknown) {
		super(syncInterruptedMessage(reason));
		this.name = "SyncInterruptedError";
		this.reason = reason;
		this.cause = asError(cause);
	}
}

export function isSyncInterruptedError(
	error: unknown,
): error is SyncInterruptedError {
	return error instanceof SyncInterruptedError;
}

export function nativeSyncInterruptedError(
	error: unknown,
): SyncInterruptedError | null {
	if (hasNativeSyncErrorMessage(error, NETWORK_UNAVAILABLE_MESSAGES)) {
		return new SyncInterruptedError("networkUnavailable", error);
	}

	if (hasNativeSyncErrorMessage(error, RECOVERABLE_SYNC_ENGINE_MESSAGES)) {
		return new SyncInterruptedError("recoverableEngineFailure", error);
	}

	return null;
}

function hasNativeSyncErrorMessage(
	error: unknown,
	messages: string[],
): boolean {
	const normalizedMessage = asError(error).message.toLowerCase();
	return messages.some((message) => normalizedMessage.includes(message));
}

function syncInterruptedMessage(reason: SyncInterruptionReason): string {
	switch (reason) {
		case "networkUnavailable":
			return "Network unavailable during Household sync";
		case "recoverableEngineFailure":
			return "Recoverable Household sync engine failure";
	}
}

const NETWORK_UNAVAILABLE_MESSAGES = [
	"network request failed",
	"not connected to the internet",
	"network connection was lost",
	"internet connection appears to be offline",
	"could not connect to the server",
];

const RECOVERABLE_SYNC_ENGINE_MESSAGES = [
	"unable to checkpoint synced portion of wal",
];
