# Schema-tolerance stances diverge between item-service and list-service

## Context

ADR-0003 says the app does not run bundled Household migrations against synced local replicas, so app code historically tolerated the previous local schema: `item-service.ts` probes `PRAGMA table_info(items)` (`hasQuantity`) before selecting the `quantity` column.

When `list-service.ts` gained `archived_at` read paths (List Creation Switching MVP, task 2), the worker skipped an equivalent probe, citing CLAUDE.md §0's greenfield stance (no users, no stale replicas can exist; a hypothetical stale replica fails loudly via the row schema parse). The architecture review accepted that call but flagged that the codebase now carries both stances simultaneously: item-service probes, list-service deliberately does not.

## Debt

The divergence is unowned. Either:

1. Remove the now-dead `hasQuantity` probe from item-service under the same greenfield argument, or
2. Write down (in ADR-0003 or a successor) when stale-schema tolerance applies and when the greenfield stance overrides it.

## Source

Architecture review of commit `85ba4e0e` (task 2, List Creation Switching MVP), 2026-06-10.
