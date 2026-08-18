# Authenticated App Session controller owns signed-in Household resources

_Amended 2026-06-30 ([ADR-0018](0018-single-postgres-self-hosted-powersync.md)): the controller-owns-signed-in-resources principle and the public hook shape are unchanged, but there is now one PowerSync database rather than per-Household DB resources, so the cached-to-fresh lease/replacement machinery and the sync coordinator are gone; `session.services.sync` is now a read-only PowerSync `SyncStatus` seam._

_Amended 2026-08-17 ([ADR-0020](0020-preserve-local-data-across-auth-transitions.md)): the controller now prepares durable internal-User database ownership before every connection. Normal auth transitions disconnect without clearing; a different User is blocked until explicit removal._

The app has had repeated lifecycle bugs because route code participated directly in the Household data-store and sync lifecycle. We use an app-owned Authenticated App Session controller for the signed-in runtime, activated eagerly from `app/(app)/_layout.tsx` through `AuthenticatedAppSessionProvider`.

The controller owns Authenticated App Session loading, the PowerSync connect/disconnect lifecycle, and sign-out cleanup integration. Screens borrow provider state and actions and must not manage the PowerSync connection or session resources directly.

The controller is Household-wide, not List-singleton-shaped. The Authenticated App Session is app-shell state only: User, active Household, associated Households, active Member, Members, resource key, and session-scoped services. Current List is selection state only. List and Item data loads separately by explicit List ID through `session.services` after `session !== null`.

## Consequences

- `app/(app)/_layout.tsx` is the signed-in product-provider boundary that eagerly activates `AuthenticatedAppSessionProvider`.
- `useAuthenticatedAppSession()` exposes lifecycle `state`, nullable `session`, `localData`, reload/retry/Sign Out actions, and the two different-User recovery actions. Internal owner and blocked User IDs remain private. There is no public `view` property.
- `session.households` lists associated Households with `id`, `name`, role, and active marker. Screens use provider state/actions and must not call bootstrap or manage Household resources directly.
- Session services are grouped under `session.services.{lists,items,sync,changes}`. `sync` is a read-only PowerSync `SyncStatus` seam (`getStatus`/`subscribe`, no `start()`/`stop()`/`requestSync`); `changes` is PowerSync's onChange notifier that `useSessionQuery` subscribes to for reactive reads.
- Sign-out order is centralized in the session sign-out module and exposed by the provider: critically clear the persisted session, critically call Clerk `signOut()`, best-effort disconnect PowerSync and clear the outgoing User's Current List selection, then track `user_signed_out` and reset analytics. Product rows, queued writes, and durable database ownership are retained.
- The one local PowerSync database has one durable internal User owner. Every connection is ownership-gated. A different User reaches only the blocked Home recovery state until confirmed `disconnectAndClear()` succeeds and the owner marker is reassigned.
- There is one local PowerSync database, present once opened, holding every Household the User is an active Member of. There is no per-Household resource set to open, lease, replace, or close, and no cached-vs-fresh Household swap: the controller connects the database with the session's connector and re-points watched queries when the active Household changes.
- Membership revocation is server-authoritative: when a fresh session (or a live sync-rule re-evaluation) shows the User is no longer an active Member of a Household, PowerSync stops streaming and purges that Household's rows from local SQLite; the controller does not hand-delete per-Household DB files.
- Home resolves the Current List with `resolveCurrentList` over a watched query of the active Household's Lists (there is no `DEFAULT_LIST_ID` and no starter List); Item operations pass the resolved explicit `listId`.
- Runtime code lives under `lib/services/session/`. `HouseholdStore` and the two-phase Household provisioning service are deleted (ADR-0018); the remaining Household domain server services stay under `lib/services/household/server/`.
- Server `/api/bootstrap` orchestration lives under `lib/services/session/server/` and API routes continue lazy-loading server modules.
