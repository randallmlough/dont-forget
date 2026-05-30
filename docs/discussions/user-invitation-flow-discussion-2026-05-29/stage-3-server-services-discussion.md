# Stage 3 Discussion: Server Services

Source documents:

- `CONTEXT.md`
- `docs/discussions/user-invitation-flow-discussion-2026-05-29/implementation-handoff.md`
- `docs/discussions/user-invitation-flow-discussion-2026-05-29/household-switching.md`
- `docs/discussions/user-invitation-flow-discussion-2026-05-29/household-join-code-flow.md`
- `docs/discussions/user-invitation-flow-discussion-2026-05-29/invitation-flow.md`
- `docs/discussions/user-invitation-flow-discussion-2026-05-29/testing-security-and-analytics.md`
- `docs/adr/0011-domain-first-service-layer.md`
- `docs/how-things-work/services.md`
- `lib/services/member/server/member-service.ts`
- `lib/services/household/server/household-service.ts`
- `lib/services/user/server/user-service.ts`

## Stage Scope

This stage adds server-side domain services for active Household selection, Invitations, and Household Join Codes. These services own domain behavior and directory DB access. API handlers remain a later stage.

## Current State

- Server services already exist for User, Member, Household, provisioning, and session bootstrap.
- `MemberService` can find oldest active Membership, ensure Owner Membership, and list Household Members.
- `HouseholdService` can create/provision Households and map active Memberships.
- There is no Invitation service yet.
- There is no Household Join Code service yet.
- There is no active Household selection service yet.

## Stage Decisions

- Keep Membership as the per-Household relationship concept.
- Keep profile/person fields on User only.
- Add active Household selection and validation service behavior.
- Add Invitation create, preview, accept, list, and revoke service behavior.
- Add Household Join Code preview, join, current code, regenerate, disable, and enable service behavior.
- Services own ID generation, timestamp generation, DB access, and domain-shaped return values.
- Inject app link builder, token/code generators, email sender, logger, and analytics only where needed.
- Production token/code generation uses secure randomness and bounded retries on uniqueness collisions.
- New joiners are always plain Members.
- Accept/join existing active Members idempotently.

## Module Plan

- Active Household service under the session/user/member server boundary chosen during implementation review.
- Invitation server service.
- Household Join Code server service.
- App link builder.
- Email delivery adapter seam.
- Analytics/logging injection where product outcomes are emitted.

## Testing And Verification

- Use real directory DB integration tests.
- Mock/inject email delivery.
- Spy on `Date.now()` only at test boundaries when deterministic timestamps are needed.
- Test duplicate pending emailed Invitation reuse.
- Test link-only Invitation creation always creates a new Invitation.
- Test Invitation accept idempotency for existing Members.
- Test join-code concurrent multi-use for different Users.
- Test join-code throttling windows.
- Test regenerate/disable/enable lifecycle.

## Out Of Scope

- API request parsing and HTTP response shaping.
- Authenticated App Session provider changes.
- UI.
