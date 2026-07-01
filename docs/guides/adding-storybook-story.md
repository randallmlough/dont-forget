# Adding a Storybook Story

## Purpose

Use this guide to add or update a React Native Storybook story for a reusable component or screen view.

Storybook stories should make UI states reviewable without live Clerk, PowerSync, or network dependencies.

## Before you start

Read:

- `CONTEXT.md` for domain language.
- `docs/how-things-work/storybook.md` for native Storybook runtime behavior.
- `docs/code-standards/react-composition.md` for provider/composition patterns.
- `docs/code-standards/react-native.md` for list, accessibility, safe-area, and mobile UI expectations.
- `docs/how-things-work/app-structure.md` for story placement and generation commands.

Inspect nearby examples:

- `components/active-list/active-list.stories.tsx`
- `components/auth/auth-screen.stories.tsx`
- `screens/home/home-screen.stories.tsx`

## Files and naming

Put stories next to the component or screen they exercise, outside `app/`:

```text
components/<component>/<component>.stories.tsx
screens/<surface>/<surface>-screen.stories.tsx
```

Do not put stories under `app/`; Expo Router treats files there as routes.

## Story shape

Use typed Storybook metadata:

```tsx
import type { Meta, StoryObj } from "@storybook/react-native";

const meta = {
	title: "Domain/ComponentName",
	component: ComponentName,
} satisfies Meta<typeof ComponentName>;

export default meta;

type Story = StoryObj<typeof meta>;
```

Use `args` for simple presentational states. Use `render` when the story needs local providers, local state, or deterministic fakes.

## Recipe

1. **Choose the right story target.**
   - Reusable component stories belong in `components/`.
   - Route screen stories should target extracted view components when possible, not route files.
   - Keep auth, analytics, navigation, and database side effects out of Storybook stories.

2. **Create realistic fixtures.**
   - Use Household, Member, List, Item, User, and Invitation language.
   - Include empty, normal, loading, and error states when those states are user-visible.
   - For Item lists, include checked and unchecked Items, long names when layout matters, and enough rows when list behavior is under review.

3. **Provide local fakes for data contracts.**
   - If a component expects an Active List data source, provide a local in-memory fake.
   - If a component consumes sync status, provide a deterministic `SyncStatus` fixture; there is no sync coordinator to fake.
   - Do not open a real PowerSync database from stories.

4. **Add decorators only for missing app context.**
   - Wrap stories in a themed canvas when needed.
   - Add safe-area or provider wrappers only when the component normally receives that context from `app/_layout.tsx` or a route shell.

5. **Use `parameters.noSafeArea` for route shells that already own safe areas.**
   - `HomeScreenView` uses this because the route shell already applies safe-area handling.

6. **Keep story interactions deterministic.**
   - Local state is fine for adding/checking Items in stories.
   - Avoid real network calls, real auth, real analytics providers, and real database handles.

7. **Regenerate the Storybook registry.**

   ```bash
   make storybook-generate
   ```

## Tests and verification

After adding, moving, or deleting stories:

```bash
make storybook-generate
make format
```

Run focused tests when the story accompanies component or screen behavior changes:

```bash
pnpm exec jest --runInBand --runTestsByPath components/<component>/<component>.test.tsx
pnpm exec jest --runInBand --runTestsByPath screens/<surface>/<surface>-screen.test.tsx
```

Before handoff:

```bash
make verify
```

When visual/native behavior matters, validate Storybook in the native iOS build/dev client:

```bash
make storybook-ios
# or, after a native build/dev client exists:
make storybook
```

## Review checklist

- Story file lives next to the component/screen and outside `app/`.
- Story title follows the existing naming style.
- Fixtures use Don't Forget domain language.
- Stories cover meaningful UI states, not only the ideal state.
- No live Clerk, PowerSync, network, or analytics dependency is used.
- Data-source and sync-status fakes are deterministic.
- Safe-area behavior matches the rendered surface.
- `make storybook-generate`, `make format`, and relevant tests ran.
