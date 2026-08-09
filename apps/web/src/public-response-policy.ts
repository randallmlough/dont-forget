import {
	APPLE_APP_SITE_ASSOCIATION_PATH,
	PUBLIC_ENTRY_PATHS,
} from "@dont-forget/shared";

export type PublicWebResponseHeaders =
	| { "Content-Type": "application/json" }
	| {
			"Cache-Control": "no-store, no-transform";
			"Referrer-Policy": "no-referrer";
	  };

const AASA_HEADERS = {
	"Content-Type": "application/json",
} satisfies PublicWebResponseHeaders;

const SENSITIVE_PAGE_HEADERS = {
	"Cache-Control": "no-store, no-transform",
	"Referrer-Policy": "no-referrer",
} satisfies PublicWebResponseHeaders;

export function headersForPublicWebRequest(
	requestUrl: string,
): PublicWebResponseHeaders | undefined {
	const pathname = new URL(requestUrl, "http://local.invalid").pathname;

	if (pathname === APPLE_APP_SITE_ASSOCIATION_PATH) {
		return AASA_HEADERS;
	}

	if (PUBLIC_ENTRY_PATHS.some((path) => pathname === path)) {
		return SENSITIVE_PAGE_HEADERS;
	}

	return undefined;
}
