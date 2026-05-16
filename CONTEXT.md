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

**Item**:
A line on a List — typically something to buy. Has a name, a checked/unchecked state, and an order within the List.
_Avoid_: entry, todo, task

**Invitation**:
A token issued by a Member to invite a User to join their Household. Single-use, 7-day expiration, revocable. Delivered via email (Resend) and/or a shareable link.
_Avoid_: invite link, share, request

**Home**:
The authenticated app surface showing the current List for the active Household.
_Avoid_: dashboard, landing page

## Relationships

- A **User** is a **Member** of zero or more **Households**
- A **Household** has one or more **Members**
- A **Household** owns zero or more **Lists**
- A **List** contains zero or more **Items**
- **Home** shows one **List** from the active **Household**

## Decisions in flight

- **Sync semantics**: eventual, seconds-scale latency, last-write-wins acceptable. Item/List writes must commit locally while offline and sync when connectivity returns. Not sub-second collaborative (no Google-Docs-style live presence). _Decided 2026-04-29; offline write requirement clarified 2026-05-16._
- **Membership cardinality**: a **User** can be a **Member** of many **Households** (many-to-many). _Decided 2026-04-29._
- **Stack**: Clerk for auth (Apple, Google, and email/password sign-in), Expo API Routes on EAS Hosting for the server, Turso for the database, Resend for invitation emails. _Decided 2026-04-29; auth methods clarified 2026-05-16._
- **Data partitioning**: one Turso DB per Household (replicated to Member devices) + one server-only "directory" DB for Users/Households/Memberships/Invitations. Clerk owns authentication identity; the directory DB owns app User records linked to Clerk by `clerk_user_id`, and product relationships use app-owned `user_id`. _Decided 2026-04-29; User storage revised 2026-05-13._
- **Native Household DB client**: the iOS app uses op-sqlite's Turso backend for local synced Household DB access; `@libsql/client` remains limited to server, migration, reset, and Node test seams. _Decided 2026-05-16; see ADR-0009._
- **Roles**: two-tier (Owner, Member). Only Owners can remove Members, change roles, or delete the Household. _Decided 2026-04-29._
- **Owner rules**: multiple Owners allowed; any Member can invite; if the last Owner leaves, the longest-tenured remaining Member is auto-promoted to Owner. _Decided 2026-04-29._
- **Invitations**: token-based (not email-based) due to Apple Hide-My-Email; single-use; 7-day expiration; both email (Resend) and shareable-link delivery; revocable by inviter. _Decided 2026-04-29._
- **Conflict resolution**: row-level last-write-wins on `items` and `lists` using device-generated monotonic timestamps; the `checked` state lives in a separate `item_checks` table (per-Member, per-Item) so the highest-collision field can't conflict. Cross-device clock skew is acceptable for Household List use. _Decided 2026-04-29; timestamp source clarified 2026-05-16._
- **Soft-delete**: tombstones (`deleted_at`) on every replicated table; no hard deletes from the app; server-side GC after replicas catch up. _Decided 2026-04-29._
- **First-run flow**: on first sign-in, server auto-creates a Household named after the User's first name (or "Untitled" if Apple didn't return one). The new Household starts with one empty List named "Groceries"; the User can rename it or invite Members later. Invitation links route through a separate accept flow. _Decided 2026-04-29; List name clarified 2026-05-13._
- **First-run onboarding**: optional onboarding happens after server bootstrap creates or loads the User's Household, Membership, Household DB, and initial List. The server determines first-run status from directory membership state, not from which sign-in/sign-up/SSO client path fired. _Decided 2026-05-13._
- **Home surface**: after authentication, Home is the current List view for the active Household, not a generic dashboard. First-run Home shows the auto-created Household and an empty List state. _Decided 2026-05-10._
- **Offline Home startup**: after a successful online bootstrap and local Household DB initialization, Home can reopen the last active Household/List while offline and accept Item changes locally. Cached bootstrap state does not include Household DB auth tokens; membership and sync resume only after a fresh online bootstrap. If fresh bootstrap no longer authorizes the cached Household, unsynced local changes for that Household are discarded rather than synced. _Decided 2026-05-16._
- **Offline sync visibility**: Home should show a minimal sync status for offline, pending sync, and sync failure states; detailed conflict/recovery UI is deferred until needed. _Decided 2026-05-16._
- **Sign-out data boundary**: signing out deletes cached bootstrap metadata and local Household DB files for the signed-out User; offline Household data belongs to an active signed-in session, not the device forever. _Decided 2026-05-16._
- **Active Household fallback**: until explicit Household switching exists, bootstrap returns the oldest active Membership for a User; it creates a new Household only when the User has no active Memberships. _Decided 2026-05-13._
- **Real-time delivery**: pure sync polling (1s foregrounded List view, 30s elsewhere foregrounded, off backgrounded), plus an immediate sync attempt after local Item/List mutations when online and authorized. Silent APNs push hints deferred to a later iteration. _Decided 2026-04-29; local-write sync trigger clarified 2026-05-16._
- **ORM & migrations**: Drizzle for schema definition (shared between Expo app and API Routes); drizzle-kit for migration generation; custom runner fans out across the directory DB and all Household DBs (see ADR-0003). _Decided 2026-04-29._

## Flagged ambiguities

- "Multi-tenancy" was used to mean "multiple Members in one Household" — these are different concepts. A **Household** is a tenant; **Members** are users *within* a tenant. Resolved.
- "Sign up" was used loosely. A **User** signs up through Clerk once (creating their identity); they then either create a **Household** (becoming its first **Member**) or accept an invitation to an existing one (becoming a **Member**). "Sign up" ≠ "join a Household".
- "User lives in Clerk" was used too broadly. Resolved: Clerk owns authentication identity; Don't Forget owns an app **User** record in the directory DB and links it to Clerk with `clerk_user_id`.
