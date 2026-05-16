import { createClerkClient, verifyToken, type User as ClerkUser } from "@clerk/backend";

import { readClerkServerConfig } from "@/lib/env";

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export type ServerUserProfile = {
  clerkUserId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
};

export async function verifyClerkRequest(request: Request): Promise<ServerUserProfile> {
  const token = bearerToken(request.headers.get("authorization"));
  const config = readClerkServerConfig();

  let clerkUserId: string | undefined;
  try {
    const payload = await verifyToken(token, { secretKey: config.secretKey });
    clerkUserId = payload.sub;
  } catch (error) {
    throw new UnauthorizedError("Invalid Clerk session token");
  }

  if (!clerkUserId) {
    throw new UnauthorizedError("Invalid Clerk session token");
  }

  const clerk = createClerkClient({ secretKey: config.secretKey });
  const user = await clerk.users.getUser(clerkUserId);
  return profileFromClerkUser(user);
}

export function bearerToken(authorization: string | null): string {
  if (!authorization) {
    throw new UnauthorizedError("Missing bearer token");
  }

  const [scheme, token, extra] = authorization.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== "bearer" || !token || extra) {
    throw new UnauthorizedError("Malformed bearer token");
  }

  return token;
}

function profileFromClerkUser(user: ClerkUser): ServerUserProfile {
  const email = primaryEmailAddress(user);
  const firstName = emptyToNull(user.firstName);
  const lastName = emptyToNull(user.lastName);
  const displayName = emptyToNull([firstName, lastName].filter(Boolean).join(" ")) ?? email;

  return {
    clerkUserId: user.id,
    email,
    firstName,
    lastName,
    displayName,
  };
}

function primaryEmailAddress(user: ClerkUser): string | null {
  const primary = user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId);
  return emptyToNull(primary?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null);
}

function emptyToNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
