import { useEffect } from "react";
import { useUser } from "@clerk/clerk-expo";

import { posthog } from "./posthog";
import { redactAttributes } from "./redact";
import type { EventMap } from "./analytics-events";

type PostHogProperties = NonNullable<Parameters<typeof posthog.capture>[1]>;

export type UserTraits = Record<string, unknown>;
export type ScreenProperties = Record<string, unknown>;

interface AnalyticsAdapter {
  track(event: string, properties: Record<string, unknown>): void;
  identify(userId: string, traits: UserTraits): void;
  reset(): void;
  screen(name: string, properties: ScreenProperties): void;
}

class PostHogAnalyticsAdapter implements AnalyticsAdapter {
  track(event: string, properties: Record<string, unknown>) {
    posthog.capture(event, redactAttributes(properties) as PostHogProperties);
  }
  identify(userId: string, traits: UserTraits) {
    posthog.identify(userId, traits as PostHogProperties);
  }
  reset() {
    posthog.reset();
  }
  screen(name: string, properties: ScreenProperties) {
    posthog.screen(name, redactAttributes(properties) as PostHogProperties);
  }
}

const adapter: AnalyticsAdapter = new PostHogAnalyticsAdapter();

export function track<K extends keyof EventMap>(event: K, properties: EventMap[K]): void {
  adapter.track(event, properties);
}

export function identify(userId: string, traits: UserTraits): void {
  adapter.identify(userId, traits);
}

export function reset(): void {
  adapter.reset();
}

export function screen(name: string, properties: ScreenProperties = {}): void {
  adapter.screen(name, properties);
}

/**
 * Auto-syncs the canonical user identity (Clerk `user.id`) and traits to the
 * analytics provider whenever Clerk's user object changes. Call once from
 * `RootLayout` after `ClerkProvider` is mounted. Replaces hand-rolled `identify(...)`
 * calls scattered across auth screens.
 *
 * `$set` traits update on every change. `$set_once` only ever sets the field
 * the first time the user is identified — use it for create-time facts that
 * should never be overwritten (e.g. account creation date).
 */
export function useAnalyticsIdentity(): void {
  const { user } = useUser();
  const userId = user?.id;
  const email = user?.primaryEmailAddress?.emailAddress;
  const fullName = user?.fullName;
  const imageUrl = user?.imageUrl;
  const createdAt = user?.createdAt?.toISOString();

  useEffect(() => {
    if (!userId) return;
    adapter.identify(userId, {
      $set: {
        email,
        name: fullName,
        avatar_url: imageUrl,
      },
      $set_once: {
        created_at: createdAt,
      },
    });
  }, [userId, email, fullName, imageUrl, createdAt]);
}
