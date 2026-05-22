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
- **Must** keep the Expo ESLint flat config in the verification path until we have evidence that removing it will not lose Expo or React Native-specific lint coverage.
- **Must** run ESLint over the whole project, not Expo CLI's narrowed default directories, so `screens/`, `lib/`, `db/`, and tooling code are covered.
- **Must** treat Biome as additive to the current ESLint stack during the first standards pass.
- **Must** use Biome defaults for mechanical formatting unless a later standard documents a specific override.
- **Must** treat React hook dependency correctness, explicit TypeScript safety, and React Native accessibility diagnostics as verification failures.
- **Must** keep `react-hooks/exhaustive-deps`, `@typescript-eslint/no-unused-vars`, `@typescript-eslint/no-non-null-assertion`, `@typescript-eslint/no-explicit-any`, `@typescript-eslint/consistent-type-assertions`, and enabled `react-native-a11y/*` rules at error severity unless a later standards decision changes that policy.
- **Must** keep repo-specific ESLint rules under `tools/eslint-rules/` tested with `pnpm test:eslint-rules`.
- **Must** keep `dont-forget/no-screen-use-effect` enabled so screen implementation files render explicit state/actions and move effects to route-owned hooks or containers.
- **Must** prefer adding ESLint enforcement for mechanical, low-false-positive standards when humans or AI agents repeatedly miss the documented rule.
- **Should** let Biome own mechanical formatting and import organization instead of hand-formatting imports or debating whitespace in reviews.
- **Should** provide a formatting command that applies Biome's safe formatter and import-organization fixes.
- **Should** exclude generated files from Biome when the generator owns their shape; update the source or generator instead of hand-maintaining generated output.
- **Must** limit Biome to supported project source and config files; bundled agent skills and generated files are not app standards targets.
- **Should** add community ESLint plugins before custom rules when a maintained plugin enforces the same standard with low noise.
- **Avoid** broad preset adoption from community plugins without first checking the effective config and current lint noise.

## Import Paths

- **Must** use the `@/*` root alias for imports that cross top-level source folders such as `screens`, `components`, `lib`, `db`, and `app`.
- **Should** use relative imports for files within the same local module or folder when that keeps the relationship clearer than a root alias.
- **Avoid** deep relative imports that walk across top-level folders, such as `../../lib/...`; use `@/lib/...` instead.
- **Must** use `index.ts` and `index.tsx` only as curated public entrypoints for cohesive feature surfaces or modules.
- **Must** keep feature entrypoints free of test-only, story-only, server-only, or internal implementation exports.
- **Must** import internal files directly from within the same feature instead of routing through that feature's public entrypoint.
- **Should** export only the types, components, and functions intended for other features to consume.
- **Avoid** root-level or folder-level barrel files that re-export unrelated components, utilities, or heavy modules for convenience.
- **Avoid** importing from a feature entrypoint inside that same feature because it obscures dependency direction.
