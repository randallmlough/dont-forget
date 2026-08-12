import {
	assertLocalSeedPrerequisites,
	assertSeedPrerequisites,
	deriveSeedMemberEmail,
	emailBackedSeedTargetForMode,
	emailSeedDataTarget,
	formatSeedCliError,
	formatSeedConflictMessage,
	formatStagingSeedSuccess,
	normalizeSeedEmail,
	parseOptionalSeedEmail,
	type SeedMode,
	seedEmailBackedDatabasesForRuntime,
} from "./seed";
import {
	SEED_TEST_PASSWORD,
	type SeedClerkClient,
	type SeedClerkUser,
} from "./seed-clerk";

function clerkUser(id: string, email: string): SeedClerkUser {
	const emailAddressId = `${id}_email`;
	return {
		id,
		primaryEmailAddressId: emailAddressId,
		emailAddresses: [{ id: emailAddressId, emailAddress: email }],
	};
}

function mockCreateUser() {
	return jest.fn<
		ReturnType<SeedClerkClient["createUser"]>,
		Parameters<SeedClerkClient["createUser"]>
	>();
}

function mockUpdateUser() {
	return jest.fn<
		ReturnType<SeedClerkClient["updateUser"]>,
		Parameters<SeedClerkClient["updateUser"]>
	>();
}

function mockDeleteUser() {
	return jest.fn<
		ReturnType<SeedClerkClient["deleteUser"]>,
		Parameters<SeedClerkClient["deleteUser"]>
	>();
}

function mockDisableUserMFA() {
	return jest.fn<
		ReturnType<SeedClerkClient["disableUserMFA"]>,
		Parameters<SeedClerkClient["disableUserMFA"]>
	>();
}

function mockUpdateEmailAddress() {
	return jest.fn<
		ReturnType<SeedClerkClient["updateEmailAddress"]>,
		Parameters<SeedClerkClient["updateEmailAddress"]>
	>();
}

describe("seed runtime policy", () => {
	it("allows deterministic local seeding without confirmation", () => {
		expect(() =>
			assertSeedPrerequisites({
				appEnv: "local",
				seedMode: { kind: "deterministic" },
				env: { APP_ENV: "local" },
			}),
		).not.toThrow();
	});

	it("allows EMAIL-backed local seeding without confirmation", () => {
		expect(() =>
			assertSeedPrerequisites({
				appEnv: "local",
				seedMode: {
					kind: "clerk",
					ownerEmail: "owner@example.com",
					memberEmail: "owner+member@example.com",
				},
				env: { APP_ENV: "local", CLERK_SECRET_KEY: "sk_test_valid" },
			}),
		).not.toThrow();
	});

	it("refuses deterministic staging seeding", () => {
		expect(() =>
			assertSeedPrerequisites({
				appEnv: "staging",
				seedMode: { kind: "deterministic" },
				env: {
					APP_ENV: "staging",
					CONFIRM_STAGING_SEED: "staging",
				},
			}),
		).toThrow("Staging seed requires EMAIL");
	});

	it.each([
		undefined,
		"production",
		"STAGING",
	])("refuses EMAIL-backed staging seeding unless confirmation is exact (%s)", (confirmStagingSeed) => {
		expect(() =>
			assertSeedPrerequisites({
				appEnv: "staging",
				seedMode: {
					kind: "clerk",
					ownerEmail: "owner@example.com",
					memberEmail: "owner+member@example.com",
				},
				env: {
					APP_ENV: "staging",
					CLERK_SECRET_KEY: "sk_test_valid",
					CONFIRM_STAGING_SEED: confirmStagingSeed,
				},
			}),
		).toThrow("CONFIRM_STAGING_SEED=staging");
	});

	it("allows confirmed EMAIL-backed staging seeding", () => {
		expect(() =>
			assertSeedPrerequisites({
				appEnv: "staging",
				seedMode: {
					kind: "clerk",
					ownerEmail: "owner@example.com",
					memberEmail: "owner+member@example.com",
				},
				env: {
					APP_ENV: "staging",
					CLERK_SECRET_KEY: "sk_test_valid",
					CONFIRM_STAGING_SEED: "staging",
				},
			}),
		).not.toThrow();
	});

	it.each(["test", "production"] satisfies (
		| "test"
		| "production"
	)[])("always refuses %s seeding", (appEnv) => {
		const seedModes = [
			{ kind: "deterministic" },
			{
				kind: "clerk",
				ownerEmail: "owner@example.com",
				memberEmail: "owner+member@example.com",
			},
		] satisfies SeedMode[];

		for (const seedMode of seedModes) {
			expect(() =>
				assertSeedPrerequisites({
					appEnv,
					seedMode,
					env: {
						APP_ENV: appEnv,
						CLERK_SECRET_KEY:
							appEnv === "production" ? "sk_live_valid" : "sk_test_valid",
						CONFIRM_APP_ENV: appEnv,
						CONFIRM_STAGING_SEED: "staging",
					},
				}),
			).toThrow(`Seeding is forbidden for APP_ENV=${appEnv}`);
		}
	});

	it("formats a staging cleanup manifest without seed credentials or values", () => {
		const output = formatStagingSeedSuccess({
			householdId: "hh_staging",
			appUserIds: ["usr_owner", "usr_member", "usr_cameron"],
			membershipIds: ["mbr_owner", "mbr_member", "mbr_cameron"],
			joinCodeRowIds: ["hjc_staging"],
			listIds: ["lst_1", "lst_2", "lst_3", "lst_4", "lst_5"],
			itemIds: Array.from({ length: 12 }, (_, index) => `itm_${index + 1}`),
			itemCheckIds: ["chk_1", "chk_2", "chk_3"],
			clerkUsers: {
				owner: { id: "user_clerk_owner", status: "created" },
				member: { id: "user_clerk_member", status: "created" },
			},
		});

		expect(output).toContain("STAGING SEED PASS");
		for (const id of [
			"hh_staging",
			"usr_owner",
			"usr_member",
			"usr_cameron",
			"mbr_owner",
			"mbr_member",
			"mbr_cameron",
			"hjc_staging",
			"user_clerk_owner",
			"user_clerk_member",
		]) {
			expect(output).toContain(id);
		}
		expect(output).toContain("created=2 reused=0");
		expect(output).toContain(
			"households=1 app_users=3 memberships=3 join_code_rows=1 lists=5 items=12 item_checks=3",
		);
		for (const secret of [
			"owner@example.com",
			SEED_TEST_PASSWORD,
			"BCDEFGHJ",
			"invitation-token",
		]) {
			expect(output).not.toContain(secret);
		}
	});

	it("formats one redacted CLI error message without a stack", () => {
		const error = new Error(
			`seed failed for owner@example.com with Bearer secret-token, eyJheader.payload.signature, sk_test_cli-secret, sk_live_cli-secret, and ${SEED_TEST_PASSWORD}`,
		);
		error.stack = "STACK_SENTINEL owner@example.com";

		const output = formatSeedCliError(error);

		expect(typeof output).toBe("string");
		expect(output).toContain("[REDACTED_EMAIL]");
		expect(output).toContain("Bearer [REDACTED]");
		expect(output).toContain("[REDACTED_JWT]");
		expect(output).not.toContain("owner@example.com");
		expect(output).not.toContain("secret-token");
		expect(output).not.toContain("eyJheader.payload.signature");
		expect(output).not.toContain("sk_test_cli-secret");
		expect(output).not.toContain("sk_live_cli-secret");
		expect(output).not.toContain(SEED_TEST_PASSWORD);
		expect(output).not.toContain("STACK_SENTINEL");
	});
});

describe("seed EMAIL helpers", () => {
	it("returns deterministic mode when EMAIL is missing", () => {
		expect(parseOptionalSeedEmail({})).toEqual({ kind: "deterministic" });
	});

	it("returns deterministic mode when EMAIL is blank", () => {
		expect(parseOptionalSeedEmail({ EMAIL: " \t " })).toEqual({
			kind: "deterministic",
		});
	});

	it("normalizes mixed-case space-padded EMAIL", () => {
		expect(normalizeSeedEmail("  Owner@Example.COM ")).toBe(
			"owner@example.com",
		);
		expect(parseOptionalSeedEmail({ EMAIL: "  Owner@Example.COM " })).toEqual({
			kind: "clerk",
			ownerEmail: "owner@example.com",
			memberEmail: "owner+member@example.com",
		});
	});

	it("derives the sign-inable Member email", () => {
		expect(deriveSeedMemberEmail("email@email.com")).toBe(
			"email+member@email.com",
		);
	});

	it("preserves existing plus tags when deriving the Member email", () => {
		expect(deriveSeedMemberEmail("randy+seed@example.com")).toBe(
			"randy+seed+member@example.com",
		);
	});

	it("rejects invalid EMAIL values", () => {
		expect(() => parseOptionalSeedEmail({ EMAIL: "not-an-email" })).toThrow(
			/EMAIL/,
		);
	});

	it("formats deterministic seed conflicts with the DB-only rebuild command", () => {
		expect(
			formatSeedConflictMessage(["1 Household row(s)"], {
				kind: "deterministic",
			}),
		).toContain(
			"Run make db-reseed only if you intend to reset all local app data.",
		);
	});

	it("formats EMAIL seed conflicts without recommending a reset", () => {
		const message = formatSeedConflictMessage(["1 Household row(s)"], {
			kind: "clerk",
			ownerEmail: "owner@example.com",
			memberEmail: "owner+member@example.com",
		});

		expect(message).toContain(
			"Matching Clerk development Users were repaired before this check.",
		);
		expect(message).toContain(
			"Do not run make db-reseed unless you intend to reset all local app data.",
		);
	});

	it("derives an email-scoped seed target outside the deterministic seed IDs", () => {
		const target = emailBackedSeedTargetForMode({
			kind: "clerk",
			ownerEmail: "jun15_3@email.com",
			memberEmail: "jun15_3+member@email.com",
		});

		expect(target.seed.users.avery.id).not.toBe("usr_avery");
		expect(target.seed.users.cameron).toEqual(
			expect.objectContaining({
				id: expect.stringMatching(/^usr_seed_[a-f0-9]+_cameron$/),
				clerkUserId: expect.stringMatching(/^user_seed_[a-f0-9]+_cameron$/),
				email: "jun15_3+cameron@email.com",
			}),
		);
		expect(target.seed.users.cameron.clerkUserId).not.toBe("user_cameron");
		expect(target.seed.household.id).not.toBe("hh_avery");
		expect(target.seed.memberships.avery.id).not.toBe("mbr_avery");
		expect(target.seed.joinCode.id).not.toBe("hjc_avery_active");
		expect(target.seed.joinCode.code).toMatch(/^[23456789A-HJ-NP-Z]{8}$/);
		expect(target.seed.lists?.groceries.id).toMatch(
			/^lst_default_groceries_[a-f0-9]+$/,
		);
		expect(target.seed.lists?.hardware.id).toMatch(
			/^lst_seed_hardware_[a-f0-9]+$/,
		);
		expect(target.seed.items?.unchecked.id).toMatch(
			/^itm_seed_milk_[a-f0-9]+$/,
		);
		expect(target.seed.items?.hardwareBatteries.id).toMatch(
			/^itm_seed_batteries_[a-f0-9]+$/,
		);
		expect(target.seed.lists?.groceries.id).not.toBe("lst_default_groceries");
		expect(target.seed.items?.unchecked.id).not.toBe("itm_seed_milk");
	});

	it("derives disjoint seed IDs for different EMAIL values", () => {
		const first = emailBackedSeedTargetForMode({
			kind: "clerk",
			ownerEmail: "jun15_1@email.com",
			memberEmail: "jun15_1+member@email.com",
		});
		const second = emailBackedSeedTargetForMode({
			kind: "clerk",
			ownerEmail: "jun15_2@email.com",
			memberEmail: "jun15_2+member@email.com",
		});

		const firstIds = new Set(seedTargetIds(first));
		const secondIds = seedTargetIds(second);

		expect(secondIds).toEqual(
			expect.arrayContaining([
				second.seed.users.cameron.clerkUserId,
				second.seed.lists?.groceries.id,
				second.seed.items?.unchecked.id,
			]),
		);
		expect(secondIds.every((id) => !firstIds.has(id))).toBe(true);
	});

	it("preflights actual Clerk IDs for EMAIL seed users", () => {
		const mode = {
			kind: "clerk" as const,
			ownerEmail: "owner@example.com",
			memberEmail: "owner+member@example.com",
		};
		const target = emailBackedSeedTargetForMode(mode);

		expect(
			emailSeedDataTarget(target, mode, [
				"user_existing_owner",
				"user_existing_member",
			]).clerkUserIds,
		).toEqual([
			"user_existing_owner",
			"user_existing_member",
			target.seed.users.cameron.clerkUserId,
		]);
	});

	it("preflights Clerk server config for EMAIL seed mode", () => {
		const seedMode = {
			kind: "clerk" as const,
			ownerEmail: "owner@example.com",
			memberEmail: "owner+member@example.com",
		};

		expect(() =>
			assertLocalSeedPrerequisites({
				seedMode,
				env: { APP_ENV: "local", CLERK_SECRET_KEY: "sk_live_wrong" },
			}),
		).toThrow(/CLERK_SECRET_KEY/);
		expect(() =>
			assertLocalSeedPrerequisites({
				seedMode,
				env: { APP_ENV: "local" },
			}),
		).toThrow(/CLERK_SECRET_KEY/);
		expect(() =>
			assertLocalSeedPrerequisites({
				seedMode,
				env: { APP_ENV: "local", CLERK_SECRET_KEY: "sk_test_valid" },
			}),
		).not.toThrow();
	});
});

function seedTargetIds(
	target: ReturnType<typeof emailBackedSeedTargetForMode>,
) {
	return [
		...Object.values(target.seed.users).flatMap((user) => [
			user.id,
			"clerkUserId" in user ? user.clerkUserId : undefined,
			"email" in user ? user.email : undefined,
		]),
		target.seed.household.id,
		...Object.values(target.seed.memberships).map(
			(membership) => membership.id,
		),
		target.seed.joinCode.id,
		target.seed.joinCode.code,
		...Object.values(target.seed.lists ?? {}).map((list) => list.id),
		...Object.values(target.seed.items ?? {}).map((item) => item.id),
	].filter((id): id is string => typeof id === "string");
}

describe("EMAIL-backed seed orchestration", () => {
	it("refuses injected staging orchestration without exact confirmation", async () => {
		const client: SeedClerkClient = {
			getUserList: jest.fn(),
			createUser: jest.fn(),
			updateUser: jest.fn(),
			disableUserMFA: jest.fn(),
			updateEmailAddress: jest.fn(),
			deleteUser: jest.fn(),
		};
		const createPool = jest.fn(() => {
			throw new Error("pool must not be created");
		});
		const createDirectory = jest.fn(() => {
			throw new Error("directory must not be created");
		});

		await expect(
			seedEmailBackedDatabasesForRuntime({
				appEnv: "staging",
				seedMode: {
					kind: "clerk",
					ownerEmail: "owner@example.com",
					memberEmail: "owner+member@example.com",
				},
				env: {
					APP_ENV: "staging",
					CLERK_SECRET_KEY: "sk_test_valid",
				},
				clerkClient: client,
				createPool,
				createDirectory,
			}),
		).rejects.toThrow("CONFIRM_STAGING_SEED=staging");
		for (const clerkCall of Object.values(client)) {
			expect(clerkCall).not.toHaveBeenCalled();
		}
		expect(createPool).not.toHaveBeenCalled();
		expect(createDirectory).not.toHaveBeenCalled();
	});

	it.each(["test", "production"] satisfies (
		| "test"
		| "production"
	)[])("always refuses injected %s orchestration", async (appEnv) => {
		const client: SeedClerkClient = {
			getUserList: jest.fn(),
			createUser: jest.fn(),
			updateUser: jest.fn(),
			disableUserMFA: jest.fn(),
			updateEmailAddress: jest.fn(),
			deleteUser: jest.fn(),
		};
		const createPool = jest.fn(() => {
			throw new Error("pool must not be created");
		});
		const createDirectory = jest.fn(() => {
			throw new Error("directory must not be created");
		});

		await expect(
			seedEmailBackedDatabasesForRuntime({
				appEnv,
				seedMode: {
					kind: "clerk",
					ownerEmail: "owner@example.com",
					memberEmail: "owner+member@example.com",
				},
				env: {
					APP_ENV: appEnv,
					CLERK_SECRET_KEY:
						appEnv === "production" ? "sk_live_valid" : "sk_test_valid",
					CONFIRM_STAGING_SEED: "staging",
				},
				clerkClient: client,
				createPool,
				createDirectory,
			}),
		).rejects.toThrow(`Seeding is forbidden for APP_ENV=${appEnv}`);
		for (const clerkCall of Object.values(client)) {
			expect(clerkCall).not.toHaveBeenCalled();
		}
		expect(createPool).not.toHaveBeenCalled();
		expect(createDirectory).not.toHaveBeenCalled();
	});

	it("refuses a Clerk User that appears after staging preflight", async () => {
		const mode = {
			kind: "clerk" as const,
			ownerEmail: "owner@example.com",
			memberEmail: "owner+member@example.com",
		};
		const owner = clerkUser("user_seed_owner", mode.ownerEmail);
		const racedMember = clerkUser("user_existing_member", mode.memberEmail);
		const getUserList = jest
			.fn<
				ReturnType<SeedClerkClient["getUserList"]>,
				Parameters<SeedClerkClient["getUserList"]>
			>()
			.mockResolvedValueOnce({ data: [] })
			.mockResolvedValueOnce({ data: [] })
			.mockResolvedValueOnce({ data: [] })
			.mockResolvedValueOnce({ data: [racedMember] });
		const createUser = mockCreateUser().mockResolvedValueOnce(owner);
		const updateUser = mockUpdateUser();
		const updateEmailAddress = mockUpdateEmailAddress();
		const disableUserMFA = mockDisableUserMFA();
		const deleteUser = mockDeleteUser();
		const createPool = jest.fn(() => {
			throw new Error("pool must not be created");
		});
		const createDirectory = jest.fn(() => {
			throw new Error("directory must not be created");
		});
		const client: SeedClerkClient = {
			getUserList,
			createUser,
			updateUser,
			disableUserMFA,
			updateEmailAddress,
			deleteUser,
		};

		await expect(
			seedEmailBackedDatabasesForRuntime({
				appEnv: "staging",
				seedMode: mode,
				env: {
					APP_ENV: "staging",
					CLERK_SECRET_KEY: "sk_test_valid",
					CONFIRM_STAGING_SEED: "staging",
				},
				clerkClient: client,
				createPool,
				createDirectory,
			}),
		).rejects.toThrow(
			"Staging seed requires new Clerk Users for both Owner and Member",
		);

		expect(getUserList.mock.calls).toEqual([
			[{ query: mode.ownerEmail }],
			[{ query: mode.memberEmail }],
			[{ query: mode.ownerEmail }],
			[{ query: mode.memberEmail }],
		]);
		expect(createUser).toHaveBeenCalledTimes(1);
		expect(updateUser).not.toHaveBeenCalled();
		expect(updateEmailAddress).toHaveBeenCalledTimes(1);
		expect(updateEmailAddress).toHaveBeenCalledWith(
			owner.primaryEmailAddressId,
			{
				verified: true,
				primary: true,
			},
		);
		expect(disableUserMFA).toHaveBeenCalledWith(owner.id);
		expect(disableUserMFA).not.toHaveBeenCalledWith(racedMember.id);
		expect(deleteUser).toHaveBeenCalledTimes(1);
		expect(deleteUser).toHaveBeenCalledWith(owner.id);
		expect(deleteUser).not.toHaveBeenCalledWith(racedMember.id);
		expect(createPool).not.toHaveBeenCalled();
		expect(createDirectory).not.toHaveBeenCalled();
	});

	it("cleans both fresh Clerk Users when pool creation fails", async () => {
		const mode = {
			kind: "clerk" as const,
			ownerEmail: "owner@example.com",
			memberEmail: "owner+member@example.com",
		};
		const owner = clerkUser("user_seed_owner", mode.ownerEmail);
		const member = clerkUser("user_seed_member", mode.memberEmail);
		const deleteUser = mockDeleteUser();
		const createDirectory = jest.fn(() => {
			throw new Error("directory must not be created");
		});
		const client: SeedClerkClient = {
			getUserList: jest.fn(async () => ({ data: [] })),
			createUser: mockCreateUser()
				.mockResolvedValueOnce(owner)
				.mockResolvedValueOnce(member),
			updateUser: jest.fn(),
			disableUserMFA: jest.fn(),
			updateEmailAddress: jest.fn(),
			deleteUser,
		};

		await expect(
			seedEmailBackedDatabasesForRuntime({
				appEnv: "staging",
				seedMode: mode,
				env: {
					APP_ENV: "staging",
					CLERK_SECRET_KEY: "sk_test_valid",
					CONFIRM_STAGING_SEED: "staging",
				},
				clerkClient: client,
				createPool: () => {
					throw new Error("pool creation failed");
				},
				createDirectory,
			}),
		).rejects.toThrow("pool creation failed");
		expect(deleteUser.mock.calls).toEqual([[owner.id], [member.id]]);
		expect(createDirectory).not.toHaveBeenCalled();
	});

	it("does not clean reused local Clerk Users when DB setup fails", async () => {
		const mode = {
			kind: "clerk" as const,
			ownerEmail: "owner@example.com",
			memberEmail: "owner+member@example.com",
		};
		const owner = clerkUser("user_existing_owner", mode.ownerEmail);
		const member = clerkUser("user_existing_member", mode.memberEmail);
		const end = jest.fn(async () => undefined);
		const deleteUser = mockDeleteUser();
		const client: SeedClerkClient = {
			getUserList: jest.fn(async ({ query }) => ({
				data: query === mode.ownerEmail ? [owner] : [member],
			})),
			createUser: jest.fn(),
			updateUser: mockUpdateUser()
				.mockResolvedValueOnce(owner)
				.mockResolvedValueOnce(member),
			disableUserMFA: jest.fn(),
			updateEmailAddress: jest.fn(),
			deleteUser,
		};

		await expect(
			seedEmailBackedDatabasesForRuntime({
				appEnv: "local",
				seedMode: mode,
				env: {
					APP_ENV: "local",
					CLERK_SECRET_KEY: "sk_test_valid",
				},
				clerkClient: client,
				createPool: () => ({ end }),
				createDirectory: () => {
					throw new Error("DB setup failed");
				},
			}),
		).rejects.toThrow("DB setup failed");
		expect(deleteUser).not.toHaveBeenCalled();
		expect(end).toHaveBeenCalledTimes(1);
	});
});
