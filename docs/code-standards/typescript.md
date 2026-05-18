# TypeScript

## Strictness

- **Must** keep TypeScript strict mode enabled.
- **Must** avoid `any`; use `unknown` at untrusted boundaries and narrow it before use.
- **Must** avoid non-null assertions. Parse, guard, or throw with a useful message instead.
- **Should** prefer discriminated unions for UI and domain state machines.
- **Should** prefer string literal unions over enums unless an external API or library requires an enum shape.

## Boundary Validation

- **Must** use Zod for external trust boundaries such as environment/config parsing and API response/request parsing.
- **Must** infer TypeScript types from Zod schemas when the schema is the source of truth for a boundary payload.
- **Should** keep simple local database row coercion helpers when the schema is narrow and private to one query.
- **Should** introduce shared Zod schemas for repeated database row or fixture shapes instead of duplicating guards.

## Imports And Node Code

- **Must** use `import type` for type-only imports when practical.
- **Must** use the `node:` protocol for Node.js built-in modules.
- **Should** keep Node/operator scripts explicit about their runtime assumptions instead of hiding behavior behind app-only abstractions.
