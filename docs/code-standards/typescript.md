# TypeScript

## Strictness

- **Must** keep TypeScript strict mode enabled.
- **Must** avoid `any`; use `unknown` at untrusted boundaries and narrow it before use.
- **Must** avoid non-null assertions. Parse, guard, or throw with a useful message instead.
- **Must** use exported named types for props, return values, adapter interfaces, service inputs and outputs, and reusable state machines.
- **Must** avoid anonymous large object types repeated across files.
- **Must** avoid `{ [key: string]: unknown }` or `Record<string, unknown>` as a lazy substitute for a known shape, except for truly open metadata such as analytics traits.
- **Must** model async UI state as a discriminated union when it has loading, error, ready, empty, auth-gated, or similar variants.
- **Must** keep each discriminated union variant's required data on that variant only.
- **Must** render discriminated UI state with exhaustive status checks when practical.
- **Should** prefer discriminated unions for UI and domain state machines.
- **Should** infer local implementation details when the type is obvious and not exported.
- **Should** use `status` for UI state discriminants unless a domain-specific discriminant is clearer.
- **Should** prefer string literal unions over enums unless an external API or library requires an enum shape.
- **Avoid** broad optional-property bags when only certain property combinations are valid.
- **Avoid** parallel `isLoading`, `isError`, `error`, `data`, or `empty` state fields for the same async operation.

## Boundary Validation

- **Must** use Zod for external trust boundaries such as environment/config parsing and API response/request parsing.
- **Must** validate environment/config, API requests and responses, deep link or route params, persisted storage payloads, and third-party SDK or webhook payloads before trusting them.
- **Must** parse at the boundary, then pass typed parsed values inward.
- **Must** infer TypeScript types from Zod schemas when the schema is the source of truth for a boundary payload.
- **Should** keep simple local database row coercion helpers when the schema is narrow and private to one query.
- **Should** keep Drizzle-selected rows typed by Drizzle when they are local to one query and not crossing a process or persistence boundary.
- **Should** introduce shared Zod schemas for repeated database row or fixture shapes instead of duplicating guards.
- **Avoid** sprinkling `as SomeType` casts after JSON parsing, route param reads, storage reads, or SDK callback payloads.

## Assertions

- **Must** prefer narrowing, parsing, generic constraints, or better function signatures before using a type assertion.
- **Must** keep type assertions local to the smallest expression possible.
- **Must** add a short comment when an assertion depends on a runtime invariant TypeScript cannot see.
- **Should** allow assertions for library interop, branded or opaque IDs, typed object key iteration, and test helpers when the invariant is clear.
- **Avoid** double assertions such as `value as unknown as T`.
- **Avoid** file-wide or return-wide assertions that hide unsafely shaped objects.

## Imports And Node Code

- **Must** use `import type` for type-only imports when practical.
- **Must** use the `node:` protocol for Node.js built-in modules.
- **Should** keep Node/operator scripts explicit about their runtime assumptions instead of hiding behavior behind app-only abstractions.
