export type AppIdPrefix =
	| "usr"
	| "hh"
	| "mbr"
	| "inv"
	| "hjc"
	| "hjcu"
	| "lst"
	| "itm"
	| "chk";

export type RandomUuid = () => string;

export function createAppId(
	prefix: AppIdPrefix,
	randomUuid: RandomUuid = defaultRandomUuid,
): string {
	return `${prefix}_${randomUuid().toLowerCase()}`;
}

function defaultRandomUuid(): string {
	const randomUuid = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
	if (!randomUuid) {
		throw new Error("crypto.randomUUID is not available in this runtime");
	}

	return randomUuid();
}
