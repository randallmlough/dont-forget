import type {
	identify as identifyAnalytics,
	reset as resetAnalytics,
	screen as screenAnalytics,
	track as trackAnalytics,
	useAnalyticsIdentity as useAnalyticsIdentityHook,
} from "@/lib/analytics";

export type MockAnalytics = {
	track: jest.MockedFunction<typeof trackAnalytics>;
	identify: jest.MockedFunction<typeof identifyAnalytics>;
	reset: jest.MockedFunction<typeof resetAnalytics>;
	screen: jest.MockedFunction<typeof screenAnalytics>;
	useAnalyticsIdentity: jest.MockedFunction<typeof useAnalyticsIdentityHook>;
};

export function createMockAnalytics(): MockAnalytics {
	return {
		track: jest.fn(),
		identify: jest.fn(),
		reset: jest.fn(),
		screen: jest.fn(),
		useAnalyticsIdentity: jest.fn(),
	};
}

export function expectAnalyticsTrackCallsToOmitSecrets(
	trackMock: MockAnalytics["track"],
	secrets: readonly string[],
) {
	const serializedCalls = JSON.stringify(trackMock.mock.calls);

	for (const secret of secrets) {
		if (secret.length === 0) continue;
		expect(serializedCalls).not.toContain(secret);
	}
}

export const analyticsMocks = createMockAnalytics();

export const track = analyticsMocks.track;
export const identify = analyticsMocks.identify;
export const reset = analyticsMocks.reset;
export const screen = analyticsMocks.screen;
export const useAnalyticsIdentity = analyticsMocks.useAnalyticsIdentity;
