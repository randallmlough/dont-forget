import type {
	identify as identifyAnalytics,
	reset as resetAnalytics,
	screen as screenAnalytics,
	track as trackAnalytics,
	useAnalyticsIdentity as useAnalyticsIdentityHook,
} from "@mobile/lib/analytics";

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
	const findings: string[] = [];
	const activeSecrets = secrets.filter((secret) => secret.length > 0);

	trackMock.mock.calls.forEach((call, callIndex) => {
		call.forEach((argument, argumentIndex) => {
			collectSecretFindings(
				argument,
				`track[${callIndex}][${argumentIndex}]`,
				activeSecrets,
				findings,
				new WeakSet<object>(),
			);
		});
	});

	if (findings.length > 0) {
		throw new Error(
			`Analytics track calls included secret values:\n${findings.join("\n")}`,
		);
	}
}

function collectSecretFindings(
	value: unknown,
	path: string,
	secrets: readonly string[],
	findings: string[],
	seen: WeakSet<object>,
) {
	if (typeof value === "string") {
		for (const [index, secret] of secrets.entries()) {
			if (value.includes(secret)) {
				findings.push(`${path} contains secret ${index}`);
			}
		}
		return;
	}

	if (typeof value !== "object" || value === null || seen.has(value)) return;
	seen.add(value);

	if (Array.isArray(value)) {
		value.forEach((item, index) => {
			collectSecretFindings(item, `${path}[${index}]`, secrets, findings, seen);
		});
		return;
	}

	for (const [key, nested] of Object.entries(value)) {
		collectSecretFindings(nested, `${path}.${key}`, secrets, findings, seen);
	}
}

export const analyticsMocks = createMockAnalytics();

export const track = analyticsMocks.track;
export const identify = analyticsMocks.identify;
export const reset = analyticsMocks.reset;
export const screen = analyticsMocks.screen;
export const useAnalyticsIdentity = analyticsMocks.useAnalyticsIdentity;
