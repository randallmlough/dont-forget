import { renderHook, waitFor } from "@testing-library/react-native";
import { setMockUserState } from "@/lib/test/mocks/clerk";
import { identify, useAnalyticsIdentity } from "./analytics";
import { posthog } from "./posthog";

const identifyMock = posthog.identify as jest.MockedFunction<
	typeof posthog.identify
>;

describe("analytics identity", () => {
	it("identifies Users without email, name, or avatar traits", async () => {
		setMockUserState({
			user: {
				id: "user_avery",
				primaryEmailAddress: { emailAddress: "avery@example.com" },
				fullName: "Avery Chen",
				imageUrl: "https://images.example/avatar.png",
				createdAt: new Date("2026-01-02T03:04:05.000Z"),
			},
		});

		renderHook(() => useAnalyticsIdentity());

		await waitFor(() => expect(identifyMock).toHaveBeenCalledTimes(1));
		expect(identifyMock).toHaveBeenCalledWith("user_avery", {
			$set_once: { created_at: "2026-01-02T03:04:05.000Z" },
		});
		expect(JSON.stringify(identifyMock.mock.calls[0])).not.toContain(
			"avery@example.com",
		);
		expect(JSON.stringify(identifyMock.mock.calls[0])).not.toContain(
			"Avery Chen",
		);
		expect(JSON.stringify(identifyMock.mock.calls[0])).not.toContain(
			"avatar.png",
		);
	});

	it("redacts direct identify traits before sending them to PostHog", () => {
		identify("user_avery", {
			$set: {
				email: "avery@example.com",
				token: "secret-token",
				nested: { next: "/households/join?code=ABCDEFGH" },
			},
		});

		expect(identifyMock).toHaveBeenCalledWith("user_avery", {
			$set: {
				email: "[REDACTED]",
				token: "[REDACTED]",
				nested: { next: "/households/join?code=[REDACTED]" },
			},
		});
	});
});
