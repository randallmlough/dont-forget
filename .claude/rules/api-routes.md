---
paths:
  - "apps/api/src/**"
---

You are working on the standalone Hono API — server code, not UI. Read BEFORE writing:

- `docs/how-things-work/api-routes.md` — the HTTP boundary: `apps/api/src/app.ts -> apps/api/src/<domain>/api.ts ->` same-domain services; `/api/data` consumes the applicator through `@dont-forget/db`
- `docs/code-standards/architecture.md` — server and environment safety, data boundaries
- `docs/code-standards/typescript.md` — validate external boundaries with Zod
