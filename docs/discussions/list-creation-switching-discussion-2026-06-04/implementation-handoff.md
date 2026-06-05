# Implementation Handoff

Source: `full-discussion.md`

## Decision

Implement List creation and switching in two reviewable slices: service/data first, then Home/UI. The service/data contracts are substantial enough to prove independently before the UI depends on them.

## Slice 1: Service And Data Foundation

Build:

- Household DB migration and schema update for `lists.archived_at`.
- `List` contract archive fields.
- `ListSummary` contract.
- `ListService` methods:
  - `createList`
  - `renameList`
  - `archiveList`
  - `unarchiveList`
  - `deleteList`
  - lifecycle-aware `getList`
  - `listLists`
- `listLists()` filters, sorting, counts, and `lastActivityAt`.
- Lifecycle-aware existing-List mutation result shapes.
- Typed List name validation results.
- `ListServiceDeps.userId`.
- `lib/local-storage` Current List selection wrapper.
- `lib/time/display.ts` and `date-fns` dependency.
- List analytics events.
- Sync request after successful local List mutations.

Verify:

- Existing default List provisioning still works.
- Existing List rows remain active with `archived_at NULL`.
- Deleted Lists are excluded from every `listLists()` mode.
- Archived Lists are excluded from fallback/default active queries.
- Idempotent lifecycle operations do not churn timestamps.

## Slice 2: Home And UI Integration

Build:

- Route-owned Current List resolver.
- Home states:
  - active Current List
  - zero active Lists
  - archived Current List read-only state
  - deleted Current List state
  - missing selection fallback
- Pressable Home Current List header.
- Expo UI single-sheet List management flow.
- Switcher:
  - Active/Archived segments
  - debounced search
  - current row indicator
  - counts and activity labels
  - row overflow actions
  - empty and error states
- Create List mode.
- Rename List mode.
- Archive/delete confirmations.
- Unarchive flow.
- Storybook coverage.
- Home/container and focused UI tests.

Verify:

- Explicit active List selection switches immediately and emits `list_switched`.
- Create switches to the new List without emitting `list_switched`.
- User-initiated archive/delete of Current List applies fallback or zero-active state.
- Sync-discovered archived/deleted Current List does not auto-switch.
- Archived Current List is visible read-only.
- Deleted Current List does not show stale Items.
- Search stays scoped to the selected segment and preserves text across segment changes.

## Test Notes

Prioritize service behavior and Home state transitions.

Service tests:

- Create, rename, archive, unarchive, delete.
- Lifecycle-aware `getList()` for available, archived, deleted, and missing.
- `listLists()` archive filtering, search, creator filtering, sort modes, counts, and `lastActivityAt`.
- Name validation and unchanged rename no-op.
- Idempotent lifecycle operations.
- Deleted List terminal behavior.
- Analytics only on successful local writes.

Local storage tests:

- Selection keyed by `userId + householdId`.
- One map per User.
- Invalid payload cleanup.
- `clearUserSelections(userId)`.
- Storage wrapper does not validate List existence.

Time tests:

- `today`, `yesterday`, current-year date, prior-year date.
- Epoch-millisecond inputs only.
- Invalid input throws.
- Labels use viewer local calendar relative to `nowMs`.

Home/container tests:

- Active List render.
- Missing selection fallback.
- Zero-active empty state.
- Archived Current List read-only state.
- Deleted Current List state.
- User-initiated Current List archive/delete selection rule.
- Sync-discovered archived/deleted distinction.

Switcher/UI tests:

- Add focused interaction tests only if the existing setup supports them without heavy scaffolding.
- Otherwise rely on Storybook plus service/container tests for most behavior.

## Storybook Coverage

Required stories:

- Normal active switcher rows.
- Current row indicator.
- Row overflow actions.
- Active empty state.
- Archived empty state.
- Filtered no-match states.
- Load error state.
- Create sheet, including invalid/disabled and service-error states.
- Rename sheet, including unchanged and invalid states.
- Archive confirmation.
- Delete confirmation.
- Home zero-active empty state.
- Archived Current List read-only callout.
- Deleted Current List state.
- Duplicate List names.
- Long List names.

## Remaining Implementation Checks

These are not product-open questions; verify them while building:

- Expo UI `BottomSheet`, `ContextMenu` or menu-equivalent, and confirmation dialog behavior in the iOS simulator.
- `RNHostView` keyboard focus, sheet sizing, and single-sheet internal mode transitions.
- Exact component/file placement based on existing Home and component boundaries.
- Generated Household DB migration shape against Drizzle migration conventions.
- Whether Storybook can represent app-owned sheet content and Home states without requiring native sheet presentation in every story.

## Deferred

Do not add haptics in this feature. The idea is tracked in `docs/.local/ideas.md` for a dedicated haptics effort.
