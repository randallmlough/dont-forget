# User Invitation Flow Discussion

Date: 2026-05-29

This directory splits the completed User Invitation flow discussion into smaller theme notes while preserving the original synthesis in `full-discussion.md`.

## Source

- `full-discussion.md`: complete original discussion note and final completion audit.

## Theme Notes

- `household-switching.md`: active Household selection, switch UI, previous Household behavior, and sync-before-switch policy.
- `household-join-code-flow.md`: reusable Household Join Code lifecycle, management, manual entry, link join, throttling, and audit behavior.
- `invitation-flow.md`: Member viewing, Invitation creation, pending Invitation management, revocation, and acceptance behavior.
- `auth-redirect-and-public-routes.md`: public accept/join routes, signed-out preservation, `next` handling, and preview privacy.
- `api-service-and-session-contracts.md`: API routes, `lib/api` boundary, service responsibilities, status codes, bootstrap changes, and `reloadSession`.
- `testing-security-and-analytics.md`: integration testing expectations, security/privacy rules, generic errors, and analytics events.
- `implementation-handoff.md`: ordered backend/session-first implementation plan.

## Stage Discussions And PRDs

- Stage 1: `stage-1-domain-documentation-discussion.md`, `prd-stage-1-domain-documentation.md`, [GitHub Discussion #69](https://github.com/randallmlough/dont-forget/discussions/69)
- Stage 2: `stage-2-directory-schema-and-migration-discussion.md`, `prd-stage-2-directory-schema-and-migration.md`, [GitHub Discussion #71](https://github.com/randallmlough/dont-forget/discussions/71)
- Stage 3: `stage-3-server-services-discussion.md`, `prd-stage-3-server-services.md`, [GitHub Discussion #70](https://github.com/randallmlough/dont-forget/discussions/70)
- Stage 4: `stage-4-authenticated-app-session-discussion.md`, `prd-stage-4-authenticated-app-session.md`, [GitHub Discussion #72](https://github.com/randallmlough/dont-forget/discussions/72)
- Stage 5: `stage-5-api-layer-discussion.md`, `prd-stage-5-api-layer.md`, [GitHub Discussion #73](https://github.com/randallmlough/dont-forget/discussions/73)
- Stage 6: `stage-6-integration-tests-and-fixtures-discussion.md`, `prd-stage-6-integration-tests-and-fixtures.md`, [GitHub Discussion #74](https://github.com/randallmlough/dont-forget/discussions/74)
- Stage 7: `stage-7-ui-routes-and-screens-discussion.md`, `prd-stage-7-ui-routes-and-screens.md`, [GitHub Discussion #75](https://github.com/randallmlough/dont-forget/discussions/75)

## Status

Complete for implementation handoff. Open questions: none.
