# PR 193 QA — Flow 1 account bootstrap

Date: 2026-08-07
Environment: Don't Forget Staging (`com.dont-forget.app.staging`), iPhone 17 Pro / iOS 26.5

## Result

Account creation form validation passed for the exercised cases. The authorized disposable account submission reached authenticated bootstrap, but bootstrap is blocked: the app shows **Household unavailable** / **Unable to prepare your Household. Please try again.** The exposed diagnostic element reports `authenticated app session activation failed`. Tapping **Try again** once reproduced the same failure.

Expected after successful verification/creation: authenticated app session activates and the initial Household, current/default List, and empty state become available.

Actual: no Household or List UI became available. The user appears to have been created far enough for an authenticated user id to be present, but the app session did not activate. This is a blocker for first-run use and for all signed-in CRUD flows dependent on bootstrap.

## Reproduction

1. Launch the staging app from a clean signed-out state.
2. Tap **Sign up**.
3. Tap **Create account** with all fields empty. Alert: **Missing info** / **Enter your email and a password.** Dismissing returns to the form.
4. Enter `not-an-email`, `testing1234`, and `testing1234`; tap **Create account**. Alert: **Sign up failed** / **is invalid**. Dismissing retains the entered values.
5. Enter the authorized disposable email, `testing1234`, and `testing12345`; tap **Create account**. Alert: **Passwords don't match** / **Re-enter your password to confirm.** Dismissing retains the entered values.
6. Correct the confirmation to `testing1234` and tap **Create account**. The screen transitions to **Household unavailable** / **Unable to prepare your Household. Please try again.**
7. Tap **Try again** once. The same alert remains and the authenticated-session activation error remains exposed in accessibility.

The second rapid Computer Use tap attempted during the transition was rejected as a stale element id; it did not submit a second request. Duplicate-submit behavior therefore remains unverified, but the first submit itself is enough to reproduce the blocker.

## Evidence

- `01-signed-out-baseline.png` and `01-signed-out-baseline-accessibility.txt`
- `02-empty-submit-validation.png` and `02-empty-submit-validation-accessibility.txt`
- `03-malformed-email-validation.png` and `03-malformed-email-validation-accessibility.txt`
- `04-password-mismatch-validation.png` and `04-password-mismatch-validation-accessibility.txt`
- `05-household-bootstrap-failure.png` and `05-household-bootstrap-failure-accessibility.txt`
- `05-household-bootstrap-failure-rocketsim.png` and `05-household-bootstrap-failure-rocketsim-debug.json`
- `06-household-bootstrap-retry-failure.png` and `06-household-bootstrap-retry-failure-accessibility.txt`
- `07-instrumented-retry-loading.png` and `07-instrumented-retry-loading-accessibility.txt`
- `account-bootstrap-failure-short.mp4` (valid MP4 capture of the preserved failure state)

No source files or product data were manually edited or deleted. Password values are intentionally omitted from this note.
