# Current List Selection And Offline Behavior

Source: `full-discussion.md`

## Decision

Current List selection is local-only app state for the signed-in User on the current device. It is not a Household DB row, directory DB preference, shared Household setting, or server-owned state.

## Local Selection Storage

Persist selection across app restarts using non-secret app-local storage.

Create a `lib/local-storage/` package for typed local persisted values. Current List selection should live there, not inside `ListService`.

Storage shape:

```ts
type CurrentListSelectionMap = Record<string, string>;
```

Rules:

- Store one JSON map per `userId`.
- Map key: `householdId`.
- Map value: selected `listId`.
- Expose wrappers such as:
  - `getSelection(userId, householdId)`
  - `setSelection(userId, householdId, listId)`
  - `clearSelection(userId, householdId)`
  - `clearUserSelections(userId)`
- Validate persisted payload shape.
- Remove invalid/corrupt payloads and treat them as no selection.
- Do not validate List existence inside `lib/local-storage`.

Session cleanup/sign-out should clear Current List selections for the signed-out User only. Do not clear selections for unrelated Users in this slice.

## Selection Validation And Fallback

Home or a route-owned Current List resolver validates the stored `listId` against `ListService` results.

Fallback rule:

- If stored selection is missing, invalid, missing locally, or tombstoned, select the most recently active non-deleted, non-archived List.
- If no active Lists exist, render the zero-active Home state.
- Never fall back to archived Lists, even when there are zero active Lists.

Fallback sort uses `listLists()` with recent activity ordering:

```txt
lastActivityAt DESC, createdAt ASC, id ASC
```

New Lists become Current immediately after successful local create.

## User-Initiated Current List Changes

Explicit switcher selection:

- Selecting an active non-current List persists the selected List ID locally.
- Emit `list_switched`.
- Close the switcher immediately.
- Do not request sync.

Selecting the already-current List:

- No-op.
- Do not emit `list_switched`.
- Keep row management actions available.

Creating a List:

- `createList` resolves after local Household DB insert.
- Persist the new List ID as Current.
- Request sync with the existing `localWrite` pattern.
- Do not emit `list_switched` for create-and-switch.

User-initiated archive/delete of the Current List:

- Apply the post-action selection rule immediately.
- Switch to the most recently active remaining List when one exists.
- Otherwise render the zero-active Home empty state.
- Close the management sheet so Home shows the result.

User-initiated archive/delete of a non-current List:

- Keep Current List unchanged.
- Refresh switcher summaries.

Unarchive:

- Unarchiving a List makes it Current immediately.
- This applies when restoring from archived views or archived Current List callout flows.

## Sync-Discovered Inactive Current Lists

The app must distinguish local User intent from state discovered later through sync.

If sync reveals the Current List was archived by another Member:

- Keep the archived List visible.
- Show the archived read-only callout.
- Disable Item editing.
- Offer `Restore` and `Switch List`.
- Do not silently move to fallback.

If sync reveals the Current List was deleted by another Member:

- Replace the List body with the deleted-state message.
- Do not show stale Items.
- Offer `Switch List` and `Create List`.
- Do not offer restore.
- Do not silently move to fallback.

If sync or refresh reveals the selected List is missing:

- Treat the local selection as invalid.
- Run fallback to active Lists or zero-active state.

Home should re-resolve Current List state after sync-driven reloads or refreshes.

## Offline-First Rules

List management stays local-first.

- `createList`, `renameList`, `archiveList`, `unarchiveList`, and `deleteList` resolve after local Household DB commit.
- Do not block local List mutations because sync is offline or failing.
- Request sync after successful local List mutations using the existing `localWrite` pattern.
- UI completion depends on local write success, not remote sync success.
- `listLists()` reads local Household DB data.
- Current List switching and local selection persistence work offline.
- Offline sync status should use existing sync coordinator UI/patterns.

Current List switching is not a Household domain write, so it should not request sync.

## Stale Mutation Targets

Missing or deleted mutation targets are normal lifecycle/selection states, not crash-worthy errors.

- Non-current `missing`: show `List is no longer available.`, refresh summaries, keep sheet open, emit no analytics.
- Current `missing`: treat selection as invalid and run fallback.
- Non-current `deleted`: show `List was deleted.`, refresh summaries, keep sheet open.
- Current `deleted`: render Home deleted-state.
