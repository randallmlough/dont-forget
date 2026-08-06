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

	if (pathname === "/.well-known/apple-app-site-association") {
		return AASA_HEADERS;
	}

	if (pathname === "/invitations/accept" || pathname === "/households/join") {
		return SENSITIVE_PAGE_HEADERS;
	}

	return undefined;
}
