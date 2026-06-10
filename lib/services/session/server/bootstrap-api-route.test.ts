import { POST } from "@/app/api/bootstrap+api";

jest.mock("@/db/server/client", () => {
	throw new Error("server DB client imported during route registration");
});

jest.mock("@/lib/server/auth", () => {
	throw new Error("server auth imported during route registration");
});

jest.mock("@/lib/services/household/server", () => {
	throw new Error(
		"household server service imported during route registration",
	);
});

describe("bootstrap API route", () => {
	it("does not load server-only dependencies during route registration", () => {
		expect(typeof POST).toBe("function");
	});
});
