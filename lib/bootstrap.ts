export const BOOTSTRAP_API_PATH = "/api/bootstrap";
export const DEFAULT_LIST_ID = "lst_default_groceries";
export const DEFAULT_LIST_NAME = "Groceries";
export const HOUSEHOLD_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export type BootstrapResponse = {
  user: {
    id: string;
    clerkUserId: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    displayName: string | null;
  };
  activeHousehold: {
    id: string;
    name: string;
  };
  activeMember: {
    id: string;
    userId: string;
    role: "owner" | "member";
    displayName: string | null;
  };
  activeList: {
    id: string;
    name: string;
  };
  members: Array<{
    membershipId: string;
    userId: string;
    role: "owner" | "member";
    displayName: string | null;
  }>;
  householdDatabase: {
    url: string;
    authToken: string;
    expiresAt: number;
  };
};
