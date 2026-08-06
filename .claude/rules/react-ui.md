---
paths:
  - "apps/mobile/app/**/*.tsx"
  - "apps/mobile/src/**/*.{ts,tsx}"
---

You are working on React/React Native UI code. Read the relevant standards BEFORE writing:

- `docs/code-standards/react.md` — state, effects, hooks, async work
- `docs/code-standards/react-native.md` — rendering, lists, interaction, images, animation
- `docs/code-standards/react-composition.md` and `docs/code-standards/ui-composition.md` — compound components, feature surfaces, bottom sheets
- `docs/code-standards/styling.md` — Unistyles and theme tokens for app-owned styling

Keep route files in `apps/mobile/app/` thin; screen-owned behavior belongs in `apps/mobile/src/screens/<surface>/`.
