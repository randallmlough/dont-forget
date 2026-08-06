import { existsSync } from "node:fs";

import { handleBootstrap } from "@api/bootstrap/api";
import { type DataDeps, handleDataUpload } from "@api/data/api";
import type { DirectoryDb } from "@dont-forget/db";
import {
	handleChangeMemberRole,
	handleCreateHousehold,
	handleGetJoinCode,
	handleJoinByCode,
	handleLeaveHousehold,
	handleListMembers,
	handlePreviewJoinCode,
	handleRegenerateJoinCode,
	handleRemoveMember,
	handleRenameHousehold,
	handleSetJoinCodeEnabled,
	handleSwitchActiveHousehold,
} from "@api/households/api";
import type { ApiAuth } from "@api/http";
import {
	handleAcceptInvitation,
	handleCreateInvitation,
	handleListInvitations,
	handlePreviewInvitation,
	handleRevokeInvitation,
} from "@api/invitations/api";
import { handleUpdateUserName } from "@api/users/api";
import { createApiRequest, readJsonResponse } from "@api/test/api";
import { createApiApp } from "./app";

// Transport-dispatch suite: the unit under test is the route table in
// src/app.ts, so the domain handlers are mocked at the module
// boundary. Handler behavior is proven by the colocated
// src/**/api.test.ts suites (docs/code-standards/testing.md —
// mock justification).
jest.mock("@api/bootstrap/api", () => ({
	handleBootstrap: jest.fn(async () =>
		Response.json({ handler: "handleBootstrap" }),
	),
}));

jest.mock("@api/data/api", () => ({
	handleDataUpload: jest.fn(async () =>
		Response.json({ handler: "handleDataUpload" }),
	),
}));

jest.mock("@api/households/api", () => ({
	handleChangeMemberRole: jest.fn(async () =>
		Response.json({ handler: "handleChangeMemberRole" }),
	),
	handleCreateHousehold: jest.fn(async () =>
		Response.json({ handler: "handleCreateHousehold" }),
	),
	handleGetJoinCode: jest.fn(async () =>
		Response.json({ handler: "handleGetJoinCode" }),
	),
	handleJoinByCode: jest.fn(async () =>
		Response.json({ handler: "handleJoinByCode" }),
	),
	handleLeaveHousehold: jest.fn(async () =>
		Response.json({ handler: "handleLeaveHousehold" }),
	),
	handleListMembers: jest.fn(async () =>
		Response.json({ handler: "handleListMembers" }),
	),
	handlePreviewJoinCode: jest.fn(async () =>
		Response.json({ handler: "handlePreviewJoinCode" }),
	),
	handleRegenerateJoinCode: jest.fn(async () =>
		Response.json({ handler: "handleRegenerateJoinCode" }),
	),
	handleRemoveMember: jest.fn(async () =>
		Response.json({ handler: "handleRemoveMember" }),
	),
	handleRenameHousehold: jest.fn(async () =>
		Response.json({ handler: "handleRenameHousehold" }),
	),
	handleSetJoinCodeEnabled: jest.fn(async () =>
		Response.json({ handler: "handleSetJoinCodeEnabled" }),
	),
	handleSwitchActiveHousehold: jest.fn(async () =>
		Response.json({ handler: "handleSwitchActiveHousehold" }),
	),
}));

jest.mock("@api/invitations/api", () => ({
	handleAcceptInvitation: jest.fn(async () =>
		Response.json({ handler: "handleAcceptInvitation" }),
	),
	handleCreateInvitation: jest.fn(async () =>
		Response.json({ handler: "handleCreateInvitation" }),
	),
	handleListInvitations: jest.fn(async () =>
		Response.json({ handler: "handleListInvitations" }),
	),
	handlePreviewInvitation: jest.fn(async () =>
		Response.json({ handler: "handlePreviewInvitation" }),
	),
	handleRevokeInvitation: jest.fn(async () =>
		Response.json({ handler: "handleRevokeInvitation" }),
	),
}));

jest.mock("@api/users/api", () => ({
	handleUpdateUserName: jest.fn(async () =>
		Response.json({ handler: "handleUpdateUserName" }),
	),
}));

const mockedHandlers = {
	handleAcceptInvitation: jest.mocked(handleAcceptInvitation),
	handleBootstrap: jest.mocked(handleBootstrap),
	handleChangeMemberRole: jest.mocked(handleChangeMemberRole),
	handleCreateHousehold: jest.mocked(handleCreateHousehold),
	handleCreateInvitation: jest.mocked(handleCreateInvitation),
	handleDataUpload: jest.mocked(handleDataUpload),
	handleGetJoinCode: jest.mocked(handleGetJoinCode),
	handleJoinByCode: jest.mocked(handleJoinByCode),
	handleLeaveHousehold: jest.mocked(handleLeaveHousehold),
	handleListInvitations: jest.mocked(handleListInvitations),
	handleListMembers: jest.mocked(handleListMembers),
	handlePreviewInvitation: jest.mocked(handlePreviewInvitation),
	handlePreviewJoinCode: jest.mocked(handlePreviewJoinCode),
	handleRegenerateJoinCode: jest.mocked(handleRegenerateJoinCode),
	handleRemoveMember: jest.mocked(handleRemoveMember),
	handleRenameHousehold: jest.mocked(handleRenameHousehold),
	handleRevokeInvitation: jest.mocked(handleRevokeInvitation),
	handleSetJoinCodeEnabled: jest.mocked(handleSetJoinCodeEnabled),
	handleSwitchActiveHousehold: jest.mocked(handleSwitchActiveHousehold),
	handleUpdateUserName: jest.mocked(handleUpdateUserName),
};

type HandlerName = keyof typeof mockedHandlers;

type RouteParams =
	| { householdId: string }
	| { invitationId: string }
	| { householdId: string; membershipId: string };

type ExpectedCall =
	| { kind: "bootstrap" }
	| { kind: "data" }
	| { kind: "handler-static" }
	| {
			kind: "handler-with-params";
			params: RouteParams;
	  };

type RouteCase = {
	method: "DELETE" | "GET" | "PATCH" | "POST";
	requestPath: string;
	routePath: string;
	handlerName: HandlerName;
	expectedCall: ExpectedCall;
};

const routeCases = [
	{
		method: "POST",
		requestPath: "/api/bootstrap",
		routePath: "/api/bootstrap",
		handlerName: "handleBootstrap",
		expectedCall: { kind: "bootstrap" },
	},
	{
		method: "POST",
		requestPath: "/api/data",
		routePath: "/api/data",
		handlerName: "handleDataUpload",
		expectedCall: { kind: "data" },
	},
	{
		method: "POST",
		requestPath: "/api/households",
		routePath: "/api/households",
		handlerName: "handleCreateHousehold",
		expectedCall: { kind: "handler-static" },
	},
	{
		method: "PATCH",
		requestPath: "/api/households/household-1",
		routePath: "/api/households/:householdId",
		handlerName: "handleRenameHousehold",
		expectedCall: {
			kind: "handler-with-params",
			params: { householdId: "household-1" },
		},
	},
	{
		method: "GET",
		requestPath: "/api/households/household-1/members",
		routePath: "/api/households/:householdId/members",
		handlerName: "handleListMembers",
		expectedCall: {
			kind: "handler-with-params",
			params: { householdId: "household-1" },
		},
	},
	{
		method: "PATCH",
		requestPath: "/api/households/household-1/members/membership-1",
		routePath: "/api/households/:householdId/members/:membershipId",
		handlerName: "handleChangeMemberRole",
		expectedCall: {
			kind: "handler-with-params",
			params: {
				householdId: "household-1",
				membershipId: "membership-1",
			},
		},
	},
	{
		method: "DELETE",
		requestPath: "/api/households/household-1/members/membership-1",
		routePath: "/api/households/:householdId/members/:membershipId",
		handlerName: "handleRemoveMember",
		expectedCall: {
			kind: "handler-with-params",
			params: {
				householdId: "household-1",
				membershipId: "membership-1",
			},
		},
	},
	{
		method: "POST",
		requestPath: "/api/households/household-1/members/me/leave",
		routePath: "/api/households/:householdId/members/me/leave",
		handlerName: "handleLeaveHousehold",
		expectedCall: {
			kind: "handler-with-params",
			params: { householdId: "household-1" },
		},
	},
	{
		method: "GET",
		requestPath: "/api/households/household-1/join-code",
		routePath: "/api/households/:householdId/join-code",
		handlerName: "handleGetJoinCode",
		expectedCall: {
			kind: "handler-with-params",
			params: { householdId: "household-1" },
		},
	},
	{
		method: "PATCH",
		requestPath: "/api/households/household-1/join-code",
		routePath: "/api/households/:householdId/join-code",
		handlerName: "handleSetJoinCodeEnabled",
		expectedCall: {
			kind: "handler-with-params",
			params: { householdId: "household-1" },
		},
	},
	{
		method: "POST",
		requestPath: "/api/households/household-1/join-code/regenerate",
		routePath: "/api/households/:householdId/join-code/regenerate",
		handlerName: "handleRegenerateJoinCode",
		expectedCall: {
			kind: "handler-with-params",
			params: { householdId: "household-1" },
		},
	},
	{
		method: "GET",
		requestPath: "/api/households/join-code/preview",
		routePath: "/api/households/join-code/preview",
		handlerName: "handlePreviewJoinCode",
		expectedCall: { kind: "handler-static" },
	},
	{
		method: "POST",
		requestPath: "/api/households/join-code/join",
		routePath: "/api/households/join-code/join",
		handlerName: "handleJoinByCode",
		expectedCall: { kind: "handler-static" },
	},
	{
		method: "GET",
		requestPath: "/api/households/household-1/invitations",
		routePath: "/api/households/:householdId/invitations",
		handlerName: "handleListInvitations",
		expectedCall: {
			kind: "handler-with-params",
			params: { householdId: "household-1" },
		},
	},
	{
		method: "POST",
		requestPath: "/api/invitations",
		routePath: "/api/invitations",
		handlerName: "handleCreateInvitation",
		expectedCall: { kind: "handler-static" },
	},
	{
		method: "GET",
		requestPath: "/api/invitations/preview",
		routePath: "/api/invitations/preview",
		handlerName: "handlePreviewInvitation",
		expectedCall: { kind: "handler-static" },
	},
	{
		method: "POST",
		requestPath: "/api/invitations/accept",
		routePath: "/api/invitations/accept",
		handlerName: "handleAcceptInvitation",
		expectedCall: { kind: "handler-static" },
	},
	{
		method: "PATCH",
		requestPath: "/api/invitations/invitation-1",
		routePath: "/api/invitations/:invitationId",
		handlerName: "handleRevokeInvitation",
		expectedCall: {
			kind: "handler-with-params",
			params: { invitationId: "invitation-1" },
		},
	},
	{
		method: "PATCH",
		requestPath: "/api/users/me",
		routePath: "/api/users/me",
		handlerName: "handleUpdateUserName",
		expectedCall: { kind: "handler-static" },
	},
	{
		method: "PATCH",
		requestPath: "/api/users/me/active-household",
		routePath: "/api/users/me/active-household",
		handlerName: "handleSwitchActiveHousehold",
		expectedCall: { kind: "handler-static" },
	},
] satisfies RouteCase[];

type HandlerMock = {
	mock: {
		calls: readonly (readonly unknown[])[];
	};
};

function createTestHarness() {
	// The transport mocks never read this inert test seam, so a narrow test-only
	// assertion avoids constructing a real database client.
	const fakeDirectory = Object.freeze({}) as DirectoryDb;
	const fakePublicWebBaseUrl = "https://app.invalid";
	const fakeAuthenticate: ApiAuth = async () => {
		throw new Error("unexpected authenticate call in dispatch test");
	};
	const fakeData: DataDeps = {
		authenticate: async () => "user-1",
		withTransaction: async () => {
			throw new Error("unexpected transaction in dispatch test");
		},
	};

	return {
		app: createApiApp({
			directory: fakeDirectory,
			data: fakeData,
			authenticate: fakeAuthenticate,
			publicWebBaseUrl: fakePublicWebBaseUrl,
		}),
		fakeAuthenticate,
		fakeData,
		fakeDirectory,
		fakePublicWebBaseUrl,
	};
}

function firstCall(handler: HandlerMock): readonly unknown[] {
	const call = handler.mock.calls.at(0);
	if (!call) {
		throw new Error("Expected handler to have been called");
	}
	return call;
}

function firstRequest(handler: HandlerMock): Request {
	const request = firstCall(handler).at(0);
	if (!(request instanceof Request)) {
		throw new Error("Expected handler to receive a Request");
	}
	return request;
}

function expectHandlerDeps({
	value,
	fakeDirectory,
	fakeAuthenticate,
	fakePublicWebBaseUrl,
}: {
	value: unknown;
	fakeDirectory: DirectoryDb;
	fakeAuthenticate: ApiAuth;
	fakePublicWebBaseUrl: string;
}): void {
	if (
		typeof value !== "object" ||
		value === null ||
		!("directory" in value) ||
		!("authenticate" in value) ||
		!("publicWebBaseUrl" in value)
	) {
		throw new Error("Expected handler deps");
	}

	expect(value.directory).toBe(fakeDirectory);
	expect(value.authenticate).toBe(fakeAuthenticate);
	expect(value.publicWebBaseUrl).toBe(fakePublicWebBaseUrl);
}

function expectBootstrapDeps({
	value,
	fakeDirectory,
}: {
	value: unknown;
	fakeDirectory: DirectoryDb;
}): void {
	if (typeof value !== "object" || value === null || !("directory" in value)) {
		throw new Error("Expected bootstrap deps");
	}

	expect(value.directory).toBe(fakeDirectory);
	expect(Object.keys(value)).toEqual(["directory"]);
}

describe("createApiApp", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it.each(
		routeCases,
	)("$method $requestPath dispatches to $handlerName", async ({
		method,
		requestPath,
		handlerName,
		expectedCall,
	}) => {
		const {
			app,
			fakeAuthenticate,
			fakeData,
			fakeDirectory,
			fakePublicWebBaseUrl,
		} = createTestHarness();
		const handler = mockedHandlers[handlerName];

		const response = await app.request(requestPath, { method });
		const result = await readJsonResponse(response);

		expect(result.status).toBe(200);
		expect(result.body).toEqual({ handler: handlerName });
		expect(handler).toHaveBeenCalledTimes(1);

		const call = firstCall(handler);
		const request = firstRequest(handler);
		expect(request.method).toBe(method);
		expect(new URL(request.url).pathname).toBe(requestPath);

		switch (expectedCall.kind) {
			case "bootstrap":
				expect(call).toHaveLength(2);
				expectBootstrapDeps({
					value: call.at(1),
					fakeDirectory,
				});
				break;
			case "data":
				expect(call).toHaveLength(2);
				expect(call.at(1)).toBe(fakeData);
				break;
			case "handler-static":
				expect(call).toHaveLength(2);
				expectHandlerDeps({
					value: call.at(1),
					fakeDirectory,
					fakeAuthenticate,
					fakePublicWebBaseUrl,
				});
				break;
			case "handler-with-params":
				expect(call).toHaveLength(3);
				expect(call.at(1)).toEqual(expectedCall.params);
				expectHandlerDeps({
					value: call.at(2),
					fakeDirectory,
					fakeAuthenticate,
					fakePublicWebBaseUrl,
				});
				break;
			default: {
				const exhaustive: never = expectedCall;
				throw new Error(`Unexpected call expectation: ${String(exhaustive)}`);
			}
		}
	});

	it("registers exactly the planned method and path pairs", () => {
		const { app } = createTestHarness();
		expect(routeCases).toHaveLength(20);
		const compareRoutes = (
			left: { method: string; path: string },
			right: { method: string; path: string },
		) =>
			`${left.method} ${left.path}`.localeCompare(
				`${right.method} ${right.path}`,
			);
		const expectedRoutes = routeCases
			.map(({ method, routePath }) => ({
				method,
				path: routePath,
			}))
			.sort(compareRoutes);
		const actualRoutes = app.routes
			.filter(({ path }) => path.startsWith("/api/"))
			.map(({ method, path }) => ({ method, path }))
			.sort(compareRoutes);

		expect(actualRoutes).toEqual(expectedRoutes);
	});

	it("keeps the retired Expo API transport absent", () => {
		// Repository commands and Jest run from the project root.
		expect(existsSync("src/app/api")).toBe(false);
	});

	it("serves database-free liveness", async () => {
		const { app } = createTestHarness();

		const response = await app.request("/health");

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("application/json");
		await expect(response.json()).resolves.toEqual({ ok: true });
		for (const handler of Object.values(mockedHandlers)) {
			expect(handler).not.toHaveBeenCalled();
		}
	});

	it.each([
		{ path: "/.well-known/apple-app-site-association" },
		{ path: "/invitations/accept?token=synthetic" },
		{ path: "/households/join?code=synthetic" },
	])("keeps $path outside the API origin", async ({ path }) => {
		const { app } = createTestHarness();

		const response = await app.request(path);

		expect(response.status).toBe(404);
		expect(
			response.headers.get("content-type")?.startsWith("text/html") ?? false,
		).toBe(false);
	});

	it.each([
		{
			path: "/api/invitations/preview?token=tok-1",
			queryName: "token",
			queryValue: "tok-1",
			handlerName: "handlePreviewInvitation",
		},
		{
			path: "/api/households/join-code/preview?code=CODE1",
			queryName: "code",
			queryValue: "CODE1",
			handlerName: "handlePreviewJoinCode",
		},
	] satisfies {
		path: string;
		queryName: string;
		queryValue: string;
		handlerName: HandlerName;
	}[])("$path preserves the query string", async ({
		path,
		queryName,
		queryValue,
		handlerName,
	}) => {
		const { app } = createTestHarness();

		await app.request(path);

		const request = firstRequest(mockedHandlers[handlerName]);
		expect(new URL(request.url).searchParams.get(queryName)).toBe(queryValue);
	});

	it("preserves the Authorization header", async () => {
		const { app } = createTestHarness();
		const request = createApiRequest({
			method: "PATCH",
			path: "/api/users/me",
			bearerToken: "test-token",
		});

		await app.request(request);

		const receivedRequest = firstRequest(mockedHandlers.handleUpdateUserName);
		expect(receivedRequest.headers.get("authorization")).toBe(
			"Bearer test-token",
		);
	});

	it("passes through the handler response", async () => {
		const { app } = createTestHarness();
		mockedHandlers.handleCreateHousehold.mockResolvedValueOnce(
			new Response(JSON.stringify({ created: true }), {
				status: 201,
				headers: {
					"content-type": "application/json",
					"x-transport-test": "preserved",
				},
			}),
		);

		const response = await app.request("/api/households", {
			method: "POST",
		});

		expect(response.status).toBe(201);
		expect(response.headers.get("content-type")).toBe("application/json");
		expect(response.headers.get("x-transport-test")).toBe("preserved");
		await expect(response.json()).resolves.toEqual({ created: true });
	});
});
