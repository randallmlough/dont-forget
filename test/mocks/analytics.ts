export const analyticsMocks = {
  track: jest.fn(),
  identify: jest.fn(),
  reset: jest.fn(),
  screen: jest.fn(),
  useAnalyticsIdentity: jest.fn(),
};

export const track = analyticsMocks.track;
export const identify = analyticsMocks.identify;
export const reset = analyticsMocks.reset;
export const screen = analyticsMocks.screen;
export const useAnalyticsIdentity = analyticsMocks.useAnalyticsIdentity;
