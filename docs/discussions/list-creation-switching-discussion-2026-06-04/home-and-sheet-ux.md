# Home And Sheet UX

Source: `full-discussion.md`

## Decision

Home remains the primary surface for the Current List. List switching and lightweight List management should happen from Home through an Expo UI bottom sheet with app-styled React Native content.

Reference mockup:

![List switcher row actions mockup](assets/list-switcher-row-actions-mockup-2026-06-04.png)

## Expo UI Sheet Direction

Use Expo UI for the native iOS sheet shell.

- Prefer `BottomSheet` from `@expo/ui/swift-ui`.
- Use `Host` where SwiftUI subtrees require it.
- Use `RNHostView` for app-styled React Native sheet content.
- Use Unistyles/app tokens for the switcher body, rows, search, and sheet content.
- The installed Expo UI version supports sheet detents, drag indicator visibility, fit-to-content sizing, background interaction, and hosted React Native content.
- The app can style hosted content backgrounds, but the native sheet container/chrome remains iOS-owned in this version. This is acceptable if app-styled content fills the visible body.

Do not rely on stacked bottom sheets in the first slice. Use one sheet shell with internal modes such as `switcher`, `create`, and `rename`. Use confirmation dialogs or equivalent for archive/delete.

## Home Entry Points

Normal active Current List:

- The Current List title/header is pressable.
- Tapping opens the switcher on `Active`.

Zero active Lists:

- Keep the signed-in member bar visible.
- Show title `No active Lists`.
- Body: `Create a List to start adding Items.`
- Primary action: `Create List`.
- Secondary action: `View Archived` only if archived Lists exist.
- Do not mount `ActiveList.Provider`, add-Item form, or Current List sync/error UI.
- `Create List` opens create mode.
- `View Archived` opens the switcher on `Archived`.

Archived Current List:

- Keep the Current List title/header visible and tappable.
- Tapping opens the switcher on `Archived`.
- Show Items read-only.
- Show callout with `Restore` and `Switch List`.

Deleted Current List:

- Do not show the normal Current List header.
- Do not show stale Items.
- Show deleted-state message with `Switch List` and `Create List`.

## Switcher Structure

The switcher sheet includes:

- Active/Archived segmented control.
- Search field with debounced `searchText`.
- List summaries from `listLists()`.
- Create List sheet-level action available from both segments.
- Row overflow actions.

Segment rules:

- Default to `Active` from the normal Home header.
- Open `Archived` from zero-active `View Archived`.
- Open `Archived` from archived Current List `Switch List`.
- Search is scoped to the selected segment.
- Preserve search text when switching segments.
- Provide a standard clear-search affordance.

Active segment:

- Shows active non-deleted Lists.
- Row tap switches to that active List.
- Current active row shows selected/current indicator.
- Tapping the current row is a no-op.
- Overflow actions: `Rename`, `Archive`, `Delete`.

Archived segment:

- Shows archived non-deleted Lists.
- Row tap does not switch.
- Current archived row can show selected/current indicator when launched from archived Current List state.
- Overflow actions: `Rename`, `Unarchive`, `Delete`.
- Unarchive switches to the restored List immediately.

Creator filtering:

- Implement `createdByUserId` in the service.
- Do not expose creator filter UI in the first switcher unless an existing compact Member picker pattern makes it cheap.
- Do not display creator identity in first-slice rows.

## Row Content

Rows should show enough context to distinguish Lists:

- List name.
- Current indicator when applicable.
- `uncheckedItemCount` and `checkedItemCount`.
- Recent activity text composed as `Updated ${formatRelativeDateLabel(lastActivityAt)}`.

Duplicate names are allowed. Do not warn or add synthetic suffixes.

## Empty And Error States

Switcher states:

- Active segment, no search/filter, no active Lists: `No active Lists`, `Create List`, plus `View Archived` if archived Lists exist.
- Active segment, search/filter no matches: `No matching Lists`.
- Archived segment, no archived Lists: `No archived Lists`.
- Archived segment, search/filter no matches: `No matching archived Lists`.
- Load error: compact inline `Lists could not be loaded.` with `Try Again`.

## Create Flow

Create uses the same sheet shell and a focused one-field form.

- Label: `List name`.
- Initial value: empty.
- Placeholder: `Groceries, Costco, Camping...`.
- Primary: `Create`.
- Secondary: `Cancel`.
- Disable `Create` until trimmed value is non-empty and at most 80 characters.
- Return submits when valid.
- Success closes the sheet, makes the new List Current, and renders the new empty List.
- Failure keeps the sheet open and shows a short error.

Cancel behavior:

- From switcher: return to switcher mode.
- From zero-active Home: dismiss sheet.
- Drag-to-dismiss from create mode closes the whole sheet and discards draft.

## Rename Flow

Rename uses the create form pattern.

- Label: `List name`.
- Initial value: current List name.
- Primary: `Save`.
- Secondary: `Cancel`.
- Same trim/required/max-80 validation.
- Available for active and archived Lists.
- If trimmed name is unchanged, close/return without service call.
- If the Current List is renamed, update Home header immediately.

Cancel behavior:

- Rename is launched from switcher in this slice.
- `Cancel` returns to switcher mode.
- Drag-to-dismiss closes the whole sheet and discards draft.

## Archive, Delete, And Unarchive

Archive:

- Lightweight confirmation.
- Reversible.
- Available from active row overflow.
- Current List archive applies post-action selection and closes sheet.
- Non-current archive keeps sheet open and refreshes rows.

Delete:

- Destructive confirmation.
- No user-facing restore path.
- Available from active and archived row overflow.
- Current List delete applies post-action selection and closes sheet.
- Non-current delete keeps sheet open and refreshes rows.

Unarchive:

- Available from archived row overflow and archived Current List callout.
- Makes restored List Current immediately.
- Closes the sheet or returns Home to clearly show the restored List.

## Sheet Mode And Busy Rules

Keep the sheet open when Home context remains the same:

- Rename current or non-current List: return to switcher, refresh rows.
- Archive/delete non-current List: keep sheet open, refresh rows.

Close the sheet when Home context changes:

- Create List.
- Archive/delete Current List.
- Unarchive List.
- Explicit active List switch.

While local submission is in progress:

- Disable primary action.
- Disable or ignore Cancel/back.
- Disable interactive dismissal when practical.
- Prevent repeated archive/delete confirmations.
- Do not wait for remote sync before unlocking or closing.

Unsaved create/rename drafts are discarded on cancel or dismissal without confirmation.
