export type PublicWebPath = "/invitations/accept" | "/households/join";

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
