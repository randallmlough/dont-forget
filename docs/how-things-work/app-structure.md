# App And Workspace Structure

Don't Forget is a pnpm/Turbo monorepo with six workspaces. The mobile workspace follows Expo Router's file-based routing model, with a few local exceptions chosen for the app's current shape.

Sources reviewed:

- Expo blog: [How to organize Expo app folder structure for clarity and scalability](https://expo.dev/blog/expo-app-folder-structure-best-practices)
- Expo Router docs: [Parentheses route groups](https://docs.expo.dev/router/basics/notation/#parentheses)
- Expo sample: [expo/hot-chocolate app](https://github.com/expo/hot-chocolate/tree/main/app)

## Current Decision

Keep each owner inside its workspace:

```text
apps/mobile/       # iOS-only Expo/React Native app
apps/mobile/app/             # Expo Router routes
apps/mobile/src/features/
apps/mobile/src/screens/
apps/mobile/src/lib/
apps/mobile/src/session/
apps/mobile/src/theme/
apps/mobile/src/ui/
apps/mobile/src/test/
apps/api/          # standalone Hono Node API
apps/api/src/<domain>/
apps/api/src/test/
apps/web/          # separate public link surface
packages/shared/   # cross-boundary contracts and helpers
packages/db/       # Postgres/Drizzle, fixtures, and write applicator
tooling/
```

The repository root owns orchestration and shared configuration, not application source. Cross-workspace imports use declared/exported `@dont-forget/*` package entrypoints. Mobile and API internals can use their package-local `@mobile/*` and `@api/*` aliases.

## Route Groups

Use Expo Router route groups to organize routes without changing URLs:

```text
apps/mobile/app/
  _layout.tsx
  (app)/
    _layout.tsx
    index.tsx       # /
  (auth)/
    _layout.tsx
    sign-in.tsx     # /sign-in
    sign-up.tsx     # /sign-up
```

Route groups are implementation structure only. The group names do not appear in URLs, so `apps/mobile/app/(auth)/sign-in.tsx` remains `/sign-in`.

Use `(app)` for authenticated app routes and `(auth)` for signed-out auth routes. Add more groups only when a set of routes needs shared navigation, providers, or clear separation.

## Routes And Screens

Keep `apps/mobile/app/` files thin. A route file should usually export the screen it owns:

```tsx
export { default } from "@mobile/screens/app/home-screen";
```

Put route-owned screens and screen-local side effects in `apps/mobile/src/screens/`, organized by route ownership. Keep feature UI, data hooks, and services in `apps/mobile/src/features/<feature>/`. List services and collection/page composition belong to the List feature; Item services, editor behavior, rows, and sheets belong to the Item feature.

Put reusable primitives in `apps/mobile/src/ui/`. Feature-owned UI stays with the owning feature folder. For example, `apps/mobile/src/features/list/list-page.tsx` and `list-items.tsx` compose a List page, while `apps/mobile/src/features/item/item-row.tsx`, `item-inline-form.tsx`, and the Item sheets own Item editing and presentation. Home's pager and toolbar stay with their route-owned screen composition under `apps/mobile/src/screens/app/`.

## Components

Use kebab-case filenames for new files. Prefer one named export per reusable component. When a component grows into several private pieces, turn it into a folder with an `index.tsx` root so import paths stay stable.

Use project language in component and prop names: `Household`, `Member`, `Owner`, `User`, `List`, `Item`, and `Invitation`. Do not introduce generic dashboard, team, group, todo, task, account, or invite-link language.

## Expo UI

Don't Forget is iOS-only, so `@expo/ui/swift-ui` is an acceptable direction for native-feeling controls.

Adopt Expo UI through app-owned wrappers or screen-level composition. Do not scatter raw SwiftUI primitives throughout reusable product code until the styling and behavior contract is clear.

When using Expo UI:

- Wrap SwiftUI subtrees in `Host` where required.
- Use Expo UI modifiers to style SwiftUI internals.
- Use Unistyles for React Native wrappers, layout, and app-owned tokens.
- Do not assume React Native styles inherit into SwiftUI controls.
- Prefer SF Symbol names only for iOS-specific surfaces.

The `expo/hot-chocolate` sample is useful for route-grouped tabs, group-specific stacks, `Host`, SwiftUI modifiers, and iOS-native toolbar/search patterns. It is not a template for domain naming or data architecture in Don't Forget.

## Styles

Colocate styles at the bottom of the component or screen file when they are only used there. Extract styles only when they are shared or when a file becomes hard to navigate.

Use Unistyles for app-owned React Native styling. Do not add NativeWind, Uniwind, or a second styling foundation.

## Tests And Stories

Do not place tests or stories in `apps/mobile/app/`; Expo Router treats files there as routes. Colocate tests next to the module they exercise outside that route tree, and keep reusable mobile Jest setup or mocks under `apps/mobile/src/test/`.

After adding, moving, or deleting stories, run `make storybook-generate`.

## API, Web, And Data Packages

The standalone Node API is composed statically in `apps/api/src/app.ts`. Hono routes delegate to HTTP handlers under `apps/api/src/<domain>/`, which call same-domain services. The `/api/data` handler keeps HTTP auth, payload, rate-limit, and response orchestration in `apps/api/src/data/`; the write applicator and Postgres transaction live in `packages/db/src/sync/` and are consumed through `@dont-forget/db`.

`apps/web/` is a separate TanStack/Vite surface for public Invitation and Household Join Code links. It is not a web build of `apps/mobile/`.

Postgres/Drizzle schema, migrations, fixtures, and operator/test utilities live in `packages/db/`. Cross-boundary contracts and helpers live in `packages/shared/`. On mobile, PowerSync's native module (`@powersync/op-sqlite`) is configured for Metro through the workspace's Metro and native Expo configuration.

## Platform Code

Do not add Android or mobile-web platform forks unless the mobile product target changes. If iOS-specific files are needed, prefer `.ios.tsx` over runtime platform branching for substantial implementations. Keep public web behavior in `apps/web/`.
