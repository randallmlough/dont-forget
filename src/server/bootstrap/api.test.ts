import { POST } from "@/app/api/bootstrap+api";

jest.mock("@/server/db/client", () => {
	throw new Error("server DB client imported during route registration");
});

jest.mock("@/server/http", () => {
	throw new Error("server auth imported during route registration");
});

jest.mock("@/server/households/household-service", () => {
	throw new Error(
		"household server service imported during route registration",
	);
});

describe("bootstrap API route", () => {
	it("does not load server-only dependencies during route registration", () => {
		expect(typeof POST).toBe("function");
	});
});
