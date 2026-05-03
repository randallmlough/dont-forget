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
A person with an authenticated identity (one Apple ID = one User). Exists independently of any Household.
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

## Relationships

- A **User** is a **Member** of zero or more **Households**
- A **Household** has one or more **Members**
- A **Household** owns zero or more **Lists**
- A **List** contains zero or more **Items**

## Decisions in flight

- **Sync semantics**: eventual, seconds-scale latency, last-write-wins acceptable. Not sub-second collaborative (no Google-Docs-style live presence). _Decided 2026-04-29._
- **Membership cardinality**: a **User** can be a **Member** of many **Households** (many-to-many). _Decided 2026-04-29._
- **Stack**: Clerk for auth (Apple Sign In only), Expo API Routes on EAS Hosting for the server, Turso for the database, Resend for invitation emails. _Decided 2026-04-29._
- **Data partitioning**: one Turso DB per Household (replicated to Member devices) + one server-only "directory" DB for Households/Memberships/Invitations. Users live in Clerk and are referenced by `clerk_user_id`. _Decided 2026-04-29._
- **Roles**: two-tier (Owner, Member). Only Owners can remove Members, change roles, or delete the Household. _Decided 2026-04-29._
- **Owner rules**: multiple Owners allowed; any Member can invite; if the last Owner leaves, the longest-tenured remaining Member is auto-promoted to Owner. _Decided 2026-04-29._
- **Invitations**: token-based (not email-based) due to Apple Hide-My-Email; single-use; 7-day expiration; both email (Resend) and shareable-link delivery; revocable by inviter. _Decided 2026-04-29._
- **Conflict resolution**: row-level last-write-wins on `items` and `lists`; the `checked` state lives in a separate `item_checks` table (per-Member, per-Item) so the highest-collision field can't conflict. _Decided 2026-04-29._
- **Soft-delete**: tombstones (`deleted_at`) on every replicated table; no hard deletes from the app; server-side GC after replicas catch up. _Decided 2026-04-29._
- **First-run flow**: on first sign-in, server auto-creates a Household named after the User's first name (or "Untitled" if Apple didn't return one). User lands on an empty list, can rename or invite later. Invitation links route through a separate accept flow. _Decided 2026-04-29._
- **Real-time delivery**: pure polling via Turso's RN sync (1s foregrounded list view, 30s elsewhere foregrounded, off backgrounded). Silent APNs push hints deferred to a later iteration. _Decided 2026-04-29._
- **ORM & migrations**: Drizzle for schema definition (shared between Expo app and API Routes); drizzle-kit for migration generation; custom runner fans out across the directory DB and all Household DBs (see ADR-0003). _Decided 2026-04-29._

## Flagged ambiguities

- "Multi-tenancy" was used to mean "multiple Members in one Household" — these are different concepts. A **Household** is a tenant; **Members** are users *within* a tenant. Resolved.
- "Sign up" was used loosely. A **User** signs up via Apple Sign In once (creating their identity); they then either create a **Household** (becoming its first **Member**) or accept an invitation to an existing one (becoming a **Member**). "Sign up" ≠ "join a Household".
