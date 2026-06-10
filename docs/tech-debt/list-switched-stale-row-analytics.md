# list_switched can record a switch to a List that never rendered

## Context

The Home switcher persists the local Current List selection and emits
`list_switched` before the resolver re-validates the selection. If a remote
delete/archive syncs in while the switcher sheet is open (the row list is a
snapshot), tapping the now-stale row persists the dead List ID, emits
`list_switched` with that `list_id`, and the resolver then clears the selection
and falls back — the user never sees the List the event claims they switched
to. Proven mechanically during task 6 adversarial review; reachability is
narrow (remote lifecycle change during the sheet-open window), behavior is
self-healing, and cross-Member lifecycle handling is an explicit MVP exclusion
(fast-follow 2).

## Debt

Dashboards consuming `list_switched` should know the event means "user tapped a
switcher row and the selection was persisted", not "the List rendered". When
fast-follow 2 adds sync-discovered lifecycle states, either re-validate before
emitting or accept and document the semantics permanently.

## Source

Adversarial review of commits e0b88e99/6e86189e (task 6, List Creation
Switching MVP), 2026-06-10.
