# Service And Data Contracts

Source: `full-discussion.md`

## Decision

Add first-class List creation, switching support, lifecycle operations, summary loading, archive state, validation, analytics, and human-friendly time display utilities. Keep public service methods concrete and product-shaped; do not expose a generic public `updateList()`.

## List Lifecycle

- Lists remain Household DB records owned by a Household.
- Add nullable `archived_at` to `lists`.
- Existing rows stay active because `archived_at IS NULL`.
- Delete continues to mean soft-delete through `deleted_at`.
- Deleted Lists are terminal in this slice and are not user-restorable.
- Archived Lists are recoverable through unarchive flows.
- Archived and deleted are distinct product states:
  - Archived: hidden from normal active switching and fallback, still visible in archived views, can be restored.
  - Deleted: excluded from normal List management and summary queries, no user-facing restore path.

Expose archive state in TypeScript as:

```ts
archived: boolean;
archivedAt: number | null;
```

## Service Methods

`ListService` should expose concrete public methods:

- `createList`
- `renameList`
- `archiveList`
- `unarchiveList`
- `deleteList`
- `getList`
- `listLists`

A private update helper is acceptable if it reduces repetitive SQL/timestamp mechanics, but public methods should retain action-specific validation, analytics, logging, and result handling.

## `listLists()`

`listLists()` should return domain-shaped summaries for switching, fallback, and future List views. It should not return raw SQL rows or component props.

Input shape:

```ts
type ListListsInput = {
  archive?: "active" | "archived" | "all";
  searchText?: string;
  createdByUserId?: string;
  sort?: "recentActivity" | "name" | "createdAt";
};
```

Rules:

- Default `archive` to `"active"`.
- Default `sort` to `"recentActivity"`.
- Always exclude `deleted_at IS NOT NULL`, including `archive: "all"`.
- Interpret `archive: "all"` as active plus archived non-deleted Lists.
- Filter `searchText` case-insensitively against List names.
- Filter `createdByUserId` by app-owned User ID from `lists.created_by_user_id`.
- Support one creator User ID in this slice.
- Do not add pagination in this slice.

Return a distinct summary type:

```ts
type ListSummary = {
  id: string;
  householdId: string;
  name: string;
  createdByUserId: string;
  createdAt: number;
  updatedAt: number;
  archived: boolean;
  archivedAt: number | null;
  lastActivityAt: number;
  uncheckedItemCount: number;
  checkedItemCount: number;
};
```

Counts:

- Count only non-deleted Items.
- `checkedItemCount` is Items whose latest check-state row is checked.
- `uncheckedItemCount` is active Items minus checked Items.

## Activity And Sorting

`lastActivityAt` is the max of:

- `lists.updated_at`
- latest `items.updated_at` among non-deleted Items in the List
- latest `item_checks.updated_at` for non-deleted Items in the List

Sort modes:

- `recentActivity`: `lastActivityAt DESC, createdAt ASC, id ASC`
- `name`: case-insensitive `name ASC, createdAt ASC, id ASC`
- `createdAt`: `createdAt DESC, id ASC`

Every List row mutation writes `updated_at`, including archive, unarchive, and delete. `deleteList` sets both `deleted_at` and `updated_at`. `listLists()` filters deleted Lists before computing or sorting visible activity.

## Lifecycle-Aware Results

`getList()` should not throw for missing or deleted Lists. It should return a discriminated result:

```ts
type GetListResult =
  | { status: "available"; list: List }
  | { status: "deleted"; listId: string; deletedAt: number; updatedAt: number }
  | { status: "missing"; listId: string };
```

Rules:

- Active and archived Lists return `{ status: "available", list }`.
- Deleted rows return `{ status: "deleted", listId, deletedAt, updatedAt }`.
- Missing rows return `{ status: "missing", listId }`.
- Throws remain appropriate for infrastructure failures, malformed data, or programming errors.

Existing-List mutations (`renameList`, `archiveList`, `unarchiveList`, `deleteList`) should also return lifecycle-aware results with at least `available`, `deleted`, and `missing` statuses. `createList` returns a new available List or a typed validation result.

## Validation And Idempotency

Create and rename share List name validation:

- Trim leading and trailing whitespace.
- Reject empty names after trimming.
- Max length: 80 characters.
- Preserve internal whitespace.
- Persist the trimmed value.
- Allow duplicate names without warnings or generated suffixes.

Validation should return typed user-correctable results:

```ts
type ListNameValidationError = "required" | "tooLong";
```

Idempotency:

- `archiveList` on an already archived List returns the archived List without timestamp churn.
- `unarchiveList` on an active List returns the active List without timestamp churn.
- `deleteList` on an already deleted List returns the deleted result without timestamp churn.
- Rename to the existing trimmed name is a no-op, updates no timestamp, and emits no analytics.
- Rename/archive/unarchive on deleted Lists do not modify or revive the row.

## Actor Identity

`ListServiceDeps` should capture the authenticated app-owned `userId`.

- `createList` uses captured `userId` for `created_by_user_id`.
- Mutation analytics use captured `userId`.
- Public write methods should not accept actor `userId`.
- `listLists({ createdByUserId })` remains an explicit filter input because it filters data rather than declaring the actor.

## Analytics

Emit analytics after successful local writes:

- `list_created`
- `list_renamed`
- `list_archived`
- `list_unarchived`
- `list_deleted`

Common properties:

- `household_id`
- `list_id`
- `user_id`

Explicit switching emits `list_switched` only when the User selects an existing active List from the switcher. Do not emit it for fallback, create-and-switch, or tapping the already-current List.

Do not track List names, search text, or Item counts.

## Time Display

Use `date-fns` behind app-owned utilities in `lib/time`.

- Add display helpers in `lib/time/display.ts`.
- UI components should call app-owned helpers, not `date-fns` directly.
- Do not add a clock abstraction.
- Services continue generating timestamps with `Date.now()`.

Primary helper:

```ts
formatRelativeDateLabel(timestampMs: number, nowMs: number = Date.now())
```

Rules:

- Inputs are epoch milliseconds only.
- Throw for invalid or non-finite timestamp inputs.
- Interpret timestamps in the viewer's local calendar.
- Return `today`, `yesterday`, `Jun 2`, or `Jun 2, 2025`.
- Include the year only outside the current year.
- Do not add midnight timers solely to refresh labels.
- Switcher rows compose copy as `Updated ${label}`.

Document the epoch-millisecond assumption near the helper or tests.
