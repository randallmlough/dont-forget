import { asError, redactString } from "@dont-forget/shared";
import { readClerkServerConfig } from "@dont-forget/shared/node";

export const SEED_TEST_PASSWORD = "testing1234";

const CLERK_SECRET_KEY_PATTERN = /\bsk_(?:test|live)_[A-Za-z0-9_-]+\b/g;
const STAGING_SEED_EXISTING_CLERK_USER_ERROR =
	"Staging seed requires new Clerk Users for both Owner and Member.";

export type SeedClerkMode = {
	kind: "clerk";
	ownerEmail: string;
	memberEmail: string;
};

export type SeedClerkUser = {
	id: string;
	primaryEmailAddressId?: string | null;
	emailAddresses: { id?: string; emailAddress: string }[];
};

export type SeedClerkUsers = {
	owner: SeedClerkUser;
	member: SeedClerkUser;
};

export type SeedClerkClient = {
	getUserList(input: { query: string }): Promise<{ data: SeedClerkUser[] }>;
	createUser(input: {
		emailAddress: string[];
		password: string;
		firstName?: string;
		lastName?: string;
		skipPasswordChecks?: boolean;
	}): Promise<SeedClerkUser>;
	updateUser(
		userId: string,
		input: {
			password: string;
			firstName?: string;
			lastName?: string;
			skipPasswordChecks?: boolean;
		},
	): Promise<SeedClerkUser>;
	disableUserMFA(userId: string): Promise<unknown>;
	updateEmailAddress(
		emailAddressId: string,
		input: { verified: boolean; primary: boolean },
	): Promise<unknown>;
	deleteUser(userId: string): Promise<unknown>;
};

export type EnsuredSeedClerkUser = {
	created: boolean;
	user: SeedClerkUser;
};

export type EnsuredSeedClerkUsers = {
	owner: EnsuredSeedClerkUser;
	member: EnsuredSeedClerkUser;
};

type SeedClerkUserPolicy = {
	allowReuse: boolean;
};

type SeedClerkUserInput = {
	email: string;
	firstName: string;
	lastName: string;
};

type SeedClerkUserUpdate = {
	password: string;
	firstName: string;
	lastName: string;
	skipPasswordChecks: true;
};

type SeedClerkUserCreate = {
	emailAddress: string[];
	password: string;
	firstName: string;
	lastName: string;
	skipPasswordChecks: true;
};

export async function createProductionSeedClerkClient(): Promise<SeedClerkClient> {
	const { secretKey } = readClerkServerConfig();
	const { createClerkClient } = await import("@clerk/backend");
	const clerk = createClerkClient({ secretKey });
	return {
		getUserList: (input) => clerk.users.getUserList(input),
		createUser: (input) => clerk.users.createUser(input),
		updateUser: (userId, input) => clerk.users.updateUser(userId, input),
		disableUserMFA: (userId) => clerk.users.disableUserMFA(userId),
		updateEmailAddress: (emailAddressId, input) =>
			clerk.emailAddresses.updateEmailAddress(emailAddressId, input),
		deleteUser: (userId) => clerk.users.deleteUser(userId),
	};
}

export async function createSeedClerkUsers(
	client: SeedClerkClient,
	mode: SeedClerkMode,
	policy: SeedClerkUserPolicy = { allowReuse: true },
): Promise<SeedClerkUsers> {
	const users = await ensureSeedClerkUsers(client, mode, policy);
	return { owner: users.owner.user, member: users.member.user };
}

export async function assertStagingSeedClerkUsersDoNotExist(
	client: SeedClerkClient,
	mode: SeedClerkMode,
): Promise<void> {
	const [owner, member] = await Promise.all([
		findSeedClerkUserByEmail(client, mode.ownerEmail),
		findSeedClerkUserByEmail(client, mode.memberEmail),
	]);
	if (!owner && !member) return;

	throw new Error(STAGING_SEED_EXISTING_CLERK_USER_ERROR);
}

export async function ensureSeedClerkUsers(
	client: SeedClerkClient,
	mode: SeedClerkMode,
	policy: SeedClerkUserPolicy,
): Promise<EnsuredSeedClerkUsers> {
	const owner = await ensureSeedClerkUser(
		client,
		{
			email: mode.ownerEmail,
			firstName: "Seed",
			lastName: "Owner",
		},
		policy,
	);

	let member: EnsuredSeedClerkUser;
	try {
		member = await ensureSeedClerkUser(
			client,
			{
				email: mode.memberEmail,
				firstName: "Seed",
				lastName: "Member",
			},
			policy,
		);
	} catch (error) {
		if (owner.created) {
			await cleanupSeedClerkUsers(client, [{ user: owner.user }]);
		}
		throw error;
	}

	if (owner.user.id === member.user.id) {
		await cleanupSeedClerkUsers(
			client,
			[
				owner.created ? { user: owner.user } : null,
				member.created ? { user: member.user } : null,
			].filter((user): user is { user: SeedClerkUser } => Boolean(user)),
		);
		throw new Error(
			`Refusing to seed because Owner ${mode.ownerEmail} and Member ${mode.memberEmail} resolve to the same Clerk User ${owner.user.id}. Use an EMAIL whose derived +member address belongs to a separate Clerk User.`,
		);
	}

	return { owner, member };
}

export async function cleanupSeedClerkUsers(
	client: SeedClerkClient,
	usersToDelete: { user: SeedClerkUser }[],
): Promise<void> {
	for (const { user } of usersToDelete) {
		try {
			await client.deleteUser(user.id);
		} catch (error) {
			console.error(
				`[seed] ERROR: Failed to delete created Clerk User ${user.id}. Delete it manually. ${redactSeedClerkError(asError(error).message)}`,
			);
		}
	}
}

export function redactSeedClerkError(value: string): string {
	return redactString(value)
		.replace(CLERK_SECRET_KEY_PATTERN, "[REDACTED_CLERK_SECRET]")
		.replaceAll(SEED_TEST_PASSWORD, "[REDACTED_SEED_PASSWORD]");
}

async function ensureSeedClerkUser(
	client: SeedClerkClient,
	input: SeedClerkUserInput,
	policy: SeedClerkUserPolicy,
): Promise<EnsuredSeedClerkUser> {
	const existing = await findSeedClerkUserByEmail(client, input.email);
	if (existing) {
		if (!policy.allowReuse) {
			throw new Error(STAGING_SEED_EXISTING_CLERK_USER_ERROR);
		}
		const user = await client.updateUser(
			existing.id,
			seedClerkUserUpdate(input),
		);
		await verifySeedClerkEmailAddress(client, user, input.email);
		await client.disableUserMFA(user.id);
		return { created: false, user };
	}

	const user = await client.createUser(seedClerkUserCreate(input));
	try {
		await verifySeedClerkEmailAddress(client, user, input.email);
		await client.disableUserMFA(user.id);
		return { created: true, user };
	} catch (error) {
		await cleanupSeedClerkUsers(client, [{ user }]);
		throw error;
	}
}

async function verifySeedClerkEmailAddress(
	client: SeedClerkClient,
	user: SeedClerkUser,
	email: string,
): Promise<void> {
	const normalizedEmail = email.toLowerCase();
	const emailAddressId =
		user.emailAddresses.find(
			(address) => address.emailAddress.toLowerCase() === normalizedEmail,
		)?.id ?? user.primaryEmailAddressId;

	if (!emailAddressId) {
		throw new Error(
			`Unable to verify Clerk seed email ${email}: missing email address id.`,
		);
	}

	await client.updateEmailAddress(emailAddressId, {
		verified: true,
		primary: true,
	});
}

async function findSeedClerkUserByEmail(
	client: SeedClerkClient,
	email: string,
): Promise<SeedClerkUser | null> {
	const normalizedEmail = email.toLowerCase();
	const response = await client.getUserList({ query: email });
	return (
		response.data.find((user) =>
			user.emailAddresses.some(
				(address) => address.emailAddress.toLowerCase() === normalizedEmail,
			),
		) ?? null
	);
}

function seedClerkUserUpdate(input: SeedClerkUserInput): SeedClerkUserUpdate {
	return {
		password: SEED_TEST_PASSWORD,
		firstName: input.firstName,
		lastName: input.lastName,
		skipPasswordChecks: true,
	};
}

function seedClerkUserCreate(input: SeedClerkUserInput): SeedClerkUserCreate {
	return {
		...seedClerkUserUpdate(input),
		emailAddress: [input.email],
	};
}
