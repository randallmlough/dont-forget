---
paths:
  - "app/api/**"
---

You are working on Expo API route handlers — server code, not UI. Read BEFORE writing:

- `docs/how-things-work/api-routes.md` — the HTTP boundary: `app/api/**/+api.ts -> lib/api/** -> lib/services/**`; route files export HTTP method functions and lazy-load server-only handlers
- `docs/code-standards/architecture.md` — server and environment safety, data boundaries
- `docs/code-standards/typescript.md` — validate external boundaries with Zod
