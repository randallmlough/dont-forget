import type { EventMap } from "@/lib/analytics-events";

export type ServiceAnalytics = {
	track<K extends keyof EventMap>(event: K, properties: EventMap[K]): void;
};

export type ServiceResetAnalytics = ServiceAnalytics & {
	reset(): void;
};

export const noopServiceAnalytics: ServiceAnalytics = {
	track() {},
};

export const noopServiceResetAnalytics: ServiceResetAnalytics = {
	track() {},
	reset() {},
};
