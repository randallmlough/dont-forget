# Accessibility, States, And Copy

Source: `full-discussion.md`

## Decision

List switching turns the Home title/header into an interactive control and introduces many lifecycle states. UI copy, accessibility labels, and layout rules should make those states clear without exposing raw infrastructure details.

## Accessibility Semantics

Home Current List header:

- Role: button.
- Label example: `Current List, Groceries`.
- Hint: `Opens List switcher`.

Active switcher rows:

- Rows are buttons.
- Current row label should include current state, counts, and activity.
- Example: `Groceries, current List, 8 unchecked, 3 checked, updated today`.
- Non-current example: `Costco, 12 unchecked, 0 checked, updated yesterday`.

Archived switcher rows:

- Do not expose row selection as a switch action.
- Keep row actions accessible through overflow.

Overflow actions:

- Overflow button label example: `List actions for Costco`.
- Delete should use destructive semantics where the platform API supports it.

## Confirmation Copy

Archive confirmation:

- Title: `Archive this List?`
- Body: `{ListName} will move to Archived Lists. You can restore it later.`
- Actions: `Archive` and `Cancel`.
- No type-to-confirm.

Delete confirmation:

- Title: `Delete this List?`
- Body: `{ListName} will be removed from the app. This cannot be undone.`
- Actions: destructive `Delete` and `Cancel`.
- No type-to-confirm.

Use the List name in the body because duplicate names are allowed and the User should see the target before confirming.

## Home State Copy

Zero active Lists:

- Title: `No active Lists`
- Body: `Create a List to start adding Items.`
- Primary action: `Create List`
- Secondary action: `View Archived` only if archived Lists exist

Archived Current List:

- Callout title: `This List is archived.`
- Actions: `Restore` and `Switch List`.
- Keep Items visible but read-only.

Deleted Current List:

- Title: `This List was deleted.`
- Body: `Switch to another List or create a new one.`
- Actions: `Switch List` and `Create List`.
- Do not show stale Items.

## Switcher State Copy

- Active empty without filters: `No active Lists`
- Active no matches: `No matching Lists`
- Archived empty: `No archived Lists`
- Archived no matches: `No matching archived Lists`
- Load error: `Lists could not be loaded.`

## Mutation Error Copy

Infrastructure or unexpected failures should show generic user-facing text and log technical details through existing logging patterns.

- Create failure: `List could not be created.`
- Rename failure: `List could not be renamed.`
- Archive failure: `List could not be archived.`
- Delete failure: `List could not be deleted.`
- Unarchive failure: `List could not be restored.`

Lifecycle/stale-state messages:

- Missing non-current List: `List is no longer available.`
- Deleted non-current List: `List was deleted.`

Use `Try Again` for load failures and retryable inline states where practical. Do not show raw exception messages in UI.

## Validation Copy Placement

Typed results should surface at the smallest useful scope:

- `invalidName`: inline field error in create/rename.
- `missing` non-current target: toast/banner-style message, refresh rows, keep sheet open.
- `deleted` non-current target: toast/banner-style message, refresh rows, keep sheet open.
- Deleted Current List: Home deleted-state view.
- Archived Current List: Home archived read-only callout.
- Infrastructure failure: inline in active sheet/state, with retry where useful.

## Long Name Layout

- Home header: single line, tail-truncated.
- Switcher row title: up to two lines, then tail-truncated.
- Confirmation body: wraps so the List name can be read.
- Create/rename input: single-line text input with normal horizontal editing.

## Read-Only Archived Lists

Archived Current Lists reuse normal Home Item visibility and ordering, but editing is disabled.

- Hide or disable add Item controls.
- Disable check/uncheck and other Item mutation interactions.
- Do not introduce archive-specific checked/unchecked filtering.
- Deleted Current List state should not render stale Items.
