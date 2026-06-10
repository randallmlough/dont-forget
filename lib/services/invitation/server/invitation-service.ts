import { randomBytes } from "node:crypto";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import {
	households,
	type Invitation,
	invitations,
	users,
} from "@/db/schema/directory";
import type { DirectoryDb } from "@/db/server/client";
import { asError } from "@/lib/errors";
import { createAppId } from "@/lib/ids";
import { redactAttributes } from "@/lib/redact";
import { serverServiceAnalytics } from "@/lib/server/analytics";
import type { ServiceAnalytics } from "@/lib/services/analytics";
import { createActiveHouseholdService } from "@/lib/services/household/server/active-household-service";
import { createMemberService } from "@/lib/services/member/server";
import { lockHouseholdLifecycle } from "@/lib/services/shared/server/lifecycle-lock";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_TOKEN_GENERATION_ATTEMPTS = 5;

type DirectoryTransaction = Parameters<
	Parameters<DirectoryDb["transaction"]>[0]
>[0];

export type InvitationServiceDirectory = DirectoryDb;
type InvitationServiceExecutor = DirectoryDb | DirectoryTransaction;

export class InvitationUnavailableError extends Error {
	constructor() {
		super("Invitation is not available");
		this.name = "InvitationUnavailableError";
	}
}

export class InvitationMembershipRequiredError extends Error {
	constructor() {
		super("User must be an active Member of the Household");
		this.name = "InvitationMembershipRequiredError";
	}
}

export class InvitationInvalidEmailError extends Error {
	constructor() {
		super("Enter a valid email address.");
		this.name = "InvitationInvalidEmailError";
	}
}

export type InvitationTokenGenerator = () => string | Promise<string>;

export type InvitationAcceptUrlBuilder = (input: { token: string }) => string;

export type InvitationEmailDelivery =
	| { status: "not_requested" }
	| { status: "sent" }
	| { status: "skipped"; reason: "environment" }
	| { status: "failed"; message: string };

const INVITATION_EMAIL_DELIVERY_FAILURE_MESSAGE =
	"Invitation email could not be delivered.";

export type InvitationEmailSender = {
	sendInvitationEmail(input: {
		email: string;
		acceptUrl: string;
		householdName: string;
		inviterDisplayName: string;
	}): Promise<
		Exclude<InvitationEmailDelivery, { status: "not_requested" | "failed" }>
	>;
};

export type InvitationRecord = {
	id: string;
	householdId: string;
	email: string | null;
	createdByUserId: string;
	createdAt: number;
	expiresAt: number;
	acceptedAt: number | null;
	acceptedByUserId: string | null;
	revokedAt: number | null;
	acceptUrl: string;
};

export type CreateInvitationInput = {
	householdId: string;
	createdByUserId: string;
	email?: string | null;
};

export type CreateInvitationResult = {
	invitation: InvitationRecord;
	emailDelivery: InvitationEmailDelivery;
	reusedExisting: boolean;
};

export type InvitationPreview =
	| {
			available: true;
			householdName: string;
			inviterDisplayName: string;
	  }
	| { available: false };

export type AcceptInvitationInput = {
	token: string;
	userId: string;
};

export type AcceptInvitationResult = {
	invitationId: string;
	householdId: string;
	membershipId: string;
	membershipRole: "owner" | "member";
	membershipCreated: boolean;
	activeHouseholdId: string;
};

export type PendingInvitation = {
	id: string;
	householdId: string;
	email: string | null;
	createdByUserId: string;
	creatorDisplayName: string | null;
	createdAt: number;
	expiresAt: number;
	acceptUrl: string;
};

export type InvitationService = {
	createInvitation(
		input: CreateInvitationInput,
	): Promise<CreateInvitationResult>;
	previewInvitation(token: string): Promise<InvitationPreview>;
	acceptInvitation(
		input: AcceptInvitationInput,
	): Promise<AcceptInvitationResult>;
	listPendingInvitations(input: {
		householdId: string;
		requestedByUserId: string;
	}): Promise<PendingInvitation[]>;
	revokeInvitation(input: {
		invitationId: string;
		revokedByUserId: string;
	}): Promise<InvitationRecord>;
};

export type InvitationServiceDeps = {
	directory: InvitationServiceDirectory;
	buildAcceptUrl: InvitationAcceptUrlBuilder;
	generateToken?: InvitationTokenGenerator;
	emailSender?: InvitationEmailSender;
	analytics?: ServiceAnalytics;
};

export function createInvitationService(
	deps: InvitationServiceDeps,
): InvitationService {
	const buildAcceptUrl = deps.buildAcceptUrl;
	const generateToken = deps.generateToken ?? generateSecureInvitationToken;
	const emailSender = deps.emailSender ?? defaultInvitationEmailSender;
	const analytics = deps.analytics ?? serverServiceAnalytics;

	return {
		createInvitation(input) {
			return createInvitation(input, deps.directory, {
				buildAcceptUrl,
				generateToken,
				emailSender,
				analytics,
			});
		},
		previewInvitation(token) {
			return previewInvitation(token, deps.directory);
		},
		acceptInvitation(input) {
			return acceptInvitation(input, deps.directory, analytics);
		},
		listPendingInvitations(input) {
			return listPendingInvitations(input, deps.directory, buildAcceptUrl);
		},
		revokeInvitation(input) {
			return revokeInvitation(input, deps.directory, buildAcceptUrl, analytics);
		},
	};
}

async function createInvitation(
	input: CreateInvitationInput,
	directory: DirectoryDb,
	deps: {
		buildAcceptUrl: InvitationAcceptUrlBuilder;
		generateToken: InvitationTokenGenerator;
		emailSender: InvitationEmailSender;
		analytics: ServiceAnalytics;
	},
): Promise<CreateInvitationResult> {
	const now = Date.now();
	const normalizedEmail = normalizeInvitationEmail(input.email);
	const memberService = createMemberService({ directory });
	const membership = await memberService.findActiveMembership({
		userId: input.createdByUserId,
		householdId: input.householdId,
	});
	if (!membership) throw new InvitationMembershipRequiredError();

	const { invitation: record, reusedExisting } = await findOrCreateInvitation(
		{
			householdId: input.householdId,
			createdByUserId: input.createdByUserId,
			email: normalizedEmail,
			now,
		},
		directory,
		deps.generateToken,
	);
	const invitationRecord = toInvitationRecord(record, deps.buildAcceptUrl);
	const emailDelivery = reusedExisting
		? { status: "not_requested" as const }
		: await deliverInvitationEmail({
				invitation: invitationRecord,
				householdName: membership.householdName,
				inviterDisplayName: await inviterDisplayName(
					input.createdByUserId,
					directory,
				),
				emailSender: deps.emailSender,
			});

	deps.analytics.track("invitation_created", {
		household_id: input.householdId,
		creator_user_id: input.createdByUserId,
		source: normalizedEmail ? "email" : "link",
		reused_existing: reusedExisting,
	});

	return { invitation: invitationRecord, emailDelivery, reusedExisting };
}

async function previewInvitation(
	token: string,
	directory: InvitationServiceExecutor,
): Promise<InvitationPreview> {
	const invitation = await findAvailableInvitation(
		token,
		Date.now(),
		directory,
	);
	if (!invitation) return { available: false };

	const [row] = await directory
		.select({
			householdName: households.name,
			inviterDisplayName: users.displayName,
		})
		.from(invitations)
		.innerJoin(households, eq(households.id, invitations.householdId))
		.innerJoin(users, eq(users.id, invitations.createdByUserId))
		.where(eq(invitations.id, invitation.id))
		.limit(1);

	if (!row) return { available: false };
	return {
		available: true,
		householdName: row.householdName,
		inviterDisplayName: publicInviterDisplayName(row.inviterDisplayName),
	};
}

async function acceptInvitation(
	input: AcceptInvitationInput,
	directory: InvitationServiceExecutor,
	analytics: ServiceAnalytics,
): Promise<AcceptInvitationResult> {
	const now = Date.now();

	const result = await directory.transaction(async (tx) => {
		const invitation = await claimInvitation(input, now, tx);
		if (!invitation) throw new InvitationUnavailableError();

		const { membership, created } = await createMemberService({
			directory: tx,
		}).ensurePlainMemberMembership({
			householdId: invitation.householdId,
			userId: input.userId,
			joinedAt: now,
		});
		await createActiveHouseholdService({ directory: tx }).setActiveHousehold({
			userId: input.userId,
			householdId: invitation.householdId,
		});

		return {
			invitationId: invitation.id,
			householdId: invitation.householdId,
			membershipId: membership.id,
			membershipRole: membership.role,
			membershipCreated: created,
			activeHouseholdId: invitation.householdId,
		};
	});

	analytics.track("invitation_accepted", {
		household_id: result.householdId,
		user_id: input.userId,
		membership_created: result.membershipCreated,
	});

	return result;
}

async function listPendingInvitations(
	input: { householdId: string; requestedByUserId: string },
	directory: InvitationServiceExecutor,
	buildAcceptUrl: InvitationAcceptUrlBuilder,
): Promise<PendingInvitation[]> {
	const membership = await createMemberService({
		directory,
	}).findActiveMembership({
		userId: input.requestedByUserId,
		householdId: input.householdId,
	});
	if (!membership) throw new InvitationMembershipRequiredError();

	const rows = await directory
		.select({
			id: invitations.id,
			householdId: invitations.householdId,
			token: invitations.token,
			email: invitations.email,
			createdByUserId: invitations.createdByUserId,
			creatorDisplayName: users.displayName,
			createdAt: invitations.createdAt,
			expiresAt: invitations.expiresAt,
		})
		.from(invitations)
		.innerJoin(users, eq(users.id, invitations.createdByUserId))
		.where(
			and(
				eq(invitations.householdId, input.householdId),
				isNull(invitations.acceptedAt),
				isNull(invitations.revokedAt),
				gt(invitations.expiresAt, Date.now()),
			),
		)
		.orderBy(asc(invitations.createdAt), asc(invitations.id));

	return rows.map((row) => ({
		id: row.id,
		householdId: row.householdId,
		email: row.email,
		createdByUserId: row.createdByUserId,
		creatorDisplayName: row.creatorDisplayName,
		createdAt: row.createdAt,
		expiresAt: row.expiresAt,
		acceptUrl: buildAcceptUrl({ token: row.token }),
	}));
}

async function revokeInvitation(
	input: { invitationId: string; revokedByUserId: string },
	directory: InvitationServiceExecutor,
	buildAcceptUrl: InvitationAcceptUrlBuilder,
	analytics: ServiceAnalytics,
): Promise<InvitationRecord> {
	const now = Date.now();
	const [invitation] = await directory
		.select()
		.from(invitations)
		.where(eq(invitations.id, input.invitationId))
		.limit(1);

	if (
		!invitation ||
		invitation.acceptedAt !== null ||
		invitation.revokedAt !== null ||
		invitation.expiresAt <= now
	) {
		throw new InvitationUnavailableError();
	}

	const membership = await createMemberService({
		directory,
	}).findActiveMembership({
		userId: input.revokedByUserId,
		householdId: invitation.householdId,
	});
	if (!membership) throw new InvitationMembershipRequiredError();

	const [updated] = await directory
		.update(invitations)
		.set({ revokedAt: now })
		.where(
			and(
				eq(invitations.id, input.invitationId),
				isNull(invitations.acceptedAt),
				isNull(invitations.revokedAt),
				gt(invitations.expiresAt, now),
			),
		)
		.returning();

	if (!updated) throw new InvitationUnavailableError();

	analytics.track("invitation_revoked", {
		household_id: updated.householdId,
		revoked_by_user_id: input.revokedByUserId,
	});

	return toInvitationRecord(updated, buildAcceptUrl);
}

async function findReusablePendingInvitation(
	input: { householdId: string; email: string; now: number },
	directory: InvitationServiceExecutor,
): Promise<Invitation | null> {
	const [row] = await directory
		.select()
		.from(invitations)
		.where(
			and(
				eq(invitations.householdId, input.householdId),
				eq(invitations.email, input.email),
				isNull(invitations.acceptedAt),
				isNull(invitations.revokedAt),
				gt(invitations.expiresAt, input.now),
			),
		)
		.orderBy(asc(invitations.createdAt), asc(invitations.id))
		.limit(1);

	return row ?? null;
}

async function findOrCreateInvitation(
	input: {
		householdId: string;
		createdByUserId: string;
		email: string | null;
		now: number;
	},
	directory: DirectoryDb,
	generateToken: InvitationTokenGenerator,
): Promise<{ invitation: Invitation; reusedExisting: boolean }> {
	if (!input.email) {
		return {
			invitation: await createNewInvitation(input, directory, generateToken),
			reusedExisting: false,
		};
	}
	const email = input.email;

	return directory.transaction(async (tx) => {
		await lockHouseholdLifecycle(input.householdId, tx);

		const reusable = await findReusablePendingInvitation(
			{ householdId: input.householdId, email, now: input.now },
			tx,
		);
		if (reusable) return { invitation: reusable, reusedExisting: true };

		return {
			invitation: await createNewInvitation(input, tx, generateToken),
			reusedExisting: false,
		};
	});
}

async function createNewInvitation(
	input: {
		householdId: string;
		createdByUserId: string;
		email: string | null;
		now: number;
	},
	directory: InvitationServiceExecutor,
	generateToken: InvitationTokenGenerator,
): Promise<Invitation> {
	for (let attempt = 0; attempt < MAX_TOKEN_GENERATION_ATTEMPTS; attempt += 1) {
		const token = await generateToken();
		const [existing] = await directory
			.select({ id: invitations.id })
			.from(invitations)
			.where(eq(invitations.token, token))
			.limit(1);

		if (existing) continue;

		const invitation: Invitation = {
			id: createAppId("inv"),
			householdId: input.householdId,
			token,
			email: input.email,
			createdByUserId: input.createdByUserId,
			createdAt: input.now,
			expiresAt: input.now + INVITATION_TTL_MS,
			acceptedAt: null,
			acceptedByUserId: null,
			revokedAt: null,
		};
		await directory.insert(invitations).values(invitation);
		return invitation;
	}

	throw new Error("Unable to generate a unique Invitation token");
}

async function findAvailableInvitation(
	token: string,
	now: number,
	directory: InvitationServiceExecutor,
): Promise<Invitation | null> {
	const [row] = await directory
		.select()
		.from(invitations)
		.innerJoin(households, eq(households.id, invitations.householdId))
		.where(
			and(
				eq(invitations.token, token),
				isNull(invitations.acceptedAt),
				isNull(invitations.revokedAt),
				gt(invitations.expiresAt, now),
				isNull(households.deletedAt),
			),
		)
		.limit(1);

	return row?.invitations ?? null;
}

async function claimInvitation(
	input: AcceptInvitationInput,
	now: number,
	directory: InvitationServiceExecutor,
): Promise<Invitation | null> {
	const [invitation] = await directory
		.update(invitations)
		.set({ acceptedAt: now, acceptedByUserId: input.userId })
		.where(
			and(
				eq(invitations.token, input.token),
				isNull(invitations.acceptedAt),
				isNull(invitations.revokedAt),
				gt(invitations.expiresAt, now),
			),
		)
		.returning();

	if (!invitation) return null;

	const [household] = await directory
		.select()
		.from(households)
		.where(
			and(
				eq(households.id, invitation.householdId),
				isNull(households.deletedAt),
			),
		)
		.limit(1);

	if (!household) throw new InvitationUnavailableError();

	return invitation;
}

async function deliverInvitationEmail(input: {
	invitation: InvitationRecord;
	householdName: string;
	inviterDisplayName: string;
	emailSender: InvitationEmailSender;
}): Promise<InvitationEmailDelivery> {
	if (!input.invitation.email) return { status: "not_requested" };

	try {
		return await input.emailSender.sendInvitationEmail({
			email: input.invitation.email,
			acceptUrl: input.invitation.acceptUrl,
			householdName: input.householdName,
			inviterDisplayName: input.inviterDisplayName,
		});
	} catch (error) {
		console.error(
			"Invitation email delivery failed",
			redactAttributes({
				error: asError(error),
				household_id: input.invitation.householdId,
				invitation_id: input.invitation.id,
			}),
		);
		return {
			status: "failed",
			message: INVITATION_EMAIL_DELIVERY_FAILURE_MESSAGE,
		};
	}
}

async function inviterDisplayName(
	userId: string,
	directory: InvitationServiceExecutor,
): Promise<string> {
	const [user] = await directory
		.select({ displayName: users.displayName })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);

	return user?.displayName ?? "A Member";
}

function toInvitationRecord(
	invitation: Invitation,
	buildAcceptUrl: InvitationAcceptUrlBuilder,
): InvitationRecord {
	return {
		id: invitation.id,
		householdId: invitation.householdId,
		email: invitation.email,
		createdByUserId: invitation.createdByUserId,
		createdAt: invitation.createdAt,
		expiresAt: invitation.expiresAt,
		acceptedAt: invitation.acceptedAt,
		acceptedByUserId: invitation.acceptedByUserId,
		revokedAt: invitation.revokedAt,
		acceptUrl: buildAcceptUrl({ token: invitation.token }),
	};
}

function normalizeInvitationEmail(
	email: string | null | undefined,
): string | null {
	const normalized = email?.trim().toLowerCase() ?? "";
	if (!normalized) return null;
	if (!isInvitationEmail(normalized)) throw new InvitationInvalidEmailError();
	return normalized;
}

function isInvitationEmail(email: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function publicInviterDisplayName(displayName: string | null): string {
	const trimmed = displayName?.trim();
	if (!trimmed || trimmed.includes("@")) return "A Member";
	return trimmed;
}

function generateSecureInvitationToken(): string {
	return randomBytes(32).toString("base64url");
}

const defaultInvitationEmailSender: InvitationEmailSender = {
	async sendInvitationEmail() {
		return { status: "skipped", reason: "environment" };
	},
};
