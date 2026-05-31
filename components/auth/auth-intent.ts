import type { Href } from "expo-router";
import {
	type AuthRedirectParams,
	internalNextPath,
} from "@/components/auth/redirect-policy";

export function authHrefWithIntent(
	pathname: "/sign-in" | "/sign-up",
	params: AuthRedirectParams,
): Href {
	const next = internalNextPath(params.next);
	if (!next) return pathname;

	const query = new URLSearchParams({ next });
	const token = firstString(params.token);
	const code = firstString(params.code);
	if (next === "/invitations/accept" && token) query.set("token", token);
	if (next === "/households/join" && code) query.set("code", code);
	return `${pathname}?${query.toString()}` as Href;
}

function firstString(value: unknown): string | null {
	if (typeof value === "string") return value;
	if (Array.isArray(value) && typeof value[0] === "string") return value[0];
	return null;
}
