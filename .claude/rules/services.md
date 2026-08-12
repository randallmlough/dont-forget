---
paths:
  - "apps/mobile/src/features/**/*.ts"
  - "apps/mobile/src/session/**/*.ts"
  - "apps/api/src/**/*.ts"
---

You are working on library or service code. Read the relevant standards BEFORE writing:

- `docs/code-standards/architecture.md` — service layer, data boundaries, providers, observability
- `docs/code-standards/typescript.md` — boundary validation with Zod, no assertions
- `docs/guides/creating-domain-service.md` — when creating a new domain service

Mobile product services live with their feature under `apps/mobile/src/features/<feature>/`; Authenticated App Session services live under `apps/mobile/src/session/`; API domain services live under `apps/api/src/<domain>/`. Consume shared and DB code only through declared, exported `@dont-forget/*` package entrypoints.
