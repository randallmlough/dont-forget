jest.mock("@/db/client", () => {
	throw new Error("server DB client imported during route registration");
});

jest.mock("@/lib/server/auth", () => {
	throw new Error("server auth imported during route registration");
});

jest.mock("@/lib/server/bootstrap", () => {
	throw new Error("server bootstrap imported during route registration");
});

import { POST } from "@/app/api/bootstrap+api";

describe("bootstrap API route", () => {
	it("does not load server-only dependencies during route registration", () => {
		expect(typeof POST).toBe("function");
	});
});
