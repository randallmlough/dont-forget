import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	APPLE_APP_SITE_ASSOCIATION_PATH,
	appleAppSiteAssociationForEnv,
	PUBLIC_HOUSEHOLD_JOIN_CODE_ENTRY,
	PUBLIC_INVITATION_ENTRY,
	readAppEnv,
} from "@dont-forget/shared";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const clientRoot = resolve(webRoot, "dist/client");

const expectedAasa = appleAppSiteAssociationForEnv(readAppEnv());

const aasaPath = resolve(clientRoot, APPLE_APP_SITE_ASSOCIATION_PATH.slice(1));
await access(aasaPath);
assert.equal(
	aasaPath.endsWith("apple-app-site-association"),
	true,
	"AASA artifact must be extensionless",
);
assert.deepEqual(
	JSON.parse(await readFile(aasaPath, "utf8")),
	expectedAasa,
	"AASA artifact must match the approved app IDs and paths exactly",
);

await assertNoHandAuthoredIndexRoute();

await verifyPublicPage({
	path: `${PUBLIC_INVITATION_ENTRY.path.slice(1)}/index.html`,
	expectedCopy: "This Invitation opens in the Don&#x27;t Forget app.",
});
await verifyPublicPage({
	path: `${PUBLIC_HOUSEHOLD_JOIN_CODE_ENTRY.path.slice(1)}/index.html`,
	expectedCopy: "This Household Join Code opens in the Don&#x27;t Forget app.",
});

await verifyTechnicalRootIfPresent();

async function assertNoHandAuthoredIndexRoute() {
	const indexRoute = resolve(webRoot, "src/routes/index.tsx");
	await assert.rejects(
		access(indexRoute),
		undefined,
		"The web app must not contain a hand-authored index route",
	);
}

async function verifyPublicPage({ path, expectedCopy }) {
	const html = await readFile(resolve(clientRoot, path), "utf8");
	const htmlWithoutEmptyComments = stripReactEmptyComments(html);
	assert.match(
		html,
		/<meta name="referrer" content="no-referrer"\s*\/>/,
		`${path} must disable referrer forwarding`,
	);
	assert.ok(
		htmlWithoutEmptyComments.includes(expectedCopy),
		`${path} must contain its safe copy`,
	);
	assert.ok(
		htmlWithoutEmptyComments.includes("Open in Don&#x27;t Forget"),
		`${path} must contain the app CTA`,
	);
	assert.doesNotMatch(
		html,
		/(?:token|code)=/i,
		`${path} must not contain query material`,
	);
	assert.doesNotMatch(
		html,
		/(?:posthog|analytics|https?:\/\/|<img\b)/i,
		`${path} must not contain third-party resources or analytics`,
	);

	for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
		const resource = match[1];
		assert.ok(
			resource?.startsWith("/"),
			`${path} may reference only local generated assets`,
		);
	}
}

async function verifyTechnicalRootIfPresent() {
	let html;
	try {
		html = await readFile(resolve(clientRoot, "index.html"), "utf8");
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return;
		}
		throw error;
	}

	const htmlWithoutEmptyComments = stripReactEmptyComments(html);
	assert.doesNotMatch(
		htmlWithoutEmptyComments,
		/(?:This Invitation opens|Household Join Code opens|Open in Don't Forget|Open in Don&#x27;t Forget|http-equiv="refresh"|window\.location|marketing)/i,
		"A framework-emitted root document must remain a content-free technical shell",
	);
}

function stripReactEmptyComments(html) {
	return html.replace(/<!--\s*-->/g, "");
}
