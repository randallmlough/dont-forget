import { createClient } from "@libsql/client/http";

import { directoryClient, householdClient, householdDbUrl } from "./client";

jest.mock("@libsql/client/http", () => ({
  createClient: jest.fn((config: unknown) => ({ config, close: jest.fn() })),
}));

describe("remote DB clients", () => {
  beforeEach(() => {
    process.env.APP_ENV = "local";
    process.env.TURSO_DIRECTORY_AUTH_TOKEN = "directory-token";
    process.env.TURSO_DIRECTORY_URL = "libsql://directory-randy.turso.io";
    process.env.TURSO_GROUP = "dont-forget-local-randy";
    process.env.TURSO_ORG = "randy";
  });

  it("uses the HTTP libsql entrypoint for API-route-compatible remote clients", () => {
    directoryClient();
    householdClient("libsql://household-randy.turso.io", "household-token");

    expect(createClient).toHaveBeenNthCalledWith(1, {
      url: "libsql://directory-randy.turso.io",
      authToken: "directory-token",
    });
    expect(createClient).toHaveBeenNthCalledWith(2, {
      url: "libsql://household-randy.turso.io",
      authToken: "household-token",
    });
  });

  it("maps the default libsql import to the HTTP entrypoint in tests", () => {
    const defaultClient = jest.requireMock("@libsql/client") as typeof import("@libsql/client/http");

    expect(defaultClient.createClient).toBe(createClient);
  });

  it("builds remote Household DB URLs", () => {
    expect(householdDbUrl("dont-forget-local-randy-household-abc")).toBe(
      "libsql://dont-forget-local-randy-household-abc-randy.turso.io",
    );
  });
});
