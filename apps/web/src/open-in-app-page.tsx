import { useHydrated } from "@tanstack/react-router";
import type { PublicWebPath } from "./deep-link";
import { buildAppEntryHref } from "./deep-link";

const APP_NAME = "Don't Forget";

export type OpenInAppPageProps = {
	path: PublicWebPath;
	message: string;
};

export function OpenInAppPage({ path, message }: OpenInAppPageProps) {
	const hydrated = useHydrated();
	const href = hydrated
		? buildAppEntryHref({
				scheme: __APP_SCHEME__,
				path,
				search: readWindowSearch(),
			})
		: undefined;

	return (
		<main>
			<h1>{APP_NAME}</h1>
			<p>{message}</p>
			<p>
				{href ? (
					<a className="open-in-app" href={href}>
						Open in {APP_NAME}
					</a>
				) : (
					<span className="open-in-app" aria-disabled="true">
						Open in {APP_NAME}
					</span>
				)}
			</p>
			<p>Requires the {APP_NAME} app on your iPhone.</p>
		</main>
	);
}

function readWindowSearch(): "" | `?${string}` {
	const search = window.location.search;
	if (search === "" || isSearchString(search)) {
		return search;
	}

	return "";
}

function isSearchString(value: string): value is `?${string}` {
	return value.startsWith("?");
}
