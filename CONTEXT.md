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
A Member with elevated permissions: can rename the Household, remove other Members, change roles, and delete the Household. The creator of a Household is its first Owner.
_Avoid_: admin, host, creator

**User**:
A person known to Don't Forget, authenticated by Clerk and stored in the directory DB as an app-owned User record linked to `clerk_user_id`. Exists independently of any Household.
_Avoid_: account, person, profile

**List**:
A named collection of Items, owned by a Household. Every Member of the Household can read and write the List.
_Avoid_: shopping list, board

**Current List**:
The List a Member is currently viewing or editing within the Authenticated App Session. This is selection state, not a Household service/resource boundary.
_Avoid_: only list, singleton list

**Item**:
A line on a List — typically something to buy. Has a name, optional freeform quantity text, optional notes, a checked/unchecked state, and an order within the List. Checked state is a single shared fact per Item, recording which User last set it (see [ADR-0015](docs/adr/0015-shared-per-item-check-with-attribution.md)).
_Avoid_: entry, todo, task

**Invitation**:
A token issued by a Member to invite a User to join their Household. Single-use, 7-day expiration, revocable. Delivered via email (Resend) and/or a copyable accept URL.
_Avoid_: invite link, share, request

**Household Join Code**:
A reusable Household-scoped code and join URL that lets an authenticated User become a Member of the Household. Separate from **Invitation**; reusable manual code entry belongs here, not on Invitations.
_Avoid_: reusable Invitation, Invitation code, short code

**Home**:
The current route that renders the Authenticated App Session's Current List while the app is still early in development.
_Avoid_: dashboard, landing page

**Authenticated App Session**:
The top-level signed-in app runtime for a User. It identifies the active Household, active Member, current Members, and the User's available Households. A cached Authenticated App Session may omit secrets and allow offline startup. It does not load the Current List, Lists, or Items; those load after the Authenticated App Session exists.
_Avoid_: auth session, bootstrap payload, account session

## Relationships

- A **User** is a **Member** of zero or more **Households**
- A **Household** has one or more **Members**
- A **Household** owns zero or more **Lists**
- A **List** contains zero or more **Items**
- The active **Household** has one active **Member** and one **Current List** selection for the signed-in **User**
- A **Household Join Code** belongs to one **Household** and may be used by many authenticated **Users** until it is regenerated or disabled
- **Home** currently renders the active **Household**'s selected **Current List**, resolved from local selection state over a watched Lists query. Active **Household** resources are owned by the signed-in Authenticated App Session provider boundary rather than **Home**.
- An **Authenticated App Session** identifies one active **Household** and one active **Member**; List and Item data is loaded separately by explicit List ID through feature services after the session is established.

## Decisions in flight

- **Sync semantics**: eventual, seconds-scale latency. The client uses PowerSync's local-first model: all List/Item reads and writes happen against the local PowerSync database, which streams continuously while connected and queues local writes while offline. Concurrent writes resolve by app-owned `updated_at` last-writer-wins in the `/api/data` applicator; Don't Forget's synced rows carry app-owned timestamps, split checked state, and tombstones so application-level List/Item semantics remain predictable. Item/List writes must commit locally while offline and sync when connectivity returns. Not sub-second collaborative (no Google-Docs-style live presence). _Decided 2026-04-29; offline write requirement clarified 2026-05-16; sync transport semantics clarified 2026-05-18; migrated to PowerSync + `/api/data` LWW 2026-06-30 (see ADR-0018)._
- **Membership cardinality**: a **User** can be a **Member** of many **Households** (many-to-many). _Decided 2026-04-29._
- **Stack**: Clerk for auth (Apple, Google, and email/password sign-in), Expo API Routes for the server, a single self-hosted Postgres synced to devices by self-hosted PowerSync for the database, Resend for invitation emails. _Decided 2026-04-29; auth methods clarified 2026-05-16; database replatformed to Postgres + PowerSync 2026-06-30 (see ADR-0018)._
- **Data partitioning**: one Postgres database holds both the directory tables (Users/Households/Memberships/Invitations, server-side only) and the product tables (Lists/Items/`item_checks`, partitioned by `household_id` and published to PowerSync). PowerSync streams product rows to a device scoped by the User's active Memberships. Clerk owns authentication identity; the directory owns app User records linked to Clerk by `clerk_user_id`, and product relationships use app-owned `user_id`. _Decided 2026-04-29; User storage revised 2026-05-13; single-Postgres + PowerSync partitioning adopted 2026-06-30 (see ADR-0018)._
- **Native product-data client**: the iOS app uses `@powersync/op-sqlite` for the local synced database, exposed to services through the app-owned `ProductDatabase` seam (`src/client/lib/product-database.ts`); the server Postgres client (`pg`) is limited to server, migration, reset, and Node test seams under `src/server/db/`. _Revised 2026-05-16; local synced-store seam moved to the db layer 2026-06-09; replaced by the PowerSync `ProductDatabase` seam 2026-06-30; see ADR-0018 (supersedes ADR-0009), ADR-0011, and ADR-0014._
- **Roles**: two-tier (Owner, Member). Only Owners can rename the Household, remove Members, change roles, or delete the Household. _Decided 2026-04-29; Household rename authority clarified 2026-06-14._
- **Owner rules**: multiple Owners allowed; any Member can invite; if the last Owner leaves, the longest-tenured remaining Member is auto-promoted to Owner. _Decided 2026-04-29._
- **Invitations**: token-based (not email-based) due to Apple Hide-My-Email; single-use; 7-day expiration; both email (Resend) and copyable accept URL delivery; revocable by inviter. Manual reusable code entry is handled by **Household Join Codes**, not **Invitations**. _Decided 2026-04-29; Join Code distinction clarified 2026-05-29._
- **Household Join Codes**: each Household has at most one active enabled reusable Join Code. Codes do not expire automatically; they remain valid until regenerated or disabled. Joining with a valid Household Join Code creates a plain Member Membership for a new Member or reuses an existing active Membership without changing its role, sets that Household active for the User, and records safe audit data without storing submitted code values in attempt records or visible code strings in use records. _Decided 2026-05-29._
- **Household switching**: active Household selection is User-scoped directory state. The server prefers `users.active_household_id` when it still points to an active Membership for the signed-in User; if it is missing or invalid, the server repairs it using the deterministic oldest-active-Membership fallback. Switching, Invitation accept, and Household Join Code join all set the active Household and then the client reloads the Authenticated App Session. _Decided 2026-05-29._
- **Conflict resolution**: the `/api/data` applicator resolves concurrent writes by app-owned `updated_at` **last-writer-wins**. Don't Forget uses app-owned `updated_at` timestamps on `items`, `lists`, and `item_checks` for application-level ordering, recovery upserts, display derivation, and future migration paths. The `checked` state lives in a separate `item_checks` table — a single shared row per Item that records which User last set it — so the highest-collision field is isolated from Item attribute edits. Cross-device clock skew is acceptable for Household List use. _Decided 2026-04-29; timestamp source clarified 2026-05-16; checked-state owner and last-push-wins transport clarified 2026-05-18; shared-per-Item-with-attribution model adopted 2026-06-19 (see ADR-0015); transport migrated to PowerSync + `/api/data` LWW 2026-06-30 (see ADR-0018)._
- **Soft-delete**: tombstones (`deleted_at`) on every replicated table; no hard deletes from the app; server-side GC after replicas catch up. _Decided 2026-04-29._
- **First-run flow**: on first sign-in, server auto-creates a Household with an initial name randomly selected from the app-owned generated Household name list. The new Household starts with no Lists; the User creates their first List as their first action. The first Owner can rename the Household or invite Members later. Invitation accept URLs route through a separate accept flow. _Decided 2026-04-29; List name clarified 2026-05-13; initial Household name generation revised 2026-05-30; Owner-only rename clarified 2026-06-14; starter List removed 2026-06-30 (see ADR-0018, Decision 6)._
- **First-run onboarding**: optional onboarding happens after the server creates or loads the User's Household and Membership. The server determines first-run status from directory membership state, not from which sign-in/sign-up/SSO client path fired. _Decided 2026-05-13; Household DB provisioning and starter List removed 2026-06-30 (see ADR-0018)._
- **Initial signed-in surface**: after authentication, the app shows the selected Current List for the authenticated app session, not a generic dashboard. Today the Home route calls `useListCollection(session)` once after the Authenticated App Session exists; the collection owns List summaries, Current List resolution/selection, and List CRUD policy, while each explicit List page owns its Items. Session resources are owned by the signed-in Authenticated App Session provider boundary rather than Home. Future signed-in surfaces may consume the same session context. First-run shows the auto-created Household with no Lists yet, prompting the User to create their first List. _Decided 2026-05-10; Home boundary clarified 2026-05-22; implemented boundary documented 2026-05-25; Current List selection boundary clarified 2026-05-28; starter List removed and DEFAULT_LIST_ID replaced by resolveCurrentList 2026-06-30 (see ADR-0018)._
- **Offline authenticated app session startup**: after a successful online Authenticated App Session load, the app can reopen the last active Household/List from the local PowerSync database while offline and accept Item changes locally. The session bootstrap carries no per-Household sync tokens; the PowerSync connection token is fetched from Clerk, so streaming resumes when the connector reconnects. If a fresh session shows the User is no longer an active Member of a Household, PowerSync stops streaming and purges that Household's rows locally. _Decided 2026-05-16; cached sync lifecycle clarified 2026-05-21; migrated to PowerSync local-first startup 2026-06-30 (see ADR-0018)._
- **Offline sync visibility**: the authenticated app session surface should show a minimal sync status for offline, pending sync, and sync failure states; detailed conflict/recovery UI is deferred until needed. _Decided 2026-05-16._
- **Sign-out data boundary**: signing out clears cached Authenticated App Session metadata and the local PowerSync database (`disconnectAndClear`) for the signed-out User; offline Household data belongs to an active signed-in session, not the device forever. _Decided 2026-05-16; local data cleared via PowerSync disconnectAndClear 2026-06-30 (see ADR-0018)._
- **Authenticated App Session fallback**: until explicit Household switching exists, the server returns the oldest active Membership for a User; it creates a new Household only when the User has no active Memberships. _Decided 2026-05-13._
- **Real-time delivery**: PowerSync maintains a continuous sync stream while connected — there is no sync coordinator, polling, or explicit sync request. Local Item/List writes land in the local database immediately and the connector uploads them to `/api/data` in the background; other Members' changes stream down as they land. PowerSync manages reconnect and catch-up internally when connectivity returns. Silent APNs push hints deferred to a later iteration. _Decided 2026-04-29; local-write sync trigger clarified 2026-05-16; network-aware reconnect clarified 2026-05-21; authenticated app session ownership clarified 2026-05-22; sync coordinator replaced by continuous PowerSync streaming 2026-06-30 (see ADR-0018)._
- **ORM & migrations**: Drizzle for schema definition (shared between Expo app and API Routes); drizzle-kit for migration generation against the single Postgres database; the client runs no migrations (PowerSync client tables are declarative views). _Decided 2026-04-29; single-Postgres migrations adopted 2026-06-30 (see ADR-0018, supersedes ADR-0003)._

## Flagged ambiguities

- "Multi-tenancy" was used to mean "multiple Members in one Household" — these are different concepts. A **Household** is a tenant; **Members** are users *within* a tenant. Resolved.
- "Sign up" was used loosely. A **User** signs up through Clerk once (creating their identity); they then either create a **Household** (becoming its first **Member**) or accept an invitation to an existing one (becoming a **Member**). "Sign up" ≠ "join a Household".
- "User lives in Clerk" was used too broadly. Resolved: Clerk owns authentication identity; Don't Forget owns an app **User** record in the directory DB and links it to Clerk with `clerk_user_id`.
