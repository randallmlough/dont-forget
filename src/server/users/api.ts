import { asError } from "@/shared/errors";
import { redactAttributes } from "@/shared/redact";
import type { DirectoryDb } from "@/server/db/client";
import type { User } from "@/server/db/schema/postgres";
import {
	type ApiHandlerDeps,
	authenticateApiUser,
	BadRequestError,
	errorResponse,
	isApiUnauthorizedError,
	jsonResponse,
	readJsonObject,
	withDirectory,
} from "@/server/http";
import {
	createUserService,
	type UpdateClerkUserName,
	type UserService,
} from "@/server/users/user-service";
import type {
	CurrentUser,
	UpdateUserNameResponse,
} from "@/shared/contracts/users";

const MAX_NAME_LENGTH = 50;

export type UsersApiDeps = ApiHandlerDeps & {
	createUserService?: (
		directory: DirectoryDb,
	) => Pick<UserService, "updateUserName">;
	updateClerkUserName?: UpdateClerkUserName;
};

export type UserApiDeps = UsersApiDeps;

export async function handleUpdateUserName(
	request: Request,
	deps?: UsersApiDeps,
): Promise<Response> {
	try {
		return await withDirectory(deps, async (directory) => {
			const user = await authenticateApiUser(request, directory, deps);
			const body = await readJsonObject(request);
			const input = updateUserNameInput(body);
			const updatedUser = await userService(directory, deps).updateUserName({
				clerkUserId: user.clerkUserId,
				...input,
			});

			const payload: UpdateUserNameResponse = {
				user: currentUserResponse(updatedUser),
			};
			return jsonResponse(payload);
		});
	} catch (error) {
		return usersErrorResponse(error, "Update User name API failed");
	}
}

function updateUserNameInput(body: Record<string, unknown>): {
	firstName: string | null;
	lastName: string | null;
} {
	const firstName = nullableNameField(body, "firstName");
	const lastName = nullableNameField(body, "lastName");
	if (!firstName && !lastName) {
		throw new BadRequestError("Provide a first or last name");
	}
	return { firstName, lastName };
}

function nullableNameField(
	body: Record<string, unknown>,
	key: "firstName" | "lastName",
): string | null {
	const value = body[key];
	if (value === undefined || value === null) return null;
	if (typeof value !== "string") {
		throw new BadRequestError(`Invalid ${key}`);
	}
	const trimmed = value.trim();
	if (trimmed.length === 0) return null;
	if (trimmed.length > MAX_NAME_LENGTH) {
		throw new BadRequestError(
			`${nameLabel(key)} must be 50 characters or fewer.`,
		);
	}
	return trimmed;
}

function nameLabel(key: "firstName" | "lastName"): string {
	return key === "firstName" ? "First name" : "Last name";
}

function currentUserResponse(user: User): CurrentUser {
	return {
		id: user.id,
		email: user.email,
		displayName: user.displayName,
		firstName: user.firstName,
		lastName: user.lastName,
	};
}

function userService(
	directory: DirectoryDb,
	deps: UsersApiDeps | undefined,
): Pick<UserService, "updateUserName"> {
	if (deps?.createUserService) {
		return deps.createUserService(directory);
	}
	return createUserService({
		directory,
		updateClerkUserName: deps?.updateClerkUserName,
	});
}

function usersErrorResponse(error: unknown, logMessage: string): Response {
	if (isApiUnauthorizedError(error)) return errorResponse(error.message, 401);
	if (error instanceof BadRequestError) {
		return errorResponse(error.message, 400);
	}
	console.error(logMessage, redactAttributes({ error: asError(error) }));
	return errorResponse("Something went wrong.", 500);
}
