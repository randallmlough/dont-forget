# Don't Forget

A shared shopping-list app for households. Members of the same Household co-edit Lists together; edits propagate to other devices within seconds.

## Language

**Household**:
A group of Members who share Lists. The unit of sharing and access control.
_Avoid_: tenant, group, family, team, organization

**Member**:
A User in the context of a specific Household. The same User may be a Member of multiple Households. A Member has a **role**: either **Owner** or (plain) **Member**.
_Avoid_: tenant user, household user, participant

**Owner**:
A Member with elevated permissions: can remove other Members, change roles, and delete the Household. The creator of a Household is its first Owner.
_Avoid_: admin, host, creator

**User**:
A person known to Don't Forget, authenticated by Clerk and stored in the directory DB as an app-owned User record linked to `clerk_user_id`. Exists independently of any Household.
_Avoid_: account, person, profile

**List**:
A named collection of Items, owned by a Household. Every Member of the Household can read and write the List.
_Avoid_: shopping list, board

**Current List**:
The List a Member is currently viewing or editing within the active Household.
_Avoid_: only list, singleton list

**Item**:
A line on a List — typically something to buy. Has a name, a checked/unchecked state, and an order within the List. Checked state is recorded per User within the Item's Household.
_Avoid_: entry, todo, task

**Invitation**:
A token issued by a Member to invite a User to join their Household. Single-use, 7-day expiration, revocable. Delivered via email (Resend) and/or a shareable link.
_Avoid_: invite link, share, request

**Home**:
The current route that renders the active Household's current List while the app is still early in development.
_Avoid_: dashboard, landing page

**Household Session**:
The app's active Household context for a signed-in User: the active Household, active Member, initial Current List, current Members, and short-lived Household DB connection metadata. A cached Household Session may omit secrets and allow offline active Household startup.
_Avoid_: auth session, bootstrap payload, account session

## Relationships

- A **User** is a **Member** of zero or more **Households**
- A **Household** has one or more **Members**
- A **Household** owns zero or more **Lists**
- A **List** contains zero or more **Items**
- The active **Household** has one active **Member** and one **Current List** selection for the signed-in **User**
- **Home** currently renders the active **Household**'s **Current List**, but active **Household** resources are owned by the signed-in Active Household controller/provider boundary rather than **Home**
- A **Household Session** identifies one active **Household**, one active **Member**, and one initial **Current List**

## Decisions in flight

- **Sync semantics**: eventual, seconds-scale latency. The native Household DB path uses Turso Sync's local-first model: all List/Item reads and writes happen against the local Household DB, and explicit `push()`/`pull()` calls propagate changes when connectivity and authorization are available. Turso's transport conflict behavior is **last push wins**; Don't Forget's replicated rows still carry app-owned timestamps, split checked state, and tombstones so application-level List/Item semantics remain predictable. Item/List writes must commit locally while offline and sync when connectivity returns. Not sub-second collaborative (no Google-Docs-style live presence). _Decided 2026-04-29; offline write requirement clarified 2026-05-16; Turso Sync transport semantics clarified 2026-05-18._
- **Membership cardinality**: a **User** can be a **Member** of many **Households** (many-to-many). _Decided 2026-04-29._
- **Stack**: Clerk for auth (Apple, Google, and email/password sign-in), Expo API Routes on EAS Hosting for the server, Turso for the database, Resend for invitation emails. _Decided 2026-04-29; auth methods clarified 2026-05-16._
- **Data partitioning**: one Turso DB per Household (replicated to Member devices) + one server-only "directory" DB for Users/Households/Memberships/Invitations. Clerk owns authentication identity; the directory DB owns app User records linked to Clerk by `clerk_user_id`, and product relationships use app-owned `user_id`. _Decided 2026-04-29; User storage revised 2026-05-13._
- **Native Household DB client**: the iOS app uses `@tursodatabase/sync-react-native` behind the app-owned `HouseholdStore` wrapper for local synced Household data access; `@libsql/client` remains limited to server, migration, reset, and Node test seams. _Revised 2026-05-16; HouseholdStore naming applied 2026-05-19; see ADR-0009 and ADR-0011._
- **Roles**: two-tier (Owner, Member). Only Owners can remove Members, change roles, or delete the Household. _Decided 2026-04-29._
- **Owner rules**: multiple Owners allowed; any Member can invite; if the last Owner leaves, the longest-tenured remaining Member is auto-promoted to Owner. _Decided 2026-04-29._
- **Invitations**: token-based (not email-based) due to Apple Hide-My-Email; single-use; 7-day expiration; both email (Resend) and shareable-link delivery; revocable by inviter. _Decided 2026-04-29._
- **Conflict resolution**: Turso Sync pushes logical local changes and resolves concurrent pushes by **last push wins**. Don't Forget uses app-owned `updated_at` timestamps on `items`, `lists`, and `item_checks` for application-level ordering, recovery upserts, display derivation, and future migration paths; they are not Turso's built-in merge clock. The `checked` state lives in a separate `item_checks` table (per-User within a Household, per-Item) so the highest-collision field is isolated from Item attribute edits. Cross-device clock skew is acceptable for Household List use. _Decided 2026-04-29; timestamp source clarified 2026-05-16; checked-state owner and Turso last-push-wins transport clarified 2026-05-18._
- **Soft-delete**: tombstones (`deleted_at`) on every replicated table; no hard deletes from the app; server-side GC after replicas catch up. _Decided 2026-04-29._
- **First-run flow**: on first sign-in, server auto-creates a Household named after the User's first name (or "Untitled" if Apple didn't return one). The new Household starts with one empty List named "Groceries"; the User can rename it or invite Members later. Invitation links route through a separate accept flow. _Decided 2026-04-29; List name clarified 2026-05-13._
- **First-run onboarding**: optional onboarding happens after the server creates or loads the User's Household, Membership, Household DB, and initial List. The server determines first-run status from directory membership state, not from which sign-in/sign-up/SSO client path fired. _Decided 2026-05-13._
- **Initial signed-in surface**: after authentication, the app shows the Current List for the active Household, not a generic dashboard. Today the Home route renders that surface, but active Household resources are owned by the signed-in Active Household controller/provider boundary rather than Home. Future signed-in surfaces may consume the same active Household context. First-run shows the auto-created Household and an empty List state. _Decided 2026-05-10; Home boundary clarified 2026-05-22; implemented boundary documented 2026-05-25._
- **Offline active Household startup**: after a successful online Household Session load and local Household DB initialization, the app can reopen the last active Household/List while offline and accept Item changes locally. Cached Household Session state does not include Household DB auth tokens; membership and sync resume only after a fresh online Household Session load. Cached/offline startup does not start network-aware sync lifecycle work because it is not authorized to sync the Household DB. If a fresh Household Session no longer authorizes the cached Household, unsynced local changes for that Household are discarded rather than synced. _Decided 2026-05-16; cached sync lifecycle clarified 2026-05-21._
- **Offline sync visibility**: the active Household surface should show a minimal sync status for offline, pending sync, and sync failure states; detailed conflict/recovery UI is deferred until needed. _Decided 2026-05-16._
- **Sign-out data boundary**: signing out deletes cached Household Session metadata and local Household DB files for the signed-out User; offline Household data belongs to an active signed-in session, not the device forever. _Decided 2026-05-16._
- **Active Household fallback**: until explicit Household switching exists, the server returns the oldest active Membership for a User; it creates a new Household only when the User has no active Memberships. _Decided 2026-05-13._
- **Real-time delivery**: coordinator-owned sync polling and lifecycle triggers, plus an immediate sync request after local Item/List mutations when authorized. The coordinator treats app lifecycle and device connectivity as app-wide platform inputs through app-owned adapters, while active Household infrastructure owns when a Household coordinator exists. Known-offline state pauses new automatic remote attempts without cancelling in-flight sync work; reconnect to known-online triggers a full Household catch-up sync only while the app is active, so local changes can upload and other Members' changes can download. Unknown connectivity keeps the foreground/retry fallback behavior. Silent APNs push hints deferred to a later iteration. _Decided 2026-04-29; local-write sync trigger clarified 2026-05-16; network-aware reconnect clarified 2026-05-21; active Household ownership clarified 2026-05-22._
- **ORM & migrations**: Drizzle for schema definition (shared between Expo app and API Routes); drizzle-kit for migration generation; custom runner fans out across the directory DB and all Household DBs (see ADR-0003). _Decided 2026-04-29._

## Flagged ambiguities

- "Multi-tenancy" was used to mean "multiple Members in one Household" — these are different concepts. A **Household** is a tenant; **Members** are users *within* a tenant. Resolved.
- "Sign up" was used loosely. A **User** signs up through Clerk once (creating their identity); they then either create a **Household** (becoming its first **Member**) or accept an invitation to an existing one (becoming a **Member**). "Sign up" ≠ "join a Household".
- "User lives in Clerk" was used too broadly. Resolved: Clerk owns authentication identity; Don't Forget owns an app **User** record in the directory DB and links it to Clerk with `clerk_user_id`.
