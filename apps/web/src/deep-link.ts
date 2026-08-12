import type { PublicEntryPath } from "@dont-forget/shared";

export type PublicWebPath = PublicEntryPath;

export type BuildAppEntryHrefInput = {
	scheme: string;
	path: PublicWebPath;
	search: "" | `?${string}`;
};

export function buildAppEntryHref({
	scheme,
	path,
	search,
}: BuildAppEntryHrefInput): string {
	return `${scheme}:/${path}${search}`;
}
