export function asError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

export function isNetworkUnavailableError(error: unknown): boolean {
	const normalizedMessage = asError(error).message.toLowerCase();
	return NETWORK_UNAVAILABLE_MESSAGES.some((message) =>
		normalizedMessage.includes(message),
	);
}

export function isExpectedSyncInterruptionError(error: unknown): boolean {
	return (
		isNetworkUnavailableError(error) || isRecoverableSyncEngineError(error)
	);
}

const NETWORK_UNAVAILABLE_MESSAGES = [
	"network request failed",
	"not connected to the internet",
	"network connection was lost",
	"internet connection appears to be offline",
	"could not connect to the server",
	"offline",
];

function isRecoverableSyncEngineError(error: unknown): boolean {
	const normalizedMessage = asError(error).message.toLowerCase();
	return RECOVERABLE_SYNC_ENGINE_MESSAGES.some((message) =>
		normalizedMessage.includes(message),
	);
}

const RECOVERABLE_SYNC_ENGINE_MESSAGES = [
	"unable to checkpoint synced portion of wal",
];
