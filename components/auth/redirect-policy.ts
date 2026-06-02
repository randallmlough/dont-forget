import type { Href } from "expo-router";
import { isSensitiveAttributeKey } from "@/lib/redact";

export type AuthRedirectParams = Record<string, string | string[] | undefined>;

export type AuthRedirectInput = {
	pathname: string;
	params?: AuthRedirectParams;
	isSignedIn: boolean;
	isAuthLoaded: boolean;
	checkedCachedSession: boolean;
	hasCachedSession: boolean;
};

export const AUTH_PATHS = new Set(["/sign-in", "/sign-up"]);
export const PUBLIC_AUTH_PRESERVING_PATHS = new Set([
	"/invitations/accept",
	"/households/join",
]);

export function authRedirectTarget({
	pathname,
	params = {},
	isSignedIn,
	isAuthLoaded,
	checkedCachedSession,
	hasCachedSession,
}: AuthRedirectInput): Href | null {
	const onAuthPath = AUTH_PATHS.has(pathname);

	if (isSignedIn) {
		return onAuthPath ? signedInAuthPathTarget(params) : null;
	}

	if (!checkedCachedSession) return null;

	if (hasCachedSession) {
		return onAuthPath ? "/" : null;
	}

	if (PUBLIC_AUTH_PRESERVING_PATHS.has(pathname)) return null;

	if (!isAuthLoaded || onAuthPath) return null;

	return pathname === "/" ? "/sign-in" : signInTarget(pathname, {});
}

export function internalNextPath(value: unknown): string | null {
	const next = firstString(value);
	if (!next) return null;
	if (!next.startsWith("/") || next.startsWith("//")) return null;
	if (next.includes(":")) return null;
	const parsed = parseInternalPath(next);
	if (!parsed) return null;
	if (AUTH_PATHS.has(parsed.pathname)) return null;
	const search = safeSearchParams(parsed.searchParams).toString();
	return search ? `${parsed.pathname}?${search}` : parsed.pathname;
}

export function authHrefWithIntent(
	pathname: "/sign-in" | "/sign-up",
	params: AuthRedirectParams,
): Href {
	const next = internalNextPath(params.next);
	if (!next) return pathname;

	const query = new URLSearchParams({ next });
	addPreservedIntentParams(query, next, params);
	return `${pathname}?${query.toString()}` as Href;
}

function signedInAuthPathTarget(params: AuthRedirectParams): Href {
	const next = internalNextPath(params.next);
	if (!next) return "/";
	const nextPathname = pathnameFromInternalPath(next);
	if (!PUBLIC_AUTH_PRESERVING_PATHS.has(nextPathname)) return next as Href;
	return targetWithPreservedIntent(nextPathname, params);
}

function signInTarget(pathname: string, params: AuthRedirectParams): Href {
	const query = new URLSearchParams({ next: pathname });
	addPreservedIntentParams(query, pathname, params);
	return `/sign-in?${query.toString()}` as Href;
}

function targetWithPreservedIntent(
	pathname: string,
	params: AuthRedirectParams,
): Href {
	const query = new URLSearchParams();
	addPreservedIntentParams(query, pathname, params);
	const suffix = query.toString();
	return (suffix ? `${pathname}?${suffix}` : pathname) as Href;
}

function addPreservedIntentParams(
	query: URLSearchParams,
	pathname: string,
	params: AuthRedirectParams,
) {
	if (pathname === "/invitations/accept") {
		const token = firstString(params.token);
		if (token) query.set("token", token);
	}
	if (pathname === "/households/join") {
		const code = firstString(params.code);
		if (code) query.set("code", code);
	}
}

function firstString(value: unknown): string | null {
	if (typeof value === "string") return value.trim() ? value : null;
	if (Array.isArray(value)) {
		const first = value.find(
			(item): item is string => typeof item === "string",
		);
		return first?.trim() ? first : null;
	}
	return null;
}

function pathnameFromInternalPath(path: string): string {
	const queryIndex = path.indexOf("?");
	return queryIndex === -1 ? path : path.slice(0, queryIndex);
}

function parseInternalPath(
	path: string,
): { pathname: string; searchParams: URLSearchParams } | null {
	try {
		const parsed = new URL(path, "https://app.local");
		if (parsed.origin !== "https://app.local") return null;
		return { pathname: parsed.pathname, searchParams: parsed.searchParams };
	} catch {
		return null;
	}
}

function safeSearchParams(params: URLSearchParams): URLSearchParams {
	const safe = new URLSearchParams();
	params.forEach((value, key) => {
		if (!isSensitiveAttributeKey(key)) safe.append(key, value);
	});
	return safe;
}
