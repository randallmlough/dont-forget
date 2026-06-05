# List Creation And Switching Discussion

Date: 2026-06-04

Status: Ready for implementation, split into service/data and Home/UI slices.

`full-discussion.md` is preserved as the source discussion. The files in this directory are synthesis documents for implementation and review; they should not be treated as a replacement for the full source if a detail is disputed.

## Theme Documents

- `service-and-data-contracts.md`: List lifecycle, `ListService` methods, `listLists()`, archive/delete semantics, validation, timestamps, analytics, and time display utilities.
- `current-list-selection-and-offline-behavior.md`: Local Current List persistence, fallback behavior, sync-discovered inactive Lists, offline-first write behavior, and local storage boundaries.
- `home-and-sheet-ux.md`: Home states, Expo UI bottom sheet direction, switcher/create/rename flows, row actions, search, empty states, and sheet transition rules.
- `accessibility-states-and-copy.md`: Accessibility labels, user-facing copy, long-name layout, confirmation text, and UI error placement.
- `implementation-handoff.md`: Recommended implementation slices, tests, Storybook coverage, and remaining implementation checks.

## Assets

- `assets/list-switcher-row-actions-mockup-2026-06-04.png`: Row overflow action mockup referenced by the full discussion and the UX synthesis.

## Open Question Status

There are no unresolved product questions in the source discussion. The remaining items are implementation checks that should be verified while building, especially native Expo UI sheet behavior, component placement, migration shape, and Storybook coverage boundaries.
