# Additive Biome tooling

Don't Forget uses Biome as the canonical formatter, import organizer, and general TypeScript/React linter, and keeps Expo ESLint in the verification path for now. We chose this additive setup over Prettier plus ESLint or an immediate full ESLint replacement because Biome gives one fast mechanical style/import gate, while Expo ESLint still provides Expo and React Native-specific coverage that Biome may not fully replace yet.

See also: [`docs/code-standards/tooling.md`](../code-standards/tooling.md).
