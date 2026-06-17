import { POST as sendTestNotification } from "@/app/api/dev/test-notification+api";
import { GET as listInvitations } from "@/app/api/households/[householdId]/invitations+api";
import { POST as regenerateJoinCode } from "@/app/api/households/[householdId]/join-code/regenerate+api";
import {
	GET as getJoinCode,
	PATCH as setJoinCodeEnabled,
} from "@/app/api/households/[householdId]/join-code+api";
import {
	DELETE as removeMember,
	PATCH as setMemberRole,
} from "@/app/api/households/[householdId]/members/[membershipId]+api";
import { POST as leaveHousehold } from "@/app/api/households/[householdId]/members/me/leave+api";
import { GET as listMembers } from "@/app/api/households/[householdId]/members+api";
import {
	DELETE as deleteHousehold,
	PATCH as renameHousehold,
} from "@/app/api/households/[householdId]+api";
import { POST as joinByCode } from "@/app/api/households/join-code/join+api";
import { GET as previewJoinCode } from "@/app/api/households/join-code/preview+api";
import { POST as createHousehold } from "@/app/api/households+api";
import { PATCH as revokeInvitation } from "@/app/api/invitations/[invitationId]+api";
import { POST as acceptInvitation } from "@/app/api/invitations/accept+api";
import { GET as previewInvitation } from "@/app/api/invitations/preview+api";
import { POST as createInvitation } from "@/app/api/invitations+api";
import { PATCH as switchActiveHousehold } from "@/app/api/users/me/active-household+api";
import { POST as completeOnboarding } from "@/app/api/users/me/onboarding+api";
import {
	POST as registerPushToken,
	DELETE as unregisterPushToken,
} from "@/app/api/users/me/push-tokens+api";
import {
	DELETE as deleteAccount,
	PATCH as updateUserName,
} from "@/app/api/users/me+api";

jest.mock("@/lib/api/invitations/handlers", () => {
	throw new Error("Invitation API handler imported during route registration");
});

jest.mock("@/lib/api/households/handlers", () => {
	throw new Error("Household API handler imported during route registration");
});

jest.mock("@/lib/api/users/handlers", () => {
	throw new Error("Users API handler imported during route registration");
});

describe("Stage 5 API route wrappers", () => {
	it("do not load lib/api handlers during route registration", () => {
		expect(typeof createInvitation).toBe("function");
		expect(typeof previewInvitation).toBe("function");
		expect(typeof acceptInvitation).toBe("function");
		expect(typeof revokeInvitation).toBe("function");
		expect(typeof listInvitations).toBe("function");
		expect(typeof listMembers).toBe("function");
		expect(typeof removeMember).toBe("function");
		expect(typeof setMemberRole).toBe("function");
		expect(typeof leaveHousehold).toBe("function");
		expect(typeof renameHousehold).toBe("function");
		expect(typeof createHousehold).toBe("function");
		expect(typeof getJoinCode).toBe("function");
		expect(typeof setJoinCodeEnabled).toBe("function");
		expect(typeof regenerateJoinCode).toBe("function");
		expect(typeof previewJoinCode).toBe("function");
		expect(typeof joinByCode).toBe("function");
		expect(typeof switchActiveHousehold).toBe("function");
		expect(typeof deleteHousehold).toBe("function");
		expect(typeof completeOnboarding).toBe("function");
		expect(typeof registerPushToken).toBe("function");
		expect(typeof unregisterPushToken).toBe("function");
		expect(typeof sendTestNotification).toBe("function");
		expect(typeof updateUserName).toBe("function");
		expect(typeof deleteAccount).toBe("function");
	});
});
