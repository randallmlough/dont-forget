# PR 193 bootstrap cutover retest

Date: 2026-08-07
Environment: Don't Forget Staging (`com.dont-forget.app.staging`), iPhone 17 Pro / iOS 26.5

## Result

**PASS after staging correction.** On inspection, the app had automatically recovered to the authenticated Home screen; no retry was required. Home initially showed `No active Lists` and `Create a List to start adding Items.`

Household verification succeeded after opening Household and waiting for sync:

- Household: `Blue Basket` (initials `BB`)
- Membership: `Owner · 1 Member`

The Lists screen initially contained no List rows. Per the retest scope, one expected first List was created: `QA Bootstrap List 20260807`. Its detail screen showed `No Items yet` and `Synced`, with `Tap + to add an Item.`

Settings showed `Version 1.0.0 (staging)`.

Normal app terminate/relaunch then returned to the authenticated List screen without duplication. Accessibility confirmed `QA Bootstrap List 20260807`, `No Items yet`, `Synced`, `Focused List ... List 1 of 1`, and an enabled `Add Item` control.

## Matrix

| Flow | Result |
| --- | --- |
| Automatic recovery after staging cutover | PASS |
| Household availability and membership | PASS |
| Default List present before manual creation | NOT PRESENT; Lists screen was empty |
| In-scope first List creation | PASS |
| Empty Item state and sync indicator | PASS |
| Settings staging environment label | PASS |
| Authenticated state after normal relaunch | PASS |
| Duplicate List after relaunch | PASS; one List shown |

## Evidence

- `01-current-authenticated-home.png` and `01-current-authenticated-home-accessibility.txt`
- `02-settings-staging.png` and `02-settings-staging-accessibility.txt`
- `03-household-blue-basket.png` and `03-household-blue-basket-accessibility.txt`
- `04-lists-empty-before-create.png` and `04-lists-empty-before-create-accessibility.txt`
- `05-current-list-empty-items.png` and `05-current-list-empty-items-accessibility.txt`
- `06-relaunch-persisted-list.png` and `06-relaunch-persisted-list-accessibility.txt`
- `cutover-retest-stable.mp4` (valid MP4, 557,828 bytes)

No extra Household, Item, or duplicate List was created. The one named List above was the expected first List allowed by the retest scope.
