---
paths:
  - "lib/**/*.ts"
---

You are working on library or service code. Read the relevant standards BEFORE writing:

- `docs/code-standards/architecture.md` — service layer, data boundaries, providers, observability
- `docs/code-standards/typescript.md` — boundary validation with Zod, no assertions
- `docs/guides/creating-domain-service.md` — when creating a new domain service

Product data access belongs in domain-first services under `lib/services/<domain>/`.
