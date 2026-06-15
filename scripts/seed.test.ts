import {
	createSeedClerkUsers,
	deriveSeedMemberEmail,
	emailBackedSeedTargetForMode,
	emailSeedDataTarget,
	formatSeedConflictMessage,
	normalizeSeedEmail,
	parseOptionalSeedEmail,
	SEED_TEST_PASSWORD,
	type SeedClerkClient,
	type SeedClerkUser,
} from "./seed";

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
		const target = emailBackedSeedTargetForMode(
			{
				kind: "clerk",
				ownerEmail: "jun15_3@email.com",
				memberEmail: "jun15_3+member@email.com",
			},
			{
				directoryUrl: "libsql://df-local-randall.turso.io",
				org: "randall",
			},
		);

		expect(target.householdDbName).toMatch(
			/^df-local-hh-seed-avery-[a-f0-9]{8}-[a-f0-9]+$/,
		);
		expect(target.householdDbName.length).toBeLessThanOrEqual(51);
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
		const config = {
			directoryUrl: "libsql://df-local-randall.turso.io",
			org: "randall",
		};
		const first = emailBackedSeedTargetForMode(
			{
				kind: "clerk",
				ownerEmail: "jun15_1@email.com",
				memberEmail: "jun15_1+member@email.com",
			},
			config,
		);
		const second = emailBackedSeedTargetForMode(
			{
				kind: "clerk",
				ownerEmail: "jun15_2@email.com",
				memberEmail: "jun15_2+member@email.com",
			},
			config,
		);

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

	it("preserves worktree-scoped email seed DB names after truncation", () => {
		const mode = {
			kind: "clerk" as const,
			ownerEmail: "seedtest@example.com",
			memberEmail: "seedtest+member@example.com",
		};
		const first = emailBackedSeedTargetForMode(mode, {
			directoryUrl:
				"libsql://df-local-wt-shared-email-seed-prefix-alpha-dir-randall.turso.io",
			org: "randall",
		});
		const second = emailBackedSeedTargetForMode(mode, {
			directoryUrl:
				"libsql://df-local-wt-shared-email-seed-prefix-bravo-dir-randall.turso.io",
			org: "randall",
		});

		expect(first.householdDbName).not.toBe(second.householdDbName);
		expect(first.householdDbName.length).toBeLessThanOrEqual(51);
		expect(second.householdDbName.length).toBeLessThanOrEqual(51);
		expect(first.householdDbName).toMatch(/-[a-f0-9]{8}-[a-f0-9]{16}$/);
		expect(second.householdDbName).toMatch(/-[a-f0-9]{8}-[a-f0-9]{16}$/);
	});

	it("preflights actual Clerk IDs for EMAIL seed users", () => {
		const mode = {
			kind: "clerk" as const,
			ownerEmail: "owner@example.com",
			memberEmail: "owner+member@example.com",
		};
		const target = emailBackedSeedTargetForMode(mode, {
			directoryUrl: "libsql://df-local-randall.turso.io",
			org: "randall",
		});

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
});

function seedTargetIds(
	target: ReturnType<typeof emailBackedSeedTargetForMode>,
) {
	return [
		target.householdDbName,
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

describe("seed Clerk adapter", () => {
	it("reuses an existing Owner Clerk User and repairs local seed login settings", async () => {
		const owner = clerkUser("user_existing_owner", "owner@example.com");
		const member = clerkUser("user_seed_member", "owner+member@example.com");
		const createUser = mockCreateUser();
		const updateUser = mockUpdateUser().mockResolvedValueOnce(owner);
		const updateEmailAddress = mockUpdateEmailAddress();
		const client: SeedClerkClient = {
			getUserList: jest.fn(async ({ query }) => ({
				data: query === "owner@example.com" ? [owner] : [],
			})),
			createUser: createUser.mockResolvedValueOnce(member),
			updateUser,
			disableUserMFA: jest.fn(),
			updateEmailAddress,
			deleteUser: jest.fn(),
		};

		await expect(
			createSeedClerkUsers(client, {
				kind: "clerk",
				ownerEmail: "owner@example.com",
				memberEmail: "owner+member@example.com",
			}),
		).resolves.toEqual({ owner, member });
		expect(updateUser).toHaveBeenCalledWith(owner.id, {
			password: SEED_TEST_PASSWORD,
			firstName: "Seed",
			lastName: "Owner",
			skipPasswordChecks: true,
		});
		expect(createUser).toHaveBeenCalledTimes(1);
		expect(updateEmailAddress).toHaveBeenNthCalledWith(
			1,
			owner.primaryEmailAddressId,
			{ verified: true, primary: true },
		);
		expect(updateEmailAddress).toHaveBeenNthCalledWith(
			2,
			member.primaryEmailAddressId,
			{ verified: true, primary: true },
		);
		expect(client.disableUserMFA).toHaveBeenNthCalledWith(1, owner.id);
		expect(client.disableUserMFA).toHaveBeenNthCalledWith(2, member.id);
	});

	it("reuses an existing sign-inable Member Clerk User and creates no duplicate", async () => {
		const owner = clerkUser("user_seed_owner", "owner@example.com");
		const member = clerkUser(
			"user_existing_member",
			"owner+member@example.com",
		);
		const createUser = mockCreateUser().mockResolvedValueOnce(owner);
		const updateUser = mockUpdateUser().mockResolvedValueOnce(member);
		const updateEmailAddress = mockUpdateEmailAddress();
		const client: SeedClerkClient = {
			getUserList: jest.fn(async ({ query }) => ({
				data: query === "owner+member@example.com" ? [member] : [],
			})),
			createUser,
			updateUser,
			disableUserMFA: jest.fn(),
			updateEmailAddress,
			deleteUser: jest.fn(),
		};

		await expect(
			createSeedClerkUsers(client, {
				kind: "clerk",
				ownerEmail: "owner@example.com",
				memberEmail: "owner+member@example.com",
			}),
		).resolves.toEqual({ owner, member });
		expect(updateUser).toHaveBeenCalledWith(member.id, {
			password: SEED_TEST_PASSWORD,
			firstName: "Seed",
			lastName: "Member",
			skipPasswordChecks: true,
		});
		expect(createUser).toHaveBeenCalledTimes(1);
		expect(updateEmailAddress).toHaveBeenNthCalledWith(
			1,
			owner.primaryEmailAddressId,
			{ verified: true, primary: true },
		);
		expect(updateEmailAddress).toHaveBeenNthCalledWith(
			2,
			member.primaryEmailAddressId,
			{ verified: true, primary: true },
		);
		expect(client.disableUserMFA).toHaveBeenNthCalledWith(1, owner.id);
		expect(client.disableUserMFA).toHaveBeenNthCalledWith(2, member.id);
	});

	it("creates the Owner then sign-inable Member with the seed password", async () => {
		const owner = clerkUser("user_seed_owner", "owner@example.com");
		const member = clerkUser("user_seed_member", "owner+member@example.com");
		const createUser = jest
			.fn<
				ReturnType<SeedClerkClient["createUser"]>,
				Parameters<SeedClerkClient["createUser"]>
			>()
			.mockResolvedValueOnce(owner)
			.mockResolvedValueOnce(member);
		const updateEmailAddress = mockUpdateEmailAddress();
		const client: SeedClerkClient = {
			getUserList: jest.fn(async () => ({ data: [] })),
			createUser,
			updateUser: jest.fn(),
			disableUserMFA: jest.fn(),
			updateEmailAddress,
			deleteUser: jest.fn(),
		};

		await expect(
			createSeedClerkUsers(client, {
				kind: "clerk",
				ownerEmail: "owner@example.com",
				memberEmail: "owner+member@example.com",
			}),
		).resolves.toEqual({ owner, member });
		expect(createUser).toHaveBeenNthCalledWith(1, {
			emailAddress: ["owner@example.com"],
			password: SEED_TEST_PASSWORD,
			firstName: "Seed",
			lastName: "Owner",
			skipPasswordChecks: true,
		});
		expect(createUser).toHaveBeenNthCalledWith(2, {
			emailAddress: ["owner+member@example.com"],
			password: SEED_TEST_PASSWORD,
			firstName: "Seed",
			lastName: "Member",
			skipPasswordChecks: true,
		});
		expect(updateEmailAddress).toHaveBeenNthCalledWith(
			1,
			owner.primaryEmailAddressId,
			{ verified: true, primary: true },
		);
		expect(updateEmailAddress).toHaveBeenNthCalledWith(
			2,
			member.primaryEmailAddressId,
			{ verified: true, primary: true },
		);
		expect(client.disableUserMFA).toHaveBeenNthCalledWith(1, owner.id);
		expect(client.disableUserMFA).toHaveBeenNthCalledWith(2, member.id);
	});

	it("rejects Owner and Member emails that resolve to the same Clerk User", async () => {
		const shared = {
			...clerkUser("user_shared", "owner@example.com"),
			emailAddresses: [
				{ id: "owner_email", emailAddress: "owner@example.com" },
				{ id: "member_email", emailAddress: "owner+member@example.com" },
			],
		};
		const deleteUser = mockDeleteUser();
		const client: SeedClerkClient = {
			getUserList: jest.fn(async () => ({ data: [shared] })),
			createUser: jest.fn(),
			updateUser: mockUpdateUser()
				.mockResolvedValueOnce(shared)
				.mockResolvedValueOnce(shared),
			disableUserMFA: jest.fn(),
			updateEmailAddress: mockUpdateEmailAddress(),
			deleteUser,
		};

		await expect(
			createSeedClerkUsers(client, {
				kind: "clerk",
				ownerEmail: "owner@example.com",
				memberEmail: "owner+member@example.com",
			}),
		).rejects.toThrow(/same Clerk User/);
		expect(deleteUser).not.toHaveBeenCalled();
	});

	it("deletes the Owner when sign-inable Member creation fails", async () => {
		const owner = clerkUser("user_seed_owner", "owner@example.com");
		const deleteUser = mockDeleteUser();
		const client: SeedClerkClient = {
			getUserList: jest.fn(async () => ({ data: [] })),
			createUser: jest
				.fn<
					ReturnType<SeedClerkClient["createUser"]>,
					Parameters<SeedClerkClient["createUser"]>
				>()
				.mockResolvedValueOnce(owner)
				.mockRejectedValueOnce(new Error("member creation failed")),
			updateUser: jest.fn(),
			disableUserMFA: jest.fn(),
			updateEmailAddress: jest.fn(),
			deleteUser,
		};

		await expect(
			createSeedClerkUsers(client, {
				kind: "clerk",
				ownerEmail: "owner@example.com",
				memberEmail: "owner+member@example.com",
			}),
		).rejects.toThrow("member creation failed");
		expect(deleteUser).toHaveBeenCalledWith(owner.id);
	});

	it("deletes a created Clerk User when email verification repair fails", async () => {
		const owner = clerkUser("user_seed_owner", "owner@example.com");
		const deleteUser = mockDeleteUser();
		const client: SeedClerkClient = {
			getUserList: jest.fn(async () => ({ data: [] })),
			createUser: mockCreateUser().mockResolvedValueOnce(owner),
			updateUser: jest.fn(),
			disableUserMFA: jest.fn(),
			updateEmailAddress: mockUpdateEmailAddress().mockRejectedValueOnce(
				new Error("email verification failed"),
			),
			deleteUser,
		};

		await expect(
			createSeedClerkUsers(client, {
				kind: "clerk",
				ownerEmail: "owner@example.com",
				memberEmail: "owner+member@example.com",
			}),
		).rejects.toThrow("email verification failed");
		expect(deleteUser).toHaveBeenCalledWith(owner.id);
		expect(client.disableUserMFA).not.toHaveBeenCalled();
	});

	it("deletes a created Clerk User when the email address id is missing", async () => {
		const owner: SeedClerkUser = {
			id: "user_seed_owner",
			emailAddresses: [{ emailAddress: "owner@example.com" }],
		};
		const deleteUser = mockDeleteUser();
		const client: SeedClerkClient = {
			getUserList: jest.fn(async () => ({ data: [] })),
			createUser: mockCreateUser().mockResolvedValueOnce(owner),
			updateUser: jest.fn(),
			disableUserMFA: jest.fn(),
			updateEmailAddress: jest.fn(),
			deleteUser,
		};

		await expect(
			createSeedClerkUsers(client, {
				kind: "clerk",
				ownerEmail: "owner@example.com",
				memberEmail: "owner+member@example.com",
			}),
		).rejects.toThrow(/missing email address id/);
		expect(deleteUser).toHaveBeenCalledWith(owner.id);
		expect(client.updateEmailAddress).not.toHaveBeenCalled();
		expect(client.disableUserMFA).not.toHaveBeenCalled();
	});

	it("deletes a created Clerk User when disabling MFA fails", async () => {
		const owner = clerkUser("user_seed_owner", "owner@example.com");
		const deleteUser = mockDeleteUser();
		const client: SeedClerkClient = {
			getUserList: jest.fn(async () => ({ data: [] })),
			createUser: jest
				.fn<
					ReturnType<SeedClerkClient["createUser"]>,
					Parameters<SeedClerkClient["createUser"]>
				>()
				.mockResolvedValueOnce(owner),
			updateUser: jest.fn(),
			disableUserMFA: mockDisableUserMFA().mockRejectedValueOnce(
				new Error("mfa disable failed"),
			),
			updateEmailAddress: jest.fn(),
			deleteUser,
		};

		await expect(
			createSeedClerkUsers(client, {
				kind: "clerk",
				ownerEmail: "owner@example.com",
				memberEmail: "owner+member@example.com",
			}),
		).rejects.toThrow("mfa disable failed");
		expect(deleteUser).toHaveBeenCalledWith(owner.id);
	});

	it("logs manual cleanup details when cleanup deletion fails", async () => {
		const owner = clerkUser("user_seed_owner", "owner@example.com");
		const consoleError = jest
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const client: SeedClerkClient = {
			getUserList: jest.fn(async () => ({ data: [] })),
			createUser: jest
				.fn<
					ReturnType<SeedClerkClient["createUser"]>,
					Parameters<SeedClerkClient["createUser"]>
				>()
				.mockResolvedValueOnce(owner)
				.mockRejectedValueOnce(new Error("member creation failed")),
			updateUser: jest.fn(),
			disableUserMFA: jest.fn(),
			updateEmailAddress: jest.fn(),
			deleteUser: jest
				.fn<
					ReturnType<SeedClerkClient["deleteUser"]>,
					Parameters<SeedClerkClient["deleteUser"]>
				>()
				.mockRejectedValueOnce(new Error("cleanup failed")),
		};

		try {
			await expect(
				createSeedClerkUsers(client, {
					kind: "clerk",
					ownerEmail: "owner@example.com",
					memberEmail: "owner+member@example.com",
				}),
			).rejects.toThrow("member creation failed");
			expect(consoleError).toHaveBeenCalledWith(
				expect.stringContaining("user_seed_owner"),
			);
			expect(consoleError).toHaveBeenCalledWith(
				expect.stringContaining("owner@example.com"),
			);
		} finally {
			consoleError.mockRestore();
		}
	});
});
