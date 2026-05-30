# User Invitation Flow Discussion Notes

Date: 2026-05-29

This note captures decisions made while stress-testing the User Invitation flow and Household switching plan. It exists so another agent or a restarted session can continue without re-litigating settled points or drifting away from the agreed domain language.

## Context

Don't Forget already defines an **Invitation** as a token issued by a **Member** to invite a **User** to join their **Household**. Invitations are single-use, expire after 7 days, and are revocable. The existing direction allows delivery by email and shareable link; QR code can be a later presentation of the same token/link if needed.

The directory DB already owns **Users**, **Households**, **Memberships**, and **Invitations**. The current schema includes `invitations` with `token`, optional `email`, `created_by_user_id`, `expires_at`, `accepted_at`, `accepted_by_user_id`, and `revoked_at`.

The current Authenticated App Session server bootstrap chooses the oldest active Membership for a User until explicit Household switching exists. If the User has no active Memberships, it creates a first-run Household and Owner Membership. That means accepting an Invitation for a User who already belongs to another Household must also define how the app selects or switches the active Household.

Related docs and source considered during this discussion:

- `CONTEXT.md`
- `docs/how-things-work/authenticated-app-session.md`
- `docs/discussions/active-household-controller-grilling-2026-05-22.md`
- `docs/discussions/authenticated-app-session-simplification-grilling-2026-05-28.md`
- `docs/code-standards/architecture.md`
- `db/schema/directory.ts`
- `lib/services/session/server/bootstrap.ts`
- `lib/services/member/server/member-service.ts`
- `lib/services/session/controller.ts`

## Decisions Made

### 1. Invitation acceptance switches to the joined Household

When a signed-in User accepts an Invitation, the app should create the Membership and make the joined Household the active Household immediately.

Rationale:

- Acceptance should have an immediately visible result. Leaving the User in their previous Household after a successful acceptance would make the flow feel broken.
- This lets the first Invitation slice feel complete before a full Household switcher exists.
- It matches the domain model: a User may be a Member of many Households, but the Authenticated App Session has one active Household.

Rejected alternatives:

- **Accept without switching**: rejected because the User would need to discover and use Household switching before seeing the Household they just joined.

Implementation direction:

- Invitation acceptance should update the active Household selection as part of the successful accept operation.
- Authenticated App Session bootstrap must prefer the stored active Household when it is still an active Membership for the User.
- If the stored active Household is missing, deleted, or no longer an active Membership, bootstrap should choose a valid Membership using the existing deterministic fallback and repair the selection.

### 2. Active Household selection is global per User

Active Household selection should be stored in the directory DB as User-scoped state, not as device-local state.

Rationale:

- Invitation acceptance and future Household switching should produce the same active Household when the same User opens the app on another device.
- A directory-owned active Household keeps one source of truth for the Authenticated App Session.
- The app already treats the directory DB as the source for Users, Households, Memberships, and Invitations, while the local cache is only startup/offline metadata.

Rejected alternatives:

- **Device-local selection only**: rejected because accepting an Invitation on one device would not select the joined Household on another device, creating divergent app behavior for the same User.

Implementation direction:

- Add `users.active_household_id` referencing `households.id`.
- Authenticated App Session bootstrap should prefer `users.active_household_id` when it still points to an active Membership for the User.
- If the stored active Household is null, deleted, or no longer an active Membership, bootstrap should choose a valid Membership with the existing deterministic fallback and repair `users.active_household_id`.
- Bootstrap should return all active Households for the User as `households: Array<{ id: string; name: string; role: "owner" | "member"; isActive: boolean }>` in addition to the existing active Household fields.
- Do not include `memberCount` in the bootstrap `households` array for the first slice; keep bootstrap lean and fetch detailed Household settings data separately when needed.

### 3. Manual code entry uses reusable Household join codes

Manual code entry should use a reusable Household join code, not a single-use Invitation token or single-use Invitation-specific code.

Rationale:

- Email links should carry a long unguessable `Invitation.token`.
- A code that one User reads from one device and another User types into Settings needs to be short and easy to input.
- A short reusable code has a materially different lifecycle and security profile from an opaque single-use Invitation token, so it should be modeled separately.

Rejected alternatives:

- **Use the long token for manual entry**: rejected because long URL-safe tokens are poor human input.
- **Add `invitations.code` for manual entry**: rejected after deciding to ship reusable Household join functionality in the first slice; two different 8-character code concepts would be confusing.
- **Use only a short code everywhere**: rejected because email links can safely carry stronger opaque tokens with no human typing cost.

Implementation direction:

- Add a reusable Household-scoped join-code model instead of `invitations.code`.
- Use an 8-character code on that reusable model.
- Prefer an uppercase unambiguous alphabet that avoids visually confusing characters.
- Enforce uniqueness with a unique index on the reusable join-code code column.
- Keep `invitations.token` as the opaque secret for single-use email/link Invitations.
- Code entry should not be enabled without an attempt guard; the repo does not currently appear to have a reusable server-side throttling primitive.

### 4. Record failed manual join-code attempts with compact per-User windows

Manual Household join-code entry should record failed attempts and enforce a basic per-User attempt guard.

Rationale:

- Eight-character codes are designed for human entry, so they are easier to guess than opaque link tokens.
- Code entry requires an authenticated User, which makes `user_id` the cleanest first-slice throttle key.
- IP/device-based throttling is less reliable in Expo API Routes and would add infrastructure that the repo does not currently have.

Rejected alternatives:

- **No attempt tracking**: rejected because it would make short codes too easy to brute force online.
- **IP-only throttling**: rejected for the first slice because signed-in User identity is already available and more directly tied to the action.

Implementation direction:

- Add `household_join_code_attempts` keyed by `user_id`.
- Store compact window fields: `user_id`, `failed_count`, `window_started_at`, and `last_failed_at`.
- Do not store attempted code values.
- Enforce a basic rolling window, initially 5 failed attempts per 15 minutes unless implementation review exposes a better local constant.
- On successful Household join-code acceptance, clear or ignore the User's failed-attempt window.
- Successful join-code use clears the User's failed-attempt window.
- User-facing join-code failure copy should be generic for invalid, disabled, replaced, or otherwise unavailable codes: "This Household code is not available."
- Throttling can use a retry-oriented message such as "Too many attempts. Try again later." without revealing whether the submitted code was real.
- Authenticated join-code mutation errors should also use generic user-facing availability copy and not reveal whether a code was invalid, disabled, replaced, or never existed.
- Store join codes uppercase without separators.
- Normalize user input by uppercasing and stripping spaces/dashes before validation.
- Display join codes grouped for readability, such as `ABCD EFGH`, while links use the canonical code value like `ABCDEFGH`.
- Generate join codes from the exact alphabet `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`, excluding visually confusing `0`, `1`, `I`, and `O`.

### 5. Preserve Invitation links through authentication

Opening an Invitation link while signed out should preserve the Invitation through sign-in or sign-up and accept it after authentication succeeds.

Rationale:

- New Users should be able to open a link, authenticate, and land in the invited Household as one continuous flow.
- Requiring the User to reopen the link after signing in would make the first-run Invitation path fragile.
- This also avoids creating a first-run Household as the visible result when the User intended to join an existing Household.

Rejected alternatives:

- **Require authentication before opening the accept route**: rejected because the app would lose the Invitation context during redirect.
- **Ask the User to reopen the link after auth**: rejected as a poor recovery path for a primary Invitation flow.

Implementation direction:

- Add an Invitation accept route that can be reached while signed out and carries the Invitation token in route/search params.
- Update `AuthGate` so the accept route is not blindly redirected as an ordinary signed-in route before the token can be preserved.
- Signed-out accept should send the User through Clerk while preserving the target Invitation.
- After authentication, the app should accept the Invitation, create the Membership when needed, set the joined Household active, refresh the Authenticated App Session, and show the joined Household.
- For signed-out Users opening Invitation or Household join links, the accept/join endpoint should run before normal first-run bootstrap can create a default Household.
- The accept/join endpoint should upsert the User, create or reuse the Membership, set `users.active_household_id`, and then allow the authenticated app to load the joined Household.

Implementation direction:

- Introduce a central redirect policy module to keep AuthGate decisions testable as post-auth pathways grow.
- The policy should handle public auth-preserving routes such as `/invitations/accept?token=...` and `/households/join?code=...`, ordinary signed-out auth routes, authenticated app routes, and future pathways such as onboarding.
- The redirect policy should decide navigation targets; it should not own Authenticated App Session resources or call bootstrap directly.
- Keep redirect policy as a pure decision module colocated with `AuthGate`, such as `components/auth/redirect-policy.ts`.
- Do not put redirect policy under `lib/services/session`; it is routing/navigation policy, not Authenticated App Session resource ownership.
- Preserve post-auth intent in route params, not storage.
- Use `next` as the canonical auth route param for the target path, plus the relevant token/code param.
- Example signed-out redirects: `/sign-in?next=/invitations/accept&token=...` and `/sign-up?next=/households/join&code=ABCDEFGH`.
- After Clerk auth succeeds, redirect policy sends the User back to the public accept/join route, which runs accept/join before entering the authenticated app.
- `next` should support internal route continuity across the app, including cases where a User is on settings or another subpage and must re-authenticate.
- `next` must remain internal-only; external URLs or malformed paths should be rejected or ignored and fall back to `/`.
- Keep target params separate from `next`; do not nest encoded query strings inside `next` for this slice.
- Examples: `/sign-in?next=/invitations/accept&token=...` and `/sign-in?next=/household/settings`.
- The first slice should handle signed-out or auth-lost redirects only.
- Do not build a separate explicit reauthentication flow yet; keep `next` compatible with that future path when a concrete trigger exists.

### 6. Use a neutral public Invitation accept route

Invitation links should route to a neutral public accept route, not a route that belongs exclusively to the signed-in app group or signed-out auth group.

Rationale:

- Invitation acceptance is both a public entrypoint and an authenticated action.
- Signed-in Users should be able to accept immediately.
- Signed-out Users should be able to preserve the Invitation, authenticate, and resume acceptance.

Rejected alternatives:

- **Put accept under the authenticated app route group**: rejected because signed-out link opens would be treated like ordinary app routes and lose the Invitation context.
- **Put accept under the auth route group**: rejected because signed-in Users should not be forced through auth routes to accept an Invitation.

Implementation direction:

- Add a route such as `/invitations/accept?token=...` outside `(app)` and `(auth)`.
- Back it with a screen under `screens/invitations/`.
- Update `AuthGate` to allow the accept route while signed out so the token can be preserved.
- The accept route should show Invitation context before acceptance, including who invited the User and which Household they are joining.
- Use the domain term Household in accept copy; "conference" was a typo and does not introduce new domain language.
- Do not show the inviter's email address in the accept UI.
- Main copy should use inviter display name when available, with a non-email fallback such as "A Member".

### 6A. Use a separate public route for reusable Household join links

Reusable Household join links should use a separate public route from single-use Invitation links.

Rationale:

- Separate routes make semantics clear: single-use Invitation acceptance vs reusable Household code join.
- Separate routes make analytics easier to compare across the two join paths.
- QR can later encode the reusable Household join route without changing the Invitation route.

Implementation direction:

- Use `/invitations/accept?token=...` for single-use Invitations.
- Use `/households/join?code=ABCDEFGH` for reusable Household join links.
- Both routes can share UI components and auth-preservation mechanics where appropriate.
- Update `AuthGate` to allow both public routes while signed out.
- The reusable join route should preserve the code through sign-in/sign-up and complete the join after authentication.
- Manual code entry remains a signed-in flow on the Household switch page.
- Public reusable join-code preview should show only minimal Household context, such as "Join the Smith Household."
- Reusable join-code preview should not show inviter identity, Member list, or other Household metadata.
- Public reusable join-code preview API should return a boolean-style availability shape, such as `{ available: true, householdName }` or `{ available: false }`.

### 7. Invitation preview can reveal minimal context to token holders

The Invitation accept route may show minimal Invitation context before the User is authenticated.

Rationale:

- The Invitation token is already a bearer secret.
- A User needs enough context to decide whether to sign in or sign up and accept.
- The preview must not leak unnecessary User or Household data.

Rejected alternatives:

- **Require authentication before showing any Invitation context**: rejected because the signed-out accept screen would be too vague to be useful.
- **Return full Household or inviter details**: rejected because the preview should expose only what is necessary to understand the Invitation.

Implementation direction:

- Add an unauthenticated Invitation preview endpoint by token.
- Return only Household name, inviter display name or a non-email fallback, and Invitation status.
- Do not return inviter email, Member list, Household metadata beyond name, or any Household data.
- Public unavailable copy should be generic for invalid, expired, revoked, or already-used Invitation links: "This Invitation is no longer available."
- Public UI should not distinguish whether a token never existed, expired, was revoked, or was already accepted.
- Public Invitation preview API should return a boolean-style availability shape, such as `{ available: true, householdName, inviterDisplayName }` or `{ available: false }`.
- Authenticated Invitation accept mutation errors should also use generic user-facing availability copy and not reveal whether a token was invalid, expired, revoked, or accepted.

### 8. Household settings gets its own dedicated page

Household settings should be a dedicated authenticated page, not controls embedded directly in the List UI.

Rationale:

- Invitations, Members, Household switching, and future Household-level settings belong to the Household surface.
- The shopping List should stay focused on Items.
- A dedicated page gives the Invitation flow a stable home without crowding Home.

Rejected alternatives:

- **Put Invitation controls directly on Home/List**: rejected because it mixes Household administration with List editing.
- **Use a temporary modal only**: rejected because Household switching and Member management need a durable route.

Implementation direction:

- Add an authenticated Household settings route, likely `/household/settings`, under `app/(app)`.
- Back it with screen code under `screens/household-settings/` or a similarly specific surface folder.
- Add a Home entry point to Household settings from the signed-in top bar/header.
- First slice should include Invitation creation/display and enough Member context to explain the current Household.

### 9. Household switching uses a dedicated switch page

Household switching should be reachable from Household settings, but the selection UI should live on a separate page.

Rationale:

- Household settings remains the place to manage the current Household.
- Switching is a distinct navigation task: choose which Household becomes active.
- A separate switch page gives enough room to list available Households clearly without crowding settings.

Rejected alternatives:

- **Inline switcher inside Household settings**: rejected because the settings page will also own Members and Invitations.
- **Automatic switch-only after Invitation acceptance**: rejected because Users need an explicit way to return to other Households.

Implementation direction:

- Household settings should include a button labeled "Switch Household".
- Tapping that button should navigate to a Household switch page, likely `/household/switch`.
- The switch page should list all available Households from the Authenticated App Session `households` array.
- The current active Household should show a badge.
- The switch page should include "Join Household with Code" for signed-in Users.
- Selecting another Household should call a server endpoint to update `users.active_household_id`, refresh the Authenticated App Session, and load the newly active Household.
- Household switching is online-only in the first implementation.
- After a successful code join from the switch page, call `reloadSession` and navigate to Home for the newly active Household.

Rationale:

- Switching updates `users.active_household_id` in the directory DB.
- The selected Household needs fresh authenticated Household DB connection metadata.
- Offline switching would require local selection state, multiple cached Household resource sets, and careful unsynced-change policy beyond the first slice.
- The switch page is the natural place for joining another Household because it is already about choosing or changing the active Household.

### 10. Defer QR code to a fast follow

QR code should not ship in the first Invitation implementation slice.

Rationale:

- Email/link acceptance and manual code entry cover the core Invitation flows.
- QR adds library choice, rendering QA, and scan testing without changing the Invitation domain model.
- The same accept URL can be rendered as a QR code later.

Rejected alternatives:

- **Ship QR in the first slice**: rejected because it adds presentation/testing scope while email/link and code already validate the underlying Invitation lifecycle.

Implementation direction:

- Keep Invitation URL generation compatible with later QR rendering.
- Add QR as a later UI layer that encodes the same `/invitations/accept?token=...` URL.

### 11. Revoke pending Invitations instead of resending them

The first slice should support revoking pending Invitations, but should not support resending or mutating an existing Invitation.

Rationale:

- Creating a new Invitation after revocation keeps single-use token and expiration semantics clear.
- Reusing an existing Invitation for resend creates ambiguity around whether the same token/code stays valid, whether expiration extends, and what email delivery state means.
- The current schema already has `revoked_at`, which supports a clean first-slice revoke path.

Rejected alternatives:

- **Resend existing Invitation**: rejected for the first slice because it adds delivery-state and token/code reuse questions without changing the core ability to invite another User.

Implementation direction:

- Household settings should show pending Invitations with a revoke action.
- To "resend," a Member revokes the old pending Invitation and creates a new one.

### 12. Any Member can create Invitations

Invitation creation remains available to any Member, not only Owners.

Rationale:

- This matches the existing domain decision in `CONTEXT.md`: any Member can invite.
- Keeping the permission model unchanged keeps the first Invitation slice smaller.

Rejected alternatives:

- **Owner-only Invitations**: rejected for this slice because it changes an existing domain rule without a current need.

### 13. Single-use Invitation acceptance is idempotent for existing Members

Accepting a still-valid single-use Invitation should return success and switch to the invited Household when the accepting User is already an active Member of that Household.

Rationale:

- The desired outcome is already true: the User belongs to the Household.
- Returning an error would make valid links feel broken for existing Members.
- This matches reusable join-code behavior and avoids duplicate Membership creation.

Implementation direction:

- Do not create duplicate Memberships.
- If the Invitation is still pending, mark it accepted by the accepting User.
- Set the invited Household as the User's active Household.
- Users who join through an Invitation or reusable Household join code are created as plain Members, not Owners.

### 14. Use a provider-level `reloadSession` action after join/accept

After accepting an Invitation or joining through a reusable Household join code, screens should ask the Authenticated App Session provider to reload the session.

Rationale:

- Accepting or joining changes the active Household in the directory DB.
- The provider/controller already owns Authenticated App Session activation, resource replacement, Household DB tokens, and session-scoped services.
- Screens should not manually call bootstrap or open/replace Household resources.

Implementation direction:

- Add a public provider action named `reloadSession`.
- Accept/join screens call the server accept/join endpoint, then call `reloadSession`.
- The controller refresh should publish the new active Household and retire the previous session resource using existing resource replacement policy.

### 15. Invitation creation supports email and link-only modes

The Invitation service model should support both emailed Invitations and link-only Invitations.

Rationale:

- The existing domain decision allows email and shareable link delivery.
- The `invitations.email` column is already nullable.
- Link-only Invitations are useful when a Member wants to share through another channel.

Implementation direction:

- Update `CONTEXT.md` so Invitation remains clearly single-use, token-based, 7-day expiration, and revocable.
- Invitation delivery can be email or copyable single-use accept link, but reusable code/link/QR behavior belongs to Household Join Code.
- Keep the first UI email-first: a Member enters an email and creates/sends an Invitation.
- After creation, show the copyable accept link as a fallback/share option.
- Service/API should still allow creating an Invitation without email so link-only behavior is not blocked by the UI.
- If email delivery fails after the Invitation is created, do not fail or revoke/delete the Invitation.
- Return the created Invitation/link with an email delivery failure status so the Member can still copy and share the link.
- Persisted email delivery-attempt state is deferred unless a later implementation slice needs it.
- Household settings may show the invitee email address on pending emailed Invitations to authenticated current Members of that Household.
- Public Invitation preview/accept screens must not show invitee email addresses.
- When creating an emailed Invitation, if a pending, unexpired, unrevoked Invitation already exists for the same normalized email and Household, return the existing Invitation/link instead of creating a duplicate.
- Do not add a database unique constraint for this duplicate-prevention rule in the first slice; enforce it in the Invitation service because accepted/revoked/expired state makes the rule conditional.
- Link-only single-use Invitation creation should always create a new Invitation because there is no stable recipient key to deduplicate against.
- Invitation email normalization is trim and lowercase only; do not apply provider-specific rules such as Gmail dot or plus-address normalization.
- Invitation email is delivery and pending-management metadata only, not an authorization check.
- A signed-in User can accept a valid token-based Invitation even when their current User email differs from the Invitation email.
- Invitation and reusable Household join links should be generated server-side and returned by API responses.
- Server-generated links require a server-side public app base URL config distinct from `EXPO_PUBLIC_API_BASE_URL`.
- Email delivery and UI copy actions should use the same server-generated link values.
- Add `PUBLIC_APP_BASE_URL` as the server-side base for generated Invitation and Household join links.
- `PUBLIC_APP_BASE_URL` generates URLs such as `${PUBLIC_APP_BASE_URL}/invitations/accept?token=...` and `${PUBLIC_APP_BASE_URL}/households/join?code=ABCDEFGH`.
- Operations that need to return or email Invitation/join links should fail fast if `PUBLIC_APP_BASE_URL` is missing.
- Automated tests may omit the real env var when handlers/services receive injected link config.
- Inject a small app link builder into server services that need to return or email links.
- Link builder shape can be `invitationAcceptUrl(token)` and `householdJoinUrl(code)`.
- Production link builder reads `PUBLIC_APP_BASE_URL`; tests inject deterministic URLs.
- Inject token/code generators into server services for test determinism.
- Production generators should use secure randomness.
- Services should rely on uniqueness constraints and retry a small bounded number of times on token/code collision before failing with an operational error.
- Single-use Invitation tokens should be long opaque URL-safe random values, such as 32 bytes of secure random data encoded as base64url.
- Invitation tokens should not include the Invitation ID, email, Household ID, or any decodable payload.

### 17. Track separate analytics for Invitation, join-code, and switching outcomes

Analytics should distinguish single-use Invitation acceptance, reusable Household join-code use, and explicit Household switching.

Rationale:

- The product needs to compare whether single-use Invitations or reusable join links/codes are used more often.
- The repo treats analytics events as typed product contracts.
- Join and switching events are important funnel and behavior signals.

Implementation direction:

- Add success events such as `invitation_accepted`, `household_join_code_used`, and `household_switched`.
- Add control events such as `invitation_created`, `invitation_revoked`, `household_join_code_regenerated`, `household_join_code_disabled`, and `household_join_code_enabled`.
- Keep properties safe and minimal: include Household/Member role context where useful, and source fields such as `email`, `link`, `manual_code`, or `join_link`.
- Do not include email addresses, visible join codes, Invitation tokens, or other secrets in analytics properties.

### 18. Keep API routes resource-oriented

Invitation, reusable Household join-code, and Household switching API routes should follow traditional CRUD/resource-oriented practices where practical.

Rationale:

- Read-only previews and state-changing mutations have different auth and side-effect profiles.
- Resource-oriented routes make API behavior easier to test and reason about.
- Domain actions such as accepting an Invitation or using a join code can be modeled as creating relationship/use resources rather than generic verb endpoints.

Implementation direction:

- Public preview endpoints should be `GET` routes.
- Creation/update/revocation/join/switch operations should use the appropriate state-changing HTTP method.
- Avoid action-heavy endpoint names when a clear resource or subresource name exists.
- Keep Expo API route modules thin and lazy-load server-only services inside handlers.
- Document API status-code meanings as part of the implementation.
- Use `404` for unavailable Invitation tokens or Household codes with generic messages.
- Use `429` for too many join-code attempts.
- Use `401` for missing or invalid auth on mutation routes.
- Use `403` when an authenticated User tries to manage a Household they are not an active Member of.
- Reserve `409` for true state conflicts on management operations, not token/code guessing outcomes.
- Model Household switching as updating the signed-in User's active Household selection: `PATCH /api/users/me/active-household` with `{ householdId }`.
- The active-Household update validates the signed-in User has an active Membership in the target Household before updating `users.active_household_id`.
- Model single-use Invitation acceptance with `POST /api/invitations/accept` with `{ token }`.
- Accepting an Invitation creates or reuses the Membership, marks the Invitation accepted when appropriate, sets active Household, and returns the joined Household summary.
- Model reusable join-code use with the explicit domain action endpoint `POST /api/households/join-code/join` with `{ code }`.
- The join-code endpoint creates the join-code use audit row, creates or reuses the Membership, sets active Household, and returns the joined Household summary.
- This is an accepted exception to noun-only route shaping because the action route is clearer for the reusable Household join-code flow.
- Model Invitation creation as `POST /api/invitations` with `{ householdId, email? }`.
- Invitation creation validates the signed-in User is an active Member of the target Household.
- The client passes `householdId` explicitly instead of relying on hidden server-side active selection.
- Household settings lists Invitations with `GET /api/households/:householdId/invitations`.
- Invitation revocation uses `PATCH /api/invitations/:invitationId` with `{ revoked: true }`.
- Invitation list/revoke routes validate the signed-in User is an active Member of the relevant Household.
- Household settings should fetch Members with a dedicated route: `GET /api/households/:householdId/members`.
- The Members route validates the signed-in User is an active Member of the target Household.
- Reusable Household join-code management is scoped under the Household:
  - `GET /api/households/:householdId/join-code`
  - `POST /api/households/:householdId/join-code/regenerate`
  - `PATCH /api/households/:householdId/join-code` with `{ enabled: boolean }`
- Join-code management routes validate the signed-in User is an active Member of the target Household.
- Regenerate creates a new code row and replaces the previous active row.
- Enabling after disabled creates a new code row instead of resurrecting the old visible code.

### API route implementation layer

The user proposed adding a dedicated `lib/api/` location for core API handler functionality, with Expo API route files such as `*+api.ts` staying as thin wrappers.

Direction under discussion:

- `app/api/**/+api.ts` files should remain thin routing adapters.
- Shared API handler/orchestration code can live under `lib/api/`.
- `lib/api/` should call domain services under `lib/services/**`; it should not become a second data-access layer.
- Expo API route files must continue lazy-loading server-only code inside request handlers so native bundle registration does not evaluate server-only imports.
- Treat `lib/api/` as server-only request parsing, auth verification, response shaping, and handler orchestration.
- Keep domain behavior, database access, and business rules in `lib/services/**`.
- Implementation should update architecture docs/code standards as needed so future agents understand the `app/api` -> `lib/api` -> `lib/services` boundary.
- Add `docs/how-things-work/api-routes.md` during implementation to document `app/api` thin wrappers, `lib/api`, service boundaries, auth/error handling, status codes, and API testing expectations.
- Link the API routes doc from `docs/code-standards/architecture.md`.
- API request/response schemas should live in `lib/api/**` when they are HTTP boundary concerns.
- Services should expose typed domain methods and domain-shaped records, not HTTP payload schemas.
- If a response schema must be parsed by client code, place the shared schema in an app-safe module instead of a server-only `lib/api` file.
- Add a custom ESLint boundary rule for `lib/api/` imports, following the existing `tools/eslint-rules` pattern.
- App/client-facing code must not import `@/lib/api` or relative paths resolving into `lib/api`.
- `app/api/**/+api.ts` route files should lazy-load `lib/api` handlers inside HTTP method functions rather than statically importing them.
- Tests may import `lib/api` directly.
- `lib/api` handlers may return `Response` objects directly because they are HTTP boundary modules.
- Keep `lib/api` handlers dependency-injectable so they remain easy to test.
- Database integration testing for `lib/api` handlers is required; tests should exercise real directory DB behavior with external services mocked or injected.
- Existing test support already includes migrated temp DB helpers in `db/test.ts`, persisted row builders and scenarios in `db/fixtures/`, React/Clerk/native mocks under `lib/test/`, and server service integration tests that use real directory DB behavior.
- Existing API route coverage is currently limited: `lib/services/session/server/bootstrap-api-route.test.ts` verifies `app/api/bootstrap+api.ts` does not load server-only dependencies during route registration, but it does not provide a reusable authenticated API handler integration harness.
- Missing for the new `lib/api` layer: a reusable helper for constructing authenticated server requests or injected server user profiles, a common handler dependency-injection pattern, a response assertion helper if useful, and email sender injection/mocking for Invitation email delivery.
- Missing fixtures after the schema change: builders/scenarios for Household join codes, join-code uses, join-code attempts, active Household selection, and multi-Household User membership.
- Add only the smallest `lib/api` test helper needed by the first handler tests; promote shared pieces as duplication appears.
- Shared API test helpers should live under `lib/test/api/`.
- Invitation email delivery should live behind the Invitation server service as an injected dependency, not in `lib/api` handlers.
- `lib/api` parses HTTP/auth and calls the Invitation service; the service owns the product flow of creating an Invitation and attempting delivery.
- Production is the only environment that sends real Invitation email by default.
- Automated tests always fake email.
- Local should log or return the Invitation link rather than sending email unless explicitly configured.
- Staging real email delivery should require a staging sender and recipient allowlisting.
- Invitation creation responses should include an explicit `emailDelivery` status:
  - `{ status: "not_requested" }`
  - `{ status: "sent" }`
  - `{ status: "skipped"; reason: "environment" }`
  - `{ status: "failed"; message: string }`
- Delivery status is response-level for the first slice; persisted delivery-attempt state remains deferred.

### 16. Implementation should start with backend/session foundation

The implementation handoff should start with the durable backend and Authenticated App Session contract before polishing UI details.

Rationale:

- Invitation acceptance, reusable Household join codes, Household switching, and session reload all depend on directory DB and server behavior.
- UI work should sit on a tested data model and API contract rather than inventing temporary client state.
- The discussion is intended as a handoff for another implementation agent, so this thread should keep planning and not implement yet.

Implementation direction:

- Start with directory schema/migration: `users.active_household_id`, reusable Household join code tables, join-code use/audit table, and attempt table.
- Add server services for active Household selection, Invitation create/preview/accept/revoke, and join-code join/regenerate/enable/disable.
- Extend bootstrap response with `households` and active-selection behavior.
- Add provider-level `reloadSession`.

## New Branches Under Discussion

### Membership relationship vs User identity

The current domain model distinguishes **User** from **Member**:

- A **User** is the app-owned person record linked to Clerk.
- A **Member** is that User's relationship to a specific Household.

The User raised whether Membership may be unnecessary if all person-level identity should live on User and the same User should not have separate per-Household names or profile attributes.

Current code and glossary state:

- `users` stores identity/profile fields such as email and display name.
- `memberships` stores Household relationship fields: `household_id`, `user_id`, `role`, `joined_at`, and `removed_at`.
- `Member` currently means User-in-Household, not a separate profile/person.

Decision:

- Keep Member/Membership as the per-Household relationship concept.
- Keep profile/person fields on User only.
- Do not introduce separate per-Household display names or profile fields for Members in this slice.

Rationale:

- A User can belong to multiple Households, potentially with different roles and membership history.
- The relationship needs a row even when profile identity is shared.
- This preserves the existing glossary and schema while clarifying that Member is not a separate editable identity.

### Reusable Household join code/link

The current Invitation model is single-use. A reusable Household code/link/QR flow would be a different access model: multiple Users could use the same Household-scoped code or link until it is revoked, regenerated, disabled, or expired.

The first implementation should include both single-use Invitations and reusable Household join functionality so the join-code path can be repeatedly QA'd without constantly creating new Invitations.

Rationale:

- A reusable Household join code makes local QA and manual testing much faster.
- It covers a real product flow: a Member can give the same Household code to multiple people.
- It should be modeled separately from single-use Invitations because the lifecycle is different.

Decision:

- Manual code entry belongs to reusable Household join codes.
- Single-use Invitations remain email/link-token based.
- Do not add `invitations.code`.
- Add **Household Join Code** to `CONTEXT.md` as a domain term distinct from **Invitation**.
- Define Household Join Code as a reusable Household-scoped code/link that lets an authenticated User become a Member of the Household, with one active non-expiring code per Household until regenerated or disabled.
- Add a separate `CONTEXT.md` decisions-in-flight bullet for Household Join Codes.
- Keep the `CONTEXT.md` Invitations decision focused on single-use email/link tokens.
- Each Household has at most one active reusable join code.
- When the server creates an initial Household, it also creates that Household's reusable join code.
- Reusable Household join codes do not expire automatically; they remain valid until regenerated or disabled.
- The first slice supports both regenerating and disabling/enabling the reusable Household join code.
- Any Member can view, regenerate, disable, or enable the reusable Household join code in the first slice.
- Successful reusable-code joins write audit rows separate from Memberships.
- Regenerating a reusable Household join code creates a new code row and marks the old row inactive/replaced instead of updating the same row in place.
- The system still enforces at most one active enabled code per Household.
- Reusable join-code acceptance is multi-use: different Users can submit the same active code concurrently and both should join successfully.
- Join-code acceptance is idempotent for a User who is already an active Member of that Household: return success, set that Household active, and do not create a duplicate Membership.
- `household_join_codes` should use explicit lifecycle columns: `id`, `household_id`, `code`, `created_by_user_id`, `created_at`, `disabled_at`, `disabled_by_user_id`, `replaced_at`, and `replaced_by_user_id`.
- The active code is the newest row where `disabled_at` and `replaced_at` are null.
- Enabling after disable creates a new code row instead of resurrecting the old visible code.
- `household_join_code_uses` should store `id`, `household_join_code_id`, `household_id`, `user_id`, `membership_id`, and `used_at`.
- The use audit row should not store the visible code string.

Rationale:

- One active code per Household keeps settings UI and revocation/regeneration behavior simple.
- Creating the code with the Household makes the join-code path available immediately for QA and product use.
- Multiple active codes would mostly support attribution by channel/person, which is outside the current scope.
- A non-expiring code matches the standing Household code concept, while single-use Invitations retain their 7-day expiration.
- Regeneration handles exposed-code replacement; disabling is the basic safety valve for a non-expiring reusable code.
- Member-accessible join-code controls match the existing policy that any Member can invite and avoid a permission split in this slice.
- Reusable-code joins do not have one Invitation row per joined User, so a separate audit row preserves who joined and when for debugging and safety.
- New rows per regeneration let join-code use audit rows point at the exact code generation used without storing the visible code on every audit row.
- The existing active Membership uniqueness rule prevents duplicate active Memberships for the same User and Household; the join service should handle that as a successful idempotent join.
- Append-only code generations preserve audit history and avoid ambiguous resurrection semantics.
- `user_id` answers who used the code; `membership_id` identifies the exact Household relationship created or reused.

## Implementation Handoff

This discussion should be handed to an implementation agent as a backend/session-first feature. Do not start with UI polish; the UI depends on directory DB state, server services, API contracts, and Authenticated App Session reload behavior.

Recommended implementation order:

1. Update domain documentation:
   - Add **Household Join Code** to `CONTEXT.md` as a reusable Household-scoped code/link distinct from single-use **Invitation**.
   - Keep **Invitation** documented as token-based, single-use, 7-day expiring, and revocable.
   - Add `docs/how-things-work/api-routes.md` and link it from architecture standards.
2. Add directory schema and migration:
   - `users.active_household_id`.
   - `household_join_codes`.
   - `household_join_code_uses`.
   - `household_join_code_attempts`.
   - Enforce uniqueness for visible join-code values and one active enabled code per Household.
3. Add server services:
   - Active Household selection and validation.
   - Invitation create, preview, accept, list, and revoke.
   - Household Join Code preview, join, get current code, regenerate, disable, and enable.
   - App link generation and injected token/code/email dependencies.
4. Extend Authenticated App Session:
   - Prefer valid `users.active_household_id`.
   - Repair invalid/null active Household selection using the deterministic Membership fallback.
   - Return `households: Array<{ id; name; role; isActive }>` from bootstrap.
   - Expose provider-level `reloadSession`.
5. Add `lib/api/` handlers and thin Expo route wrappers:
   - Keep `app/api/**/+api.ts` as lazy-loading adapters.
   - Put HTTP parsing/auth/response shaping in `lib/api/`.
   - Keep domain behavior and DB access in services.
   - Add ESLint guardrails preventing app/client imports from `lib/api`.
6. Add tests before UI:
   - Database integration tests for services and `lib/api` handlers.
   - Fixtures for multi-Household Users, active Household selection, join codes, join-code uses, attempts, and Invitations.
   - Mock/inject external email delivery.
7. Build UI after the contracts are stable:
   - Household settings page with Invitation management and reusable Household join-code controls.
   - Household switch page listing all Households, showing the current badge, supporting switch and code join.
   - Public Invitation accept and Household join-code routes with signed-out redirect preservation.

## Completion Audit

The discussion is complete against the requested flow coverage.

### Household switching coverage

Settled:

- Associated Households are viewed from the Authenticated App Session `households` array.
- Household settings includes a "Switch Household" button.
- The switch page lists all available Households, shows a badge on the current Household, and lets the User select another Household.
- Switching calls `PATCH /api/users/me/active-household` with `{ householdId }`.
- The server validates the signed-in User is an active Member of the target Household, updates `users.active_household_id`, and returns success.
- The client calls provider-level `reloadSession` after switching, causing the Authenticated App Session controller to open the newly active Household resource set and retire the previous one.
- The previous Household's Membership remains active. Switching does not remove the User from the previous Household, delete the previous Household, or mutate the previous Household's Lists/Items.
- The previous Household remains available in the `households` array and can be switched back to later.
- Switching is online-only for the first slice.
- Before switching, the client should request sync for the currently active Household and only proceed when that sync succeeds.
- If current-Household sync fails because the device is offline or the remote request fails, keep the current Household active and show a retryable switching error.
- After sync succeeds, switching updates `users.active_household_id`, reloads the Authenticated App Session, retires the previous Household resource set, and loads the newly active Household.

### Household code coverage

Settled:

- Household Join Codes are reusable Household-scoped codes/links, separate from single-use Invitations.
- Codes are 8 uppercase unambiguous characters, unique in the table, displayed as `ABCD EFGH`, and accepted from normalized input.
- Initial Household creation also creates the Household's reusable join code.
- Household settings is the place to view and manage the active Household's code.
- Any active Member can view, regenerate, disable, or enable the code for now.
- Enabled state should show the grouped code, copyable join link, regenerate action, and disable action.
- Disabled state should not show an old visible code as reusable. Enabling creates a new code row.
- Regeneration replaces the previous active code with a new row and makes old links/codes unavailable.
- Joining by code is available from the Household switch page for signed-in Users.
- Joining by reusable link uses `/households/join?code=ABCDEFGH` and preserves through sign-in/sign-up.
- Successful join creates or reuses Membership, writes a join-code use audit row, sets active Household, calls `reloadSession`, and loads the joined Household.
- Invalid, disabled, replaced, or unavailable codes use generic user-facing errors.
- Failed manual attempts are recorded in compact per-User windows.

No remaining product unknowns found for the Household Join Code flow.

### Invitation flow coverage

Settled:

- Members are viewed from Household settings via `GET /api/households/:householdId/members`.
- Member list responses should stay minimal: `membershipId`, `userId`, `displayName`, and `role`.
- Member UI should show display name or a non-email fallback plus role; no email is needed for first-slice Member viewing.
- Any active Member can create Invitations.
- Invitation creation uses `POST /api/invitations` with `{ householdId, email? }`.
- Invitation creation supports email-first UI and link-only service/API behavior.
- If delivery fails after Invitation creation, the Invitation remains valid and the response still includes copyable link details plus `emailDelivery` status.
- Household settings lists pending Invitations via `GET /api/households/:householdId/invitations`.
- Pending emailed Invitations may show invitee email inside authenticated Household settings only.
- Pending Invitation rows should expose enough management context for first-slice UI: Invitation ID, optional invitee email, created time, expiration time, creator display name when available, copyable accept link, and revoke availability.
- Revocation uses `PATCH /api/invitations/:invitationId` with `{ revoked: true }`.
- There is no resend mutation in the first slice; revoke and create a new Invitation instead.
- Acceptance uses `/invitations/accept?token=...` plus `POST /api/invitations/accept`.
- Invitation preview exposes only Household name and inviter display name or non-email fallback.
- Accepting a valid token creates or reuses Membership, marks the Invitation accepted when appropriate, sets active Household, calls `reloadSession`, and loads the joined Household.
- Invitation email is not authorization; a signed-in User can accept a valid token even if their email differs from the pending Invitation email.
- Invalid, expired, revoked, accepted, or unavailable Invitations use generic user-facing errors.

No remaining product unknowns found for the Invitation flow.

## Open Questions

- None currently.

## Fast Follow

### QR Code

Render the existing Invitation accept URL as a QR code after the email/link and code flows are stable.

## Implementation Update

Not implemented yet.
