# Authenticated App Session controller owns signed-in Household resources

The app has had repeated lifecycle bugs because route code participated directly in opening, replacing, syncing, and closing Household database resources. We use an app-owned Authenticated App Session controller for the signed-in runtime, activated eagerly from `app/(app)/_layout.tsx` through `AuthenticatedAppSessionProvider`.

The controller owns cached/fresh Authenticated App Session loading, Household resource composition, sync coordinator lifecycle, cached-to-fresh replacement, close/delete policy, and sign-out cleanup integration. Screens borrow provider state and actions and must not open or close Household DB resources directly.

The controller is Household-wide, not List-singleton-shaped. The Authenticated App Session is app-shell state only: User, active Household, associated Households, active Member, Members, resource key, and session-scoped services. Current List is selection state only. List and Item data loads separately by explicit List ID through `session.services` after `session !== null`.

## Consequences

- `app/(app)/_layout.tsx` is the signed-in product-provider boundary that eagerly activates `AuthenticatedAppSessionProvider`.
- `useAuthenticatedAppSession()` exposes `{ state, session, retry, reloadSession, signOut }`. `state` is lifecycle/UI metadata only; `session` is top-level and nullable. There is no public `view` property.
- `session.households` lists associated Households with `id`, `name`, role, and active marker. Screens use provider state/actions and must not call bootstrap or manage Household resources directly.
- Session services are grouped under `session.services.{lists,items,sync}`; `sync` is a consumer-safe handle without `start()` or `stop()`.
- Sign-out order is centralized in the session sign-out module and exposed by the provider: track `user_signed_out`, reset analytics, dispose the Authenticated App Session controller, clear signed-out session cache/local Household DB files, then call Clerk `signOut()`.
- Cached List UI may remain visible and writable while fresh authorized session resources are prepared, as long as the cached Household is still plausibly authorized. The controller must not close published resources until a replacement has been published and in-flight operations have drained.
- If a fresh Authenticated App Session proves the cached Household is no longer associated with the User, the controller stops accepting writes against the cached resource set, disposes it, deletes cached metadata/local DB files for that Household, and publishes loading/error/fresh state instead of keeping stale Household data visible. Switching to another associated Household is normal replacement, not unauthorized invalidation.
- Cached and fresh opens may create separate session resource sets and sync coordinators, while the Authenticated App Session controller remains the continuous app-level owner.
- Home currently selects `DEFAULT_LIST_ID` and loads that List by calling `session.services.lists.getList({ listId })` and `session.services.items.listItems({ listId })` after `session` exists. Item operations pass the same explicit `listId`.
- Runtime code lives under `lib/services/session/`; `HouseholdStore` and Household provisioning/domain services remain Household-named under `lib/services/household/`.
- Server `/api/bootstrap` orchestration lives under `lib/services/session/server/` and API routes continue lazy-loading server modules.
