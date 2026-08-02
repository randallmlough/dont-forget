import assert from "node:assert/strict";

const webdriverUrl = process.argv[2];
const webUrl = process.argv[3];
const expectedScheme = process.argv[4];

assert.ok(webdriverUrl, "WebDriver URL is required");
assert.ok(webUrl, "web container URL is required");
assert.ok(expectedScheme, "expected app scheme is required");

const session = await webdriverRequest("/session", {
	method: "POST",
	body: JSON.stringify({
		capabilities: {
			alwaysMatch: {
				browserName: "chrome",
				"goog:chromeOptions": {
					args: ["--headless=new", "--no-sandbox"],
				},
			},
		},
	}),
});
const sessionId = session.value?.sessionId ?? session.sessionId;
assert.equal(
	typeof sessionId,
	"string",
	"WebDriver did not return a session ID",
);

try {
	await verifyHydratedLink({
		path: "/invitations/accept",
		search: "?token=t5-token-marker",
	});
	await verifyHydratedLink({
		path: "/households/join",
		search: "?code=t5-code-marker",
	});
} finally {
	await webdriverRequest(`/session/${sessionId}`, { method: "DELETE" });
}

console.log("Web container hydration and query forwarding verified");

async function verifyHydratedLink({ path, search }) {
	await webdriverRequest(`/session/${sessionId}/url`, {
		method: "POST",
		body: JSON.stringify({ url: `${webUrl}${path}${search}` }),
	});

	let state;
	for (let attempt = 0; attempt < 50; attempt += 1) {
		const result = await webdriverRequest(
			`/session/${sessionId}/execute/sync`,
			{
				method: "POST",
				body: JSON.stringify({
					script: `return {
						href: document.querySelector("a.open-in-app")?.getAttribute("href") ?? null,
						search: window.location.search,
					};`,
					args: [],
				}),
			},
		);
		state = result.value;
		if (state?.href) {
			break;
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}

	assert.equal(
		state?.search,
		search,
		`${path} changed the browser-visible query`,
	);
	assert.equal(
		state?.href,
		`${expectedScheme}:/${path}${search}`,
		`${path} did not forward the opaque query to the hydrated app CTA`,
	);
}

async function webdriverRequest(path, init) {
	const response = await fetch(`${webdriverUrl}${path}`, {
		...init,
		headers: { "Content-Type": "application/json" },
		signal: AbortSignal.timeout(10_000),
	});
	const body = response.status === 204 ? {} : await response.json();
	if (!response.ok) {
		throw new Error(
			`WebDriver ${init?.method ?? "GET"} ${path} failed: ${JSON.stringify(body)}`,
		);
	}
	return body;
}
