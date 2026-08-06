import type { Server } from "node:http";
import { readApiServerConfig } from "@api/config";
import type { DataDeps } from "@api/data/api";
import * as payload from "@api/data/payload";
import * as rateLimit from "@api/data/rate-limit";
import { type ApiAuth, ApiUnauthorizedError } from "@api/http";
import type { DataTransaction } from "@dont-forget/db";
import {
	householdJoinCodeFixture,
	type InvitationVariantsScenario,
	PRIMARY_HOUSEHOLD_SEED,
	seedInvitationVariantsScenario,
} from "@dont-forget/db/fixtures";
import { householdJoinCodes, type User, users } from "@dont-forget/db/schema";
import {
	createTestDirectoryDb,
	type TestDirectoryDb,
} from "@dont-forget/db/test";
import { type ServerType, serve } from "@hono/node-server";
import { eq } from "drizzle-orm";
import { createApiApp } from "./app";

// The real handlers use an injected ApiAuth. Stub only the external Clerk SDK
// because Jest resolves its browser ESM runtime while loading the HTTP module.
jest.mock("@clerk/backend", () => ({
	createClerkClient: jest.fn(),
	verifyToken: jest.fn(),
}));

const TEST_HOST = "127.0.0.1";
const TEST_NOW = PRIMARY_HOUSEHOLD_SEED.now + 100_000;
const TEST_API_CONFIG = readApiServerConfig({
	APP_ENV: "test",
	DATABASE_URL: "postgresql://synthetic.invalid/dont_forget",
	CLERK_SECRET_KEY: "sk_test_synthetic",
	PUBLIC_WEB_BASE_URL: "  https://app.invalid/deep-links/  ",
	RESEND_API_KEY: "re_synthetic",
	RESEND_FROM_ADDRESS: "sender@example.com",
	POSTHOG_PROJECT_TOKEN: "phc_synthetic",
	POSTHOG_HOST: "https://posthog.invalid",
});
const jestFetch = globalThis.fetch;
const originalPublicWebBaseUrl = process.env.PUBLIC_WEB_BASE_URL;
const requestOrder: string[] = [];
const dataTransaction: DataTransaction = {
	householdsForOp: jest.fn(async () => []),
	isActiveMember: jest.fn(async () => false),
	storedRowState: jest.fn(async () => undefined),
	upsert: jest.fn(async () => {}),
	patch: jest.fn(async () => {}),
	tombstone: jest.fn(async () => {}),
	uncheckItemCheck: jest.fn(async () => {}),
};

let directory: TestDirectoryDb | undefined;
let authenticatedUser: User;
let joinCode: ReturnType<typeof householdJoinCodeFixture>;
let scenario: InvitationVariantsScenario;
let server: Server | undefined;
let origin = "";
let transactionCount = 0;
let restoreDateNow = () => {};

const apiAuthenticate = jest.fn(async (request: Request) => {
	if (!request.headers.get("authorization")) {
		throw new ApiUnauthorizedError("Missing bearer token");
	}
	return authenticatedUser;
}) satisfies ApiAuth;

const dataDeps: DataDeps = {
	authenticate: async () => {
		requestOrder.push("authenticate");
		return authenticatedUser.id;
	},
	withTransaction: async (run) => {
		requestOrder.push("transaction");
		transactionCount += 1;
		return run(dataTransaction);
	},
};

describe("Node API server", () => {
	beforeAll(async () => {
		process.env.PUBLIC_WEB_BASE_URL = "https://wrong.invalid";
		const dateNow = jest.spyOn(Date, "now").mockReturnValue(TEST_NOW);
		restoreDateNow = () => dateNow.mockRestore();

		const testDirectory = await createTestDirectoryDb();
		directory = testDirectory;
		scenario = await seedInvitationVariantsScenario({
			directory: testDirectory.db,
			now: PRIMARY_HOUSEHOLD_SEED.now,
		});
		const [seededUser] = await testDirectory.db
			.select()
			.from(users)
			.where(eq(users.id, scenario.users.avery.id))
			.limit(1);
		if (!seededUser) throw new Error("Seeded User was not found");
		authenticatedUser = seededUser;
		joinCode = householdJoinCodeFixture({
			householdId: scenario.household.id,
			createdByUserId: scenario.users.avery.id,
		});
		await testDirectory.db.insert(householdJoinCodes).values(joinCode);

		const app = createApiApp({
			directory: testDirectory.db,
			data: dataDeps,
			authenticate: apiAuthenticate,
			publicWebBaseUrl: TEST_API_CONFIG.publicWebBaseUrl,
		});
		const listener = await listen(app.fetch);
		server = listener.server;
		origin = listener.origin;
	});

	beforeEach(() => {
		apiAuthenticate.mockClear();
	});

	afterAll(async () => {
		try {
			if (server) await closeServer(server);
		} finally {
			try {
				if (directory) await directory.close();
			} finally {
				restoreDateNow();
				globalThis.fetch = jestFetch;
				if (originalPublicWebBaseUrl === undefined) {
					delete process.env.PUBLIC_WEB_BASE_URL;
				} else {
					process.env.PUBLIC_WEB_BASE_URL = originalPublicWebBaseUrl;
				}
			}
		}
	});

	it("serves the health endpoint over a real listener", async () => {
		const response = await globalThis.fetch(`${origin}/health`);

		expect(response.constructor.name).toBe("Response");
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ ok: true });
	});

	it("preserves the data pipeline order over HTTP", async () => {
		// These observation-only wrappers still execute the real limiter and parser;
		// requestOrder captures causality without replacing production behavior.
		const realAllowDataRequest = rateLimit.allowDataRequest;
		const realReadBoundedJsonBody = payload.readBoundedJsonBody;
		const allowDataRequest = jest
			.spyOn(rateLimit, "allowDataRequest")
			.mockImplementation((userId, now) => {
				requestOrder.push("rate-limit");
				return realAllowDataRequest(userId, now);
			});
		const readBoundedJsonBody = jest
			.spyOn(payload, "readBoundedJsonBody")
			.mockImplementation(async (body) => {
				requestOrder.push("bounded-parse");
				return realReadBoundedJsonBody(body);
			});
		rateLimit.resetRateLimiterForTests();
		requestOrder.length = 0;
		transactionCount = 0;

		try {
			const response = await globalThis.fetch(`${origin}/api/data`, {
				method: "POST",
				headers: {
					authorization: "Bearer synthetic-token",
					"content-type": "application/json",
				},
				body: JSON.stringify({ batch: [] }),
			});

			expect(response.status).toBe(200);
			await expect(response.json()).resolves.toEqual({ ok: true });
			expect(requestOrder).toEqual([
				"authenticate",
				"rate-limit",
				"bounded-parse",
				"transaction",
			]);
			expect(transactionCount).toBe(1);
			expect(dataTransaction.householdsForOp).not.toHaveBeenCalled();
			expect(dataTransaction.isActiveMember).not.toHaveBeenCalled();
			expect(dataTransaction.storedRowState).not.toHaveBeenCalled();
			expect(dataTransaction.upsert).not.toHaveBeenCalled();
			expect(dataTransaction.patch).not.toHaveBeenCalled();
			expect(dataTransaction.tombstone).not.toHaveBeenCalled();
			expect(dataTransaction.uncheckItemCheck).not.toHaveBeenCalled();
		} finally {
			allowDataRequest.mockRestore();
			readBoundedJsonBody.mockRestore();
			rateLimit.resetRateLimiterForTests();
		}
	});

	it("serves public Invitation previews without authentication", async () => {
		const token = encodeURIComponent(scenario.invitations.pendingEmail.token);
		const response = await globalThis.fetch(
			`${origin}/api/invitations/preview?token=${token}`,
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			available: true,
			householdName: scenario.household.name,
			inviterDisplayName: scenario.users.avery.displayName,
		});
		expect(apiAuthenticate).not.toHaveBeenCalled();
	});

	it("requires authentication for Household Join Code previews", async () => {
		const code = encodeURIComponent(joinCode.code);
		const previewUrl = `${origin}/api/households/join-code/preview?code=${code}`;

		const unauthorized = await globalThis.fetch(previewUrl);

		expect(unauthorized.status).toBe(401);
		await expect(unauthorized.json()).resolves.toEqual({
			error: "Missing bearer token",
		});
		expect(apiAuthenticate).toHaveBeenCalledTimes(1);

		const authorized = await globalThis.fetch(previewUrl, {
			headers: { authorization: "Bearer synthetic-token" },
		});

		expect(authorized.status).toBe(200);
		await expect(authorized.json()).resolves.toEqual({
			available: true,
			householdName: scenario.household.name,
		});
		expect(apiAuthenticate).toHaveBeenCalledTimes(2);
	});

	it("uses the parsed public web base URL for canonical Invitation and Household links", async () => {
		const headers = { authorization: "Bearer synthetic-token" };
		const invitationResponse = await globalThis.fetch(
			`${origin}/api/households/${scenario.household.id}/invitations`,
			{ headers },
		);
		const joinCodeResponse = await globalThis.fetch(
			`${origin}/api/households/${scenario.household.id}/join-code`,
			{ headers },
		);

		expect(invitationResponse.status).toBe(200);
		await expect(invitationResponse.json()).resolves.toMatchObject({
			invitations: expect.arrayContaining([
				expect.objectContaining({
					acceptUrl: `https://app.invalid/deep-links/invitations/accept?token=${encodeURIComponent(scenario.invitations.pendingEmail.token)}`,
				}),
			]),
		});
		expect(joinCodeResponse.status).toBe(200);
		await expect(joinCodeResponse.json()).resolves.toMatchObject({
			joinCode: {
				joinUrl: `https://app.invalid/deep-links/households/join?code=${encodeURIComponent(joinCode.code)}`,
			},
		});
	});
});

async function listen(
	fetch: Parameters<typeof serve>[0]["fetch"],
): Promise<{ origin: string; server: Server }> {
	const server = await new Promise<Server>((resolve, reject) => {
		const onError = (error: Error) => reject(error);
		const candidate = serve({ fetch, hostname: TEST_HOST, port: 0 }, () => {
			candidate.off("error", onError);
			if (!isHttpServer(candidate)) {
				reject(new Error("Node adapter returned an unsupported server"));
				return;
			}
			resolve(candidate);
		});
		candidate.once("error", onError);
	});
	const address = server.address();
	if (!address || typeof address === "string") {
		await closeServer(server);
		throw new Error("Node API server did not bind a TCP address");
	}

	return {
		origin: `http://${TEST_HOST}:${address.port}`,
		server,
	};
}

function isHttpServer(server: ServerType): server is Server {
	return "closeAllConnections" in server;
}

function closeServer(server: Server): Promise<void> {
	return new Promise((resolve, reject) => {
		server.close((error) => {
			if (error) {
				reject(error);
				return;
			}
			resolve();
		});
	});
}
