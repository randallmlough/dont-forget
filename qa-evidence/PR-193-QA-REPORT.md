# PR #193 Staging QA — Historical Record

> This report records the staging campaign completed on 2026-08-07 against deployed commit
> `d695476ce52c7ee47edf1e80fbb5f1647fb10521`. The PR advanced after that commit. Those later
> commits were not redeployed and retested as part of this campaign, so this document is not
> evidence for the current PR head.

PR: <https://github.com/randallmlough/dont-forget/pull/193>

Branch at the time: `advisor/074-ios-universal-links-staging-qa`

Historical campaign status: **all reachable flows exercised; limitations documented below**

## Scope

- The staging API, web, PowerSync, source Postgres, and storage Postgres services ran the tested
  deployment and remained healthy during the campaign.
- Public API and PowerSync health probes passed. AASA served the production and staging app
  identifiers for Invitation acceptance and Household Join Code paths.
- The iOS staging app used the dedicated staging API and PowerSync hosts. EAS `preview`
  configuration was checked against the same hosts.
- Mobile fixes discovered during the campaign were locally retested against the deployed
  services before they were committed. Their later commits are outside this report's deployment
  scope.

## Results

| Area | Historical result at campaign close |
| --- | --- |
| Authentication and session | PASS for sign-up, sign-in, sign-out, relaunch, validation, and Apple/Google cancellation |
| Profile | PASS for validation, save, and relaunch persistence |
| Households and Members | PASS for create, rename, switch, isolation, role changes, removal, leave, and sole-Owner protection |
| Lists and Items | PASS for validation, create, edit, move, completion, deletion, sync, relaunch, boundaries, and Unicode Notes |
| Invitations and Join Codes | PASS for create, preview, accept, revoke, rotate, disable, reject, and Household activation |
| Public web and app links | PASS for fallback pages, deep links, invalid-secret states, and no unintended Membership mutation |
| Offline data flow | PASS for cached cold start, offline changes, relaunch, reconnect, queue drain, and server reconciliation |
| Appearance and About | PASS for Dark, Light, System, persistence, and the staging version label |
| Privacy Policy and Terms | BLOCKED because canonical URLs were not configured or defined |

Every user-facing screen available at the time was opened. Destructive confirmations were also
opened and canceled to verify retained data, and disposable Lists and Items were later deleted
through the visible product controls.

## Defects fixed and locally retested during the campaign

- Removed a disabled Search affordance that represented no available feature, while preserving
  the working Choose List control and toolbar alignment.
- Updated vulnerable dependency resolutions and narrowly documented two `image-size` advisories
  that had no patched release; the high-severity audit then exited successfully.
- Treated the observed Apple authorization cancellation as a silent cancellation instead of a
  sign-in failure.
- Changed successful warm Invitation handoff so acceptance returned to Home instead of remounting
  the consumed Invitation route as unavailable.
- Restored a validated cached Authenticated App Session after signed-in bootstrap failed offline,
  allowing previously synced data and queued changes to remain usable.

These retests used the campaign working tree against the deployed SHA above. They do not establish
that a later PR head received an equivalent staging deployment or full staging rerun.

## Verification captured at campaign close

- `make verify`: all six workspace tasks succeeded.
- Mobile: 56 suites / 536 tests passed.
- API: 24 suites / 201 tests passed.
- Database package: 7 suites / 67 tests passed.
- TypeScript, Biome, ESLint, the high-severity dependency audit, and `git diff --check` passed.
- Post-reconnect checks found an empty local upload queue and matching intended staging state.
- Cleanup left zero active campaign Lists or Items; historical rows were tombstoned as expected.

These counts describe the campaign working tree at that time, not the present checkout.

## Limitations

- Successful Apple and Google authorization required dedicated provider identities and was not
  attempted with personal accounts; cancellation was covered for both providers.
- Privacy Policy and Terms destinations could not be tested without approved public HTTPS URLs.
- The product exposed no account-deletion or Household-deletion route, service action, or visible
  control to exercise.
- The available iOS simulator tooling could not create a full radio/OS network outage. The test
  instead isolated the app's API and PowerSync data plane, then verified persisted offline state,
  queue drain, reconciliation, and a subsequent online relaunch.
- One transient sync-status error appeared after a successful server update. No data loss or stuck
  queue was observed, and a normal relaunch restored `Synced`; the underlying SDK flag was not
  captured, so the event was not classified as a confirmed source defect.

## Evidence retention

The raw local screenshots, recordings, accessibility snapshots, logs, and machine metadata from
this campaign are intentionally not retained in Git. This sanitized report is the sole tracked QA
artifact.
