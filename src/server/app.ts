import { Hono } from "hono";
import { handleBootstrap } from "@/server/bootstrap/api";
import { type DataDeps, handleDataUpload } from "@/server/data/api";
import type { DirectoryDb } from "@/server/db/client";
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
} from "@/server/households/api";
import type { ApiAuth, ApiHandlerDeps } from "@/server/http";
import {
	handleAcceptInvitation,
	handleCreateInvitation,
	handleListInvitations,
	handlePreviewInvitation,
	handleRevokeInvitation,
} from "@/server/invitations/api";
import { handleUpdateUserName } from "@/server/users/api";

export type ApiAppDeps = {
	directory: DirectoryDb;
	data: DataDeps;
	// Test seam. Production leaves this undefined so handlers run the real
	// Clerk verification path (src/server/http.ts authenticateApiUser).
	authenticate?: ApiAuth;
};

export function createApiApp(deps: ApiAppDeps): Hono {
	const handlerDeps: ApiHandlerDeps = {
		directory: deps.directory,
		authenticate: deps.authenticate,
	};

	const app = new Hono();

	// Explicit adapter per route: static-path handlers take deps in the
	// second position, so a generic (request, params) adapter would pass
	// route params into the deps slot (EDD 002 R3). Registration follows
	// the EDD §6.4 table order; no two same-method routes here can match
	// the same concrete path.
	// Route-param boundary exception: preserve the Expo transport's raw string
	// identifiers so this additive route table does not change HTTP behavior.
	// Domain handlers retain the existing identifier lookup and not-found behavior.
	// The bootstrap deps seam arrives in T2 (EDD 002 R4).
	app.post("/api/bootstrap", (context) => handleBootstrap(context.req.raw));
	app.post("/api/data", (context) =>
		handleDataUpload(context.req.raw, deps.data),
	);
	app.post("/api/households", (context) =>
		handleCreateHousehold(context.req.raw, handlerDeps),
	);
	app.patch("/api/households/:householdId", (context) =>
		handleRenameHousehold(
			context.req.raw,
			{ householdId: context.req.param("householdId") },
			handlerDeps,
		),
	);
	app.get("/api/households/:householdId/members", (context) =>
		handleListMembers(
			context.req.raw,
			{ householdId: context.req.param("householdId") },
			handlerDeps,
		),
	);
	app.patch("/api/households/:householdId/members/:membershipId", (context) =>
		handleChangeMemberRole(
			context.req.raw,
			{
				householdId: context.req.param("householdId"),
				membershipId: context.req.param("membershipId"),
			},
			handlerDeps,
		),
	);
	app.delete("/api/households/:householdId/members/:membershipId", (context) =>
		handleRemoveMember(
			context.req.raw,
			{
				householdId: context.req.param("householdId"),
				membershipId: context.req.param("membershipId"),
			},
			handlerDeps,
		),
	);
	app.post("/api/households/:householdId/members/me/leave", (context) =>
		handleLeaveHousehold(
			context.req.raw,
			{ householdId: context.req.param("householdId") },
			handlerDeps,
		),
	);
	app.get("/api/households/:householdId/join-code", (context) =>
		handleGetJoinCode(
			context.req.raw,
			{ householdId: context.req.param("householdId") },
			handlerDeps,
		),
	);
	app.patch("/api/households/:householdId/join-code", (context) =>
		handleSetJoinCodeEnabled(
			context.req.raw,
			{ householdId: context.req.param("householdId") },
			handlerDeps,
		),
	);
	app.post("/api/households/:householdId/join-code/regenerate", (context) =>
		handleRegenerateJoinCode(
			context.req.raw,
			{ householdId: context.req.param("householdId") },
			handlerDeps,
		),
	);
	app.get("/api/households/join-code/preview", (context) =>
		handlePreviewJoinCode(context.req.raw, handlerDeps),
	);
	app.post("/api/households/join-code/join", (context) =>
		handleJoinByCode(context.req.raw, handlerDeps),
	);
	app.get("/api/households/:householdId/invitations", (context) =>
		handleListInvitations(
			context.req.raw,
			{ householdId: context.req.param("householdId") },
			handlerDeps,
		),
	);
	app.post("/api/invitations", (context) =>
		handleCreateInvitation(context.req.raw, handlerDeps),
	);
	app.get("/api/invitations/preview", (context) =>
		handlePreviewInvitation(context.req.raw, handlerDeps),
	);
	app.post("/api/invitations/accept", (context) =>
		handleAcceptInvitation(context.req.raw, handlerDeps),
	);
	app.patch("/api/invitations/:invitationId", (context) =>
		handleRevokeInvitation(
			context.req.raw,
			{ invitationId: context.req.param("invitationId") },
			handlerDeps,
		),
	);
	app.patch("/api/users/me", (context) =>
		handleUpdateUserName(context.req.raw, handlerDeps),
	);
	app.patch("/api/users/me/active-household", (context) =>
		handleSwitchActiveHousehold(context.req.raw, handlerDeps),
	);

	return app;
}
