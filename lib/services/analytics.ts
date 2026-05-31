import type { EventMap } from "@/lib/analytics-events";

export type ServiceAnalytics = {
	track<K extends keyof EventMap>(event: K, properties: EventMap[K]): void;
};

export type ServiceResetAnalytics = ServiceAnalytics & {
	reset(): void;
};
