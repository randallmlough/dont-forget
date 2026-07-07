# Adding a Screen/View Split

## Purpose

Use this guide to add or change an Expo Router route that delegates to screen-owned code under `src/client/features/<feature>/`.

A screen/view split keeps route files thin while making UI states testable and Storybook-friendly.

## Before you start

Read:

- `CONTEXT.md` for domain language.
- `docs/code-standards/architecture.md` for route and screen ownership.
- `docs/how-things-work/app-structure.md` for repository layout.
- `docs/how-things-work/routing.md` for route groups and current routes.
- `docs/how-things-work/storybook.md` if the screen has meaningful visual states.
- `docs/code-standards/react-native.md` for accessibility, list, keyboard, safe-area, and mobile UI expectations.

Inspect existing examples:

- `src/app/(app)/index.tsx`
- `src/app/(auth)/sign-in.tsx`
- `src/app/(auth)/sign-up.tsx`
- `src/client/features/list/home-screen.tsx`
- `src/client/features/list/home-screen.test.tsx`
- `src/client/features/list/home-screen.stories.tsx`

## Files and naming

Authenticated routes go under `src/app/(app)/`.

Signed-out auth routes go under `src/app/(auth)/`.

Screen-owned code goes under `src/client/features/<feature>/`:

```text
src/app/(app)/example.tsx
src/client/features/example/example-screen.tsx
src/client/features/example/example-screen.test.tsx
src/client/features/example/example-screen.stories.tsx
```

Prefer kebab-case filenames. Keep route files thin.

## Route file shape

Most route files should be a one-line export:

```tsx
export { default } from "@/client/features/example/example-screen";
```

Do not put tests, stories, SQL, data loading, or feature lifecycle code in `src/app/` route files.

## Screen file shape

Use a default export for the route container. Extract a named view component when it improves tests or stories:

```tsx
export type ExampleScreenViewProps = {
	content: ExampleContentState;
	onRetry?: () => void;
};

export default function ExampleScreen() {
	const content = useOwningProviderOrHook();
	return <ExampleScreenView content={content} />;
}

export function ExampleScreenView({ content, onRetry }: ExampleScreenViewProps) {
	return null;
}
```

Use the container for screen-owned side effects and app dependencies. Use the view for renderable states.

## Recipe

1. **Choose the route group.**
   - Use `src/app/(app)` for signed-in product routes.
   - Use `src/app/(auth)` for signed-out auth routes.
   - Add a new route group only when a set of routes needs shared navigation options, providers, or a clear boundary.

2. **Create the route file.**
   - Keep it to the route export when practical.
   - Do not add duplicate Clerk or PostHog providers.

3. **Create the screen file.**
   - Place UI and screen-local behavior in `src/client/features/<feature>/`.
   - Put reusable UI primitives in `src/client/ui/` instead.

4. **Separate container and view when useful.**
   - Extract a named view when Storybook or tests need deterministic state without live providers.
   - Keep simple screens as one component if a split would add ceremony without value.

5. **Keep resource ownership at the right boundary.**
   - Signed-in routes consume `useAuthenticatedAppSession()` and route-owned feature hooks.
   - Screens must not manage the PowerSync connection or session resources directly.
   - PowerSync connection lifecycle belongs to the Authenticated App Session provider, not a screen.

6. **Add focused tests.**
   - Test route/screen behavior outside `src/app/`.
   - Mock provider hooks at the screen boundary when the screen borrows provider state.
   - Test user-visible behavior through accessibility queries and visible text.

7. **Add or update stories for meaningful UI states.**
   - Storybook should render view components or composed surfaces with local fixtures.
   - Include loading, error, empty, and populated states when those are part of the screen contract.

## Tests and verification

Focused screen test:

```bash
pnpm exec jest --runInBand --runTestsByPath src/client/features/<feature>/<surface>-screen.test.tsx
```

If stories changed:

```bash
make storybook-generate
```

Before handoff:

```bash
make format
make verify
```

Use RocketSim/iOS Simulator validation when the change affects navigation, keyboard behavior, accessibility, safe areas, scrolling, native modules, offline/online behavior, or Current List/Item interactions.

## Review checklist

- Route file is thin and under the correct route group.
- Screen-owned code lives under `src/client/features/<feature>/`.
- Reusable UI lives under `src/client/ui/`.
- Container/view split is justified by tests, stories, or dependency boundaries.
- Screen does not own the PowerSync connection or sync lifecycle.
- Tests live outside `src/app/`.
- Stories use deterministic fixtures and no live app resources.
- Accessibility roles, labels, states, safe areas, and keyboard behavior are considered.
- `make format` and `make verify` pass.
