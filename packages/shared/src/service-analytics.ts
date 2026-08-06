import type { EventMap } from "./analytics-events.ts";

export type ServiceAnalytics = {
	track<K extends keyof EventMap>(event: K, properties: EventMap[K]): void;
};

export type ServiceResetAnalytics = ServiceAnalytics & {
	reset(): void;
};
