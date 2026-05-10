import { redactAttributes, redactString } from "./redact";

describe("redaction", () => {
  it("redacts bearer tokens and JWT-shaped strings", () => {
    expect(redactString("Authorization: Bearer secret-token eyJabc.def.ghi")).toBe(
      "Authorization: Bearer [REDACTED] [REDACTED_JWT]",
    );
  });

  it("redacts sensitive attribute keys and normalizes Error instances", () => {
    const attributes = redactAttributes({
      token: "secret-token",
      message: "failed with Bearer secret-token",
      error: new Error("request failed with eyJabc.def.ghi"),
    });

    expect(attributes).toMatchObject({
      token: "[REDACTED]",
      message: "failed with Bearer [REDACTED]",
      error_message: "request failed with [REDACTED_JWT]",
      error_name: "Error",
    });
  });
});
