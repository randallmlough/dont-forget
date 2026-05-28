# Authenticated App Session Simplification Grilling Notes

Date: 2026-05-28

This note captures decisions made while stress-testing the next simplification of the signed-in app architecture. It exists so another agent or a restarted session can continue without drifting back to treating Household as the central application runtime.

## Context

The previous Active Household controller refactor moved resource ownership out of Home and decoupled Household activation from List/Item loading. Before this simplification pass, `lib/services/household/active-household-controller.ts` still owned concerns that were broader than the Household domain.

Current concern:

- The Active Household controller is really an authenticated app session runtime.
- `AuthenticatedAppSession` exposes app-session context such as active Member, Members, services, and sync coordinator.
- Household ID remains an important relationship key for Lists and Items, but that does not mean the Household service should be the app's central entity.
- "Current List" should remain selection state only, not a dedicated service/resource concept.

## Decisions Made

### 1. Rename the top-level runtime concept to AuthenticatedAppSession

The current controller should be reframed from **Active Household** to **AuthenticatedAppSession**.

Rationale:

- The current boundary owns signed-in app runtime concerns, not just Household domain behavior.
- It coordinates auth readiness, token access, authenticated app session selection/session metadata, active Member context, Household DB/runtime, sync lifecycle, and sign-out cleanup.
- Calling this "Household" makes Household look like the main central app entity instead of one domain selected inside the signed-in session.

Rejected names:

- **Auth service**: too narrow; auth should mean external identity/token/sign-out integration.
- **Active Household**: too Household-specific for a boundary that owns signed-in app runtime.

### 2. Use `lib/services/session/` for the new runtime home

The preferred location is:

```txt
lib/services/session/
```

Rationale:

- Shorter and clearer than `lib/services/authenticated-app-session/`.
- Leaves `lib/services/auth/` available for true authentication adapter work.
- Makes the signed-in runtime feel like an application session boundary instead of another Household submodule.

### 3. Keep auth thin and external-identity-focused

`auth` should stay focused on external identity provider integration:

- auth readiness
- signed-in state
- token retrieval
- sign-out call
- possibly current Clerk/User identity adapter shape

`auth` should not own active Member, Members, Household selection, Household runtime, sync lifecycle, or List/Item service composition.

### 4. Put active Member and Members in AuthenticatedAppSession

Active Member and Members are not pure auth and should not remain Household-controller output. They are app-session context: they describe who the signed-in User is inside the selected Household.

`AuthenticatedAppSession` should expose the app-facing session context needed after sign-in, including authenticated app session identity and active Member identity.

The Household service should shrink toward Household domain operations instead of being the app runtime container.

### 5. Expose session-scoped services as `services`

The ready `AuthenticatedAppSession` should expose a typed `services` object rather than top-level `listService` and `itemService` fields.

Preferred shape:

```ts
type AuthenticatedAppSession = {
  user: SessionUser;
  activeHousehold: {
    id: string;
    name: string;
  };
  activeMember: ActiveMember;
  members: Member[];
  services: AuthenticatedAppSessionServices;
};

type AuthenticatedAppSessionServices = {
  lists: ListService;
  items: ItemService;
  sync: SyncCoordinator;
};
```

Rationale:

- `services` is easier to reason about than `householdRuntime`.
- Grouping service capabilities avoids turning the top-level session into a flat service locator.
- The object is explicitly session-scoped: services are bound to the authenticated app session and authenticated app session ID.
- Route-owned hooks can call `session.services.lists.getList({ listId })` and `session.services.items.listItems({ listId })` after session readiness.

### 6. Keep `HouseholdStore`, move runtime composition to `lib/services/session/`

Keep `lib/services/household/household-store.ts` because the physical local/synced database is per Household. `HouseholdStore` accurately names the storage boundary.

Move signed-in runtime composition out of `lib/services/household/` because opening the store, composing List/Item services, managing sync, retiring resources, and exposing session-scoped `services` is authenticated app session behavior, not Household domain behavior.

Target direction:

```txt
lib/services/session/
  controller.ts
  resource-manager.ts
  services.ts
  resource-lease.ts
```

Rationale:

- The directory name carries the `session` context, so file names should stay short.
- Avoid verbose names such as `authenticated-app-session-controller.ts` and repeated `session-*` file names inside `lib/services/session/`.
- Keep domain-specific storage infrastructure named honestly as `HouseholdStore` while moving app-session orchestration to the session module.

### 7. Move app-side Authenticated App Session behavior to `session/bootstrap.ts` and `session/cache.ts`

The current Household session bootstrap/cache behavior should move out of the Household service area because it owns authenticated app session bootstrap and cache behavior, not Household domain behavior.

Preferred direction:

```txt
lib/services/session/
  bootstrap.ts
  cache.ts
```

Responsibilities:

- `bootstrap.ts`: app-safe client call to `/api/bootstrap`, response parsing, and fresh session loading.
- `cache.ts`: non-secret cached session metadata, offline startup reads, unauthorized-cache detection, pending signed-out local data deletion, and cache cleanup.

The server-only boundary must survive the refactor:

- App-safe session files must not import server-only modules.
- Any server-side bootstrap orchestration must live under a `server/` subdirectory.
- Expo API Routes must continue lazy-loading server modules inside request handlers so mobile bundling does not evaluate server-only imports.

This preserves the existing `lib/services/<domain>/server/` safety pattern while letting the session concept own the bootstrap/cache naming.

### 8. Move server bootstrap orchestration to `lib/services/session/server/`

Server-side `/api/bootstrap` orchestration should move from the Household server service area to `lib/services/session/server/bootstrap.ts`.

Target direction:

```txt
lib/services/session/
  bootstrap.ts
  cache.ts
  server/
    index.ts
    bootstrap.ts

lib/services/household/server/
  household-service.ts
  household-provisioning-service.ts
  turso-platform.ts
```

Rationale:

- `/api/bootstrap` returns the signed-in app session payload, not a Household-only domain operation.
- The server bootstrap may still compose User, Member, Household, and provisioning services.
- Household provisioning and Household domain operations stay under `lib/services/household/server/`.
- API routes must continue lazy-loading `@/lib/services/session/server` inside request handlers to preserve mobile bundle safety.

### 9. Keep authenticated app session selection inside session bootstrap/cache for now

Do not introduce separate persisted authenticated app session selection storage yet.

Rationale:

- The app does not currently have Household switching.
- Server bootstrap is still the source that chooses or creates the authenticated app session.
- A separate stored `activeHouseholdId` would create a second source of truth without a product flow that changes it.

Current source of truth:

```ts
session.activeHousehold.id
```

Future direction when Household switching exists:

```txt
lib/services/session/selection.ts
```

Potential future responsibilities:

```ts
getSelectedHouseholdId(userId)
setSelectedHouseholdId(userId, householdId)
clearSelectedHouseholdId(userId)
```

### 10. Do the deeper API simplification in the same implementation pass

The next implementation should not be only a mechanical move/rename. It should also reshape the provider/controller API around the agreed session model.

Behavioral scope stays fixed:

- no Household switching
- no new auth behavior
- no speculative generic DB abstraction
- no new product flows

Implementation scope should include:

- move signed-in runtime files to `lib/services/session/`
- rename types/APIs around `AuthenticatedAppSession`
- expose ready session capabilities through `session.services`
- move app bootstrap/cache and server bootstrap into session modules
- preserve existing Home/List/sign-out behavior through tests

### 11. Remove `view`; expose top-level `session` from the hook

Do not keep the `view` property from the Authenticated App Session controller design.

Preferred hook shape:

```ts
type AuthenticatedAppSessionHookValue = {
  state:
    | { status: "idle" }
    | { status: "loading" }
    | { status: "ready"; refreshing: boolean }
    | { status: "error"; message: string };
  session: AuthenticatedAppSession | null;
  retry: () => void;
  signOut: () => Promise<void>;
};
```

Usage:

```ts
const { state, session, retry, signOut } = useAuthenticatedAppSession();

if (session) {
  await session.services.lists.getList({ listId });
}
```

Rationale:

- `view` is vague and no longer matches the product concept.
- The usable signed-in app value is the `AuthenticatedAppSession`.
- Keeping `session` top-level avoids nested `state.session` access.
- `state` becomes lifecycle/UI metadata only.
- `session !== null` is the simple guard for whether route-owned hooks can use session-scoped services.
- A refresh can be represented as `state: { status: "ready", refreshing: true }` while the previous `session` remains usable.

### 12. Hide or remove `idle` from the public hook state

The public `useAuthenticatedAppSession()` state should expose only states that signed-in screens need to render:

```ts
type AuthenticatedAppSessionState =
  | { status: "loading" }
  | { status: "ready"; refreshing: boolean }
  | { status: "error"; message: string };
```

Rationale:

- `idle` is an implementation detail for initialization/disposal.
- The provider is mounted inside the signed-in route group, so consumers should not handle signed-out as a normal state.
- `authReady === false` can be represented as `loading`.
- The AuthGate/router owns signed-out routing.

The controller may keep an internal idle/disposed state if useful, but the hook should not expose it.

### 13. Session owns sign-out orchestration; auth stays thin

`AuthenticatedAppSession` should own sign-out orchestration. `auth` should only provide the external identity-provider capability.

Session-owned order:

```txt
1. track user_signed_out
2. reset analytics
3. dispose AuthenticatedAppSession runtime
4. clear cached session/local Household DB data
5. call auth.signOut()
6. if auth.signOut() fails, attempt session recovery
```

Auth adapter shape:

```ts
type AuthAdapter = {
  getToken: () => Promise<string | null>;
  authReady: boolean;
  signedIn: boolean;
  signOut: () => Promise<void>;
};
```

Rationale:

- Sign-out is not only an auth operation; it includes app-session cleanup.
- Auth should not know about Household DB files, session cache, runtime disposal, analytics reset, or recovery.
- Keeping orchestration in session preserves one consistent signed-in cleanup path.

### 14. Put the React boundary under `components/session/`

The React provider/hook should use the session concept too.

Target shape:

```txt
components/session/
  index.ts
  authenticated-app-session-provider.tsx
```

Public API:

```tsx
<AuthenticatedAppSessionProvider>
  <Stack />
</AuthenticatedAppSessionProvider>
```

```ts
const { state, session, retry, signOut } = useAuthenticatedAppSession();
```

Rejected locations:

- `components/authenticated-app-session/`: too verbose.
- `components/auth/`: misleading because this is not auth UI or an auth adapter.

Rationale:

- `components/session/` maps cleanly to `lib/services/session/`.
- The app-facing runtime concept stays consistent across service and React boundaries.

### 15. Hard-cut away from `active-household-*` public APIs and filenames

The next implementation should delete/replace the old Active Household public surface instead of keeping compatibility wrappers.

Required direction:

```txt
Delete/replace:
  components/active-household/*
  lib/services/household/active-household-*.ts

Introduce:
  components/session/*
  lib/services/session/*
```

Behavior should stay the same, but the old naming should not survive in active source APIs or filenames unless it appears in historical docs.

Rationale:

- The repo is greenfield with no users and explicitly prefers hard cuts over compatibility fallbacks.
- Keeping wrappers would preserve the misleading Household-as-app-runtime concept.
- The goal is conceptual simplification, not only moving code around.

## Open Questions

- None yet. Next step is to turn these decisions into an implementation goal.

## Implementation Update

Implemented 2026-05-28 with the agreed hard cut:

- Runtime code lives under `lib/services/session/{controller,resource-manager,services,resource-lease,bootstrap,cache}.ts`.
- Server `/api/bootstrap` orchestration lives under `lib/services/session/server/bootstrap.ts`, while Household provisioning/domain services remain under `lib/services/household/server/`.
- The React boundary lives under `components/session/` and exposes `AuthenticatedAppSessionProvider` plus `useAuthenticatedAppSession()`.
- The public hook exposes `{ state, session, retry, signOut }`; `session` is top-level and nullable, and services are grouped under `session.services`.
- `HouseholdStore` remains under `lib/services/household/household-store.ts` because the physical local/synced DB is per Household.
