# Tooling

## Verification

- **Must** use `make verify` as the standard proof for TypeScript and TSX changes when practical.
- **Must** include Biome in `make verify`; formatting, import organization, and Biome lint violations are verification failures.
- **Must** fail verification on diagnostics each tool treats as errors; do not promote warnings to errors unless a later standards decision changes that policy.
- **Must** keep package-manager commands on `pnpm`; do not add `npm`, `npx`, or `yarn` workflows.
- **Should** prefer existing `make` targets over direct package scripts.
- **Should** use `make format` to apply Biome's safe formatter, import organization, and lint fixes.

## Biome And ESLint

- **Must** use Biome as the preferred formatter, import organizer, and general TypeScript/React linter.
- **Must** keep Expo ESLint in the verification path until we have evidence that removing it will not lose Expo or React Native-specific lint coverage.
- **Must** treat Biome as additive to the current Expo lint stack during the first standards pass.
- **Must** use Biome defaults for mechanical formatting unless a later standard documents a specific override.
- **Should** let Biome own mechanical formatting and import organization instead of hand-formatting imports or debating whitespace in reviews.
- **Should** provide a formatting command that applies Biome's safe formatter and import-organization fixes.
- **Should** exclude generated files from Biome when the generator owns their shape; update the source or generator instead of hand-maintaining generated output.
- **Must** limit Biome to supported project source and config files; bundled agent skills and generated files are not app standards targets.

## Import Paths

- **Must** use the `@/*` root alias for imports that cross top-level source folders such as `screens`, `components`, `lib`, `db`, and `app`.
- **Should** use relative imports for files within the same local module or folder when that keeps the relationship clearer than a root alias.
- **Avoid** deep relative imports that walk across top-level folders, such as `../../lib/...`; use `@/lib/...` instead.
- **Must** limit `index.ts` and `index.tsx` entrypoints to cohesive feature surfaces or modules.
- **Avoid** generic barrel files that re-export unrelated components, utilities, or heavy modules for convenience.
