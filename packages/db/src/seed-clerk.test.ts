import {
	assertStagingSeedClerkUsersDoNotExist,
	createSeedClerkUsers,
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

describe("seed Clerk lifecycle", () => {
	it.each([
		["Owner", "owner@example.com"],
		["Member", "owner+member@example.com"],
	] as const)("rejects staging when the exact %s Clerk User already exists", async (_role, existingEmail) => {
		const mode = {
			kind: "clerk" as const,
			ownerEmail: "owner@example.com",
			memberEmail: "owner+member@example.com",
		};
		const existing = clerkUser("user_existing", existingEmail);
		const getUserList = jest.fn(async ({ query }: { query: string }) => ({
			data: query === existingEmail ? [existing] : [],
		}));
		const client: SeedClerkClient = {
			getUserList,
			createUser: jest.fn(),
			updateUser: jest.fn(),
			disableUserMFA: jest.fn(),
			updateEmailAddress: jest.fn(),
			deleteUser: jest.fn(),
		};

		await expect(
			assertStagingSeedClerkUsersDoNotExist(client, mode),
		).rejects.toThrow(
			"Staging seed requires new Clerk Users for both Owner and Member",
		);
		expect(getUserList.mock.calls).toEqual([
			[{ query: mode.ownerEmail }],
			[{ query: mode.memberEmail }],
		]);
		for (const mutation of [
			client.createUser,
			client.updateUser,
			client.updateEmailAddress,
			client.disableUserMFA,
			client.deleteUser,
		]) {
			expect(mutation).not.toHaveBeenCalled();
		}
	});

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

	it("logs only redacted manual cleanup details when cleanup deletion fails", async () => {
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
				.mockRejectedValueOnce(
					new Error(
						`cleanup failed for owner@example.com with Bearer cleanup-secret, sk_test_cleanup-secret, sk_live_cleanup-secret, and ${SEED_TEST_PASSWORD}`,
					),
				),
		};

		try {
			await expect(
				createSeedClerkUsers(client, {
					kind: "clerk",
					ownerEmail: "owner@example.com",
					memberEmail: "owner+member@example.com",
				}),
			).rejects.toThrow("member creation failed");
			expect(consoleError).toHaveBeenCalledTimes(1);
			expect(consoleError).toHaveBeenCalledWith(
				expect.stringContaining("user_seed_owner"),
			);
			expect(consoleError).toHaveBeenCalledWith(
				expect.stringContaining("[REDACTED_EMAIL]"),
			);
			expect(consoleError).toHaveBeenCalledWith(
				expect.stringContaining("Bearer [REDACTED]"),
			);
			expect(consoleError).not.toHaveBeenCalledWith(
				expect.stringContaining("owner@example.com"),
			);
			expect(consoleError).not.toHaveBeenCalledWith(
				expect.stringContaining("sk_test_cleanup-secret"),
			);
			expect(consoleError).not.toHaveBeenCalledWith(
				expect.stringContaining("sk_live_cleanup-secret"),
			);
			expect(consoleError).not.toHaveBeenCalledWith(
				expect.stringContaining(SEED_TEST_PASSWORD),
			);
			expect(consoleError).not.toHaveBeenCalledWith(expect.any(Error));
		} finally {
			consoleError.mockRestore();
		}
	});
});
