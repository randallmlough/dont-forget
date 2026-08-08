# PR #193 Staging QA Report

Status: **COMPLETE — all reachable staging flows exercised; limitations are documented below**

Date: 2026-08-07
PR: <https://github.com/randallmlough/dont-forget/pull/193>
QA head: `d695476ce52c7ee47edf1e80fbb5f1647fb10521`
Branch: `advisor/074-ios-universal-links-staging-qa`

## Environment proved

- Staging homelab checkout and PR head matched the SHA above before deployment.
- `dontforget-staging-api`, `dontforget-staging-web`, `dontforget-staging-powersync`, `dontforget-staging-pg-source`, and `dontforget-staging-pg-storage` were healthy after deployment and remained healthy during QA.
- Public staging API `/health` returned the PR Hono server response; public staging PowerSync liveness returned 200.
- Final verification at the end of the campaign found the exact QA SHA still checked out, all five staging containers healthy with zero observed restarts, and both public service probes still green.
- Public AASA served both production and staging app identifiers for `/invitations/accept` and `/households/join`.
- iOS target: iPhone 17 Pro simulator, iOS 26.5, bundle `com.dont-forget.app.staging`, app version `1.0.0 (staging)`.
- Simulator build used the dedicated staging API and PowerSync hosts. EAS `preview` configuration was independently verified to use the same dedicated staging hosts.

## Flow results

| Area | Scenario | Result |
| --- | --- | --- |
| Authentication | Signed-out screen and email/password entry | PASS |
| Authentication | Empty signup, malformed email, mismatched password | PASS |
| Authentication | Disposable first User creation and authenticated bootstrap | PASS after local QA environment correction |
| Authentication | Sign out, empty sign-in, one wrong-password attempt, correct sign-in | PASS |
| Authentication | Disposable second User creation, independent bootstrap, authenticated relaunch | PASS |
| Authentication | Apple and Google cancellation without provider authorization | PASS after Apple cancellation fix; provider success requires dedicated identities |
| Profile | Empty first/last name validation | PASS — `Provide a first or last name.` |
| Profile | Save `QA Owner 193` / `QA Member 193`, relaunch persistence | PASS |
| Household | First-run Household creation and Owner membership | PASS |
| Household | Create second Household | PASS |
| Household | Whitespace rename rejection and valid rename | PASS |
| Household | Switch between Households and preserve active selection after relaunch | PASS |
| Household | Household-scoped List and Item isolation | PASS |
| Household | Blank and invalid Join Code rejection | PASS |
| Household | 81-character name boundary | PASS — rejected with `Household name must be 80 characters or fewer.` |
| Household | Open Leave Household confirmation, cancel, verify Membership remains | PASS |
| Household | Member leave and automatic fallback to remaining Household | PASS — departed Household data disappeared locally |
| Household | Sole-Owner leave protection | PASS — blocked with `The only Member cannot leave the Household.` |
| Lists | Empty state, create, rename, switch, sync, relaunch | PASS |
| Lists | Empty and whitespace name validation | PASS |
| Lists | 81-character create and rename boundaries | PASS — rejected with `List names are 80 characters max.` and existing names remained unchanged |
| Lists | Open Delete List confirmation, cancel, verify both Lists remain | PASS |
| Lists | Permanently delete a synced disposable List | PASS — staging Postgres tombstone verified |
| Lists | Delete the only List in a Household | PASS — returned to `No active Lists` |
| Items | Create multiple Items and Notes | PASS |
| Items | Rename and edit Notes | PASS |
| Items | Complete/uncomplete and persistence | PASS |
| Items | Move between Lists without loss or duplication | PASS |
| Items | Dirty unsaved edit discarded on relaunch | PASS |
| Items | Quantity and Unicode Notes through save/List switch and field restoration | PASS; exact server state verified read-only |
| Items | Untouched-empty and whitespace-only creation | PASS — editor dismissed without creating an Item, matching the tested product contract |
| Items | Open Delete Item confirmation, cancel, verify Item remains | PASS |
| Items | Permanently delete a synced disposable Item | PASS — staging Postgres tombstone verified |
| Appearance | Dark, Light, System, immediate rendering and relaunch persistence | PASS |
| Members | Current Owner/You and empty pending Invitations | PASS |
| Members | Promote Member to Owner, verify; demote to Member, verify restrictions | PASS |
| Members | Remove Member and purge departed Household data | PASS — remaining Household preserved |
| Invitations | Blank and malformed email validation without creating Invitation | PASS |
| Invitations | Create, preview, accept, activate Household, expose synced Lists | PASS after warm-deep-link fix |
| Invitations | Revoke pending Invitation and reject exact revoked token | PASS — no Accept action or access grant |
| Join Code | Read, expand/collapse, copy code, copy link | PASS; secrets sanitized from evidence |
| Join Code | Join, leave, rotate, reject replaced code, accept rotated code | PASS |
| Join Code | Disable, reject disabled code, re-enable, and accept fresh code | PASS |
| Public web | Household and Invitation fallback pages with invalid secrets | PASS |
| App deep links | Open-in-app fallback and exact unavailable states for invalid secrets | PASS |
| Session integrity | Invalid public links created no Household membership | PASS |
| Offline first | Signed-in cold start during API/PowerSync outage | PASS after cached-session recovery fix |
| Offline first | Create/rename List; create/edit/check/delete Items; Unicode Notes | PASS |
| Offline first | Cold relaunch with queued local changes | PASS — exact state retained without duplication |
| Offline first | Reconnect, upload queue drain, server reconciliation, online relaunch | PASS — exact data integrity verified locally and in staging Postgres |
| About | Staging version label | PASS |
| About | Privacy Policy and Terms destinations | BLOCKED — URLs not configured or defined |

## Route and control coverage audit

Source inspection found 12 user-facing Expo Router screens plus three layout entries. Every user-facing screen was loaded during the campaign:

- Signed-out: Sign In and Sign Up.
- Signed-in: Home, Lists, Profile, Settings, Appearance, Household, Members & Invitations, and Switch Household.
- Public entry: Invitation acceptance and Household Join Code, using invalid sanitized secrets to prove fallback and app-opening behavior without changing access.

The final Luna read-only sweep rechecked the navigation drawer, Home, List picker, Lists, Household, Members & Invitations, Settings, Appearance, Profile, and final synced Home state. It also opened and canceled the List deletion, Item deletion, and Household-leave confirmations. Both Lists, Oat Milk, and the Owner Membership remained intact at that checkpoint; the user-approved final cleanup later removed the disposable Lists and Items. Source search confirmed there is no account-deletion or Household-deletion route, service action, or visible control to test.

## Confirmed defects and fixes

### 1. PR-introduced dead Search affordance

The PR rendered a visible disabled Search toolbar button solely as layout spacing even though search does not exist. Base did not expose this affordance. Tapping it could never open a query UI.

Local fix:

- Replaced the fake action with a fixed-width Expo Router toolbar spacer.
- Updated the integration assertion so Search is absent until the feature exists.
- Luna confirmed no magnifying glass, visually centered page dots, and a still-functional Choose List control after hot reload.

Verification: focused red/green test; 58 focused tests; full mobile 54 suites / 532 tests; typecheck; Biome; ESLint with no errors; React Doctor; `git diff --check`.

### 2. Live PR CI dependency audit failure

The live PR `verify` job failed only at `pnpm audit --audit-level high` after new high-severity advisories affected locked transitive versions.

Local fix:

- Updated patched same-major resolutions for `brace-expansion`, `fast-uri`, `js-yaml`, and `postcss`.
- Added exact ignores for two newly updated `image-size` GHSAs that currently have no patched release.
- Added a same-major `nanoid@3.3.17` security override and version-specific release-age exception after two further high advisories appeared during the campaign; vulnerable 3.3.15/3.3.16 lock entries are gone.
- Regenerated and frozen-installed the lockfile.

Verification: online and offline frozen installs, CJS/ESM nanoid smoke checks, formatting, typecheck, Biome, ESLint, focused real-listener API tests, and `git diff --check` passed. The user-authorized `pnpm audit --audit-level high` now exits 0: both nanoid highs are removed, and only the two documented `image-size` highs with no patched release remain under exact ignores.

### 3. Apple authorization cancellation surfaced as a failure

Canceling the native Apple authorization sheet produced `Sign in failed` / `The user canceled the authorization attempt.` instead of returning silently. The app checked only Expo's documented `ERR_REQUEST_CANCELED` code, but the live Expo/iOS 26 boundary delivered a plain `Error` with only `message` and `stack`.

Local fix:

- Retained the documented error-code check.
- Added only the two authoritative exact Expo cancellation-reason spellings: the installed Swift reason without a terminal period and the official user-facing form with one period.
- Added a red/green regression for the observed plain-Error shape; no broad cancellation matching was introduced.

Temporary sanitized error-shape instrumentation was removed. The final clean-bundle Luna retest canceled Apple once, waited five seconds, observed no alert, and restored the Owner session with Blue Basket Synced.

### 4. Successful Invitation acceptance dead-ended as unavailable

A valid warm deep link previewed Blue Basket and the server accepted the Invitation, created the Membership, and selected Blue Basket. The client nevertheless replaced the successful state with `Household unavailable` / `This Invitation is no longer available.` Reopening app root exposed the correctly accepted Membership and synced Lists.

Root cause: the successful warm deep-link handoff called `router.replace("/")`, retaining/remounting the consumed Invitation route and re-running preview against a now-consumed token.

Local fix:

- Use Expo Router `dismissTo("/")`, which pops to the warm stack's anchored Home and falls back to replacement when Home is absent.
- Add a red/green warm-deep-link regression at the real hook boundary.
- Keep the already-correct API mutation and session reload unchanged.

Live post-fix proof: a fresh Invitation previewed successfully; one Accept tap automatically landed on Blue Basket Home without back, relaunch, retry, or external root navigation; Primary and Secondary both loaded and reported `Synced`.

### 5. Signed-in offline cold start ignored the cached Authenticated App Session

With staging API and PowerSync deliberately unavailable, a cold start showed `Household unavailable` even though the Simulator contained a valid persisted Authenticated App Session and previously synced product data. The provider read persisted state only when Clerk reported signed out. Clerk remained signed in offline, so failed bootstrap had neither an in-memory session nor a cache-read fallback.

Local fix:

- On a normal signed-in activation whose bootstrap request fails, read the validated persisted Authenticated App Session and enter the existing restore/PowerSync connection path.
- Preserve `freshOnly`, sign-out, stale-attempt, and post-bootstrap connection-failure behavior.
- Defer the terminal activation error log until cached fallback is unavailable. Before this adjustment, successful recovery still emitted `logger.error`, and Expo's development overlay blocked the next interaction.
- Add provider and state-machine regressions for signed-in cached recovery, attempt ownership, analytics, and the absence of an error-level log after successful recovery.

Live post-fix proof: the same cold-start outage loaded QA Owner / Blue Basket and local product data without an Expo overlay. While isolated, Luna created and renamed a List; created Milk, Bread, and Ephemeral; set Milk Quantity `2` and Notes `Offline note 📴`; checked Bread; and deleted Ephemeral. An offline cold relaunch retained exactly one Milk and one checked Bread with no duplicate or resurrection. The Simulator held nine queued operations while staging Postgres held zero matching rows. After reconnection the queue drained to zero, staging contained one active renamed List, exact Milk fields, checked Bread, and only an Ephemeral tombstone; an online cold relaunch remained `Synced` and exact.

## Final local verification

`make verify` passed outside the filesystem sandbox so the API listener tests could bind localhost:

- All 6 workspace tasks succeeded.
- Mobile: 56 suites / 536 tests passed.
- API: 24 suites / 201 tests passed, including the real Node listener and Postgres transaction integration tests.
- Database package: 7 suites / 67 tests passed.
- TypeScript, Biome, and ESLint completed with no errors; only existing warnings were emitted.
- React Doctor, scoped to the exact deployed PR head, scanned all eight changed mobile files. Its sole warning was the provider's intentional stable `useCallback` dispatch at line 159; the identical code and comment exist at the deployed base, so the QA fixes introduced no new React Doctor diagnostic.
- `pnpm audit --audit-level high` exited 0 against npm's live advisory endpoint.
- `git diff --check` passed, no temporary QA debug tag remains in source, and all 681 evidence files are non-empty, including three valid MP4 recordings.

## Final staging data-integrity proof

Read-only source-Postgres and Simulator SQLite queries bracketed the offline run and cleanup:

- Before offline mutation, staging contained zero matching offline QA Lists or Items.
- Before reconnect, staging still contained zero while Simulator SQLite contained the renamed List, exact Milk fields including the Unicode note, checked Bread, tombstoned Ephemeral, and nine queued CRUD operations.
- After reconnect, the local queue was zero and staging matched the intended state exactly; the online UI and a cold relaunch matched it too.
- User-approved cleanup used only visible Item/List deletion confirmations. Final Blue Basket UI showed `No active Lists`.
- Final staging queries show zero active `QA 193` Lists and zero active `QA 193` Items; all five campaign Lists and seven campaign Items are tombstoned.
- QA Member 193 still owns active `Clover Basket`; all historical Blue Basket Membership rows are removed and no active duplicate exists.
- QA Owner 193 still owns `Blue Basket` and active `QA 193 Alternate Renamed`; sole-Owner leave preserved the latter Membership.
- Blue Basket has zero pending Invitations, two accepted Invitation history rows, one revoked Invitation history row, and exactly one active Join Code.

## Live PR delivery state

GitHub still reports PR #193 open at the exact deployed head SHA, with merge state `UNSTABLE` because its published `verify` run failed at the dependency audit. The fixes and QA evidence in this report are local and uncommitted; no commit, push, or PR mutation was requested or performed. Consequently, local `make verify` is green, but reviewers cannot see these fixes and GitHub CI has not rerun them.

## Environment and QA limitations

### Local staging URL cross-wire — corrected

The initial local `.env.staging` pointed the simulator at production API/PowerSync hostnames. The production API rejected the staging Clerk token, producing `Household unavailable`. The deployed staging services and EAS `preview` values were correct. Local ignored configuration was corrected, the app was rebuilt/reinstalled, and bootstrap passed idempotently. No production data mutation occurred.

### Legal destinations missing

`EXPO_PUBLIC_PRIVACY_POLICY_URL` and `EXPO_PUBLIC_TERMS_URL` are absent from local staging and EAS `preview`/`production`. No authoritative Privacy Policy or Terms routes/documents exist in the repo, public web app, history, or public Apple metadata. Settings correctly hides absent optional values, but staging violates the README's documented minimum environment configuration. Product/legal must publish and approve canonical HTTPS documents before operations can configure and rebuild the app.

### Simulator automation limitations

- macOS Simulator accessibility exposes React Native multiline `TextInput` as a non-settable Group. Visual caret/edit-menu evidence and successful real saves proved the fields were editable. Clipboard paste through the focused native field provided a reliable workaround; relevant Item tests passed 74/74.
- Long RocketSim recordings stalled and produced empty files. Three short recordings are valid: readiness, account-bootstrap failure state, and corrected cutover retest.
- Two Luna Computer Use sessions stalled and were replaced; no unobserved action was counted as a product result.

### Offline harness scope

Installed Xcode/Simulator exposed no per-Simulator Network Link Conditioner or supported `simctl` network toggle. To avoid changing the Mac host network, the approved outage harness rebuilt only the development bundle's API and PowerSync origins to an unreachable loopback port while Metro remained reachable. This created a deterministic app-scoped API/PowerSync data-plane outage, not a full iOS radio/OS network outage. The normal staging origins were restored afterward and independently verified through queue drain, UI `Synced`, server state, online relaunch, and public health probes.

### Transient stale sync-status observation

After restoring Bread Quantity and Notes to blank, the client displayed `Sync failed - changes saved locally` for more than 10 seconds even though staging Postgres already contained the successful update and PowerSync continued completing checkpoints. API, PowerSync, and Postgres stayed healthy with zero restarts; local queues were empty. A normal app relaunch returned to `Synced`, after which both Lists stayed synced and intact.

Sol classified this as a transient client-session/PowerSync status episode, not a confirmed PR source defect. The app directly projects SDK error flags; the incident did not capture which flag was set, so weakening the mapping could hide a real future failure. If it recurs, capture sanitized connection/data-flow flags and queue count before relaunch. Recovery during this run was a normal app relaunch; no data loss occurred.

## Unable to test

- The current app exposes no Household-deletion or account-deletion route, service action, or visible control, so those paths cannot be exercised through the shipped UI.
- Successful Apple/Google authorization requires dedicated provider identities and was not attempted with personal accounts; cancellation behavior was covered for both providers.
- Privacy Policy and Terms destinations cannot be tested until product/legal supplies canonical public HTTPS documents and operations configures them.
- A full OS-level radio/network outage could not be toggled on this Simulator/Xcode installation; the app's API/PowerSync data plane was isolated instead, covering the product's offline storage and reconciliation seams.

## Evidence index

Evidence is under sibling `qa-evidence/pr193-*` directories, including the final safe route/control sweep, access lifecycle, Invitation fix/revocation, Join Code/leave, permanent deletion, last-List/sole-Owner edges, and the complete offline outage/relaunch/reconciliation/cleanup sequence. Each exercised simulator state has a PNG plus an accessibility snapshot where available. Secrets, private email data, and passwords are excluded from reports; valid Join Code and Invitation secrets are not recorded.
