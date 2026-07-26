# Expo App Structure

This project follows Expo Router's file-based routing model, with a few local exceptions chosen for Don't Forget's current shape.

Sources reviewed:

- Expo blog: [How to organize Expo app folder structure for clarity and scalability](https://expo.dev/blog/expo-app-folder-structure-best-practices)
- Expo Router docs: [Parentheses route groups](https://docs.expo.dev/router/basics/notation/#parentheses)
- Expo sample: [expo/hot-chocolate app](https://github.com/expo/hot-chocolate/tree/main/app)

## Current Decision

Keep application code under `src/`:

```text
src/app/
src/client/features/
src/client/screens/
src/client/lib/
src/client/session/
src/client/theme/
src/client/ui/
src/server/bootstrap/
src/server/data/
src/server/db/
src/server/households/
src/server/invitations/
src/server/sync/
src/server/users/
src/shared/
src/test/
tooling/
docs/
```

Expo Router still owns the route tree under `src/app/`. Product code is split into client feature folders, server domain modules, shared cross-boundary helpers, and repo tooling.

## Route Groups

Use Expo Router route groups to organize routes without changing URLs:

```text
src/app/
  _layout.tsx
  (app)/
    _layout.tsx
    index.tsx       # /
  (auth)/
    _layout.tsx
    sign-in.tsx     # /sign-in
    sign-up.tsx     # /sign-up
```

Route groups are implementation structure only. The group names do not appear in URLs, so `src/app/(auth)/sign-in.tsx` remains `/sign-in`.

Use `(app)` for authenticated app routes and `(auth)` for signed-out auth routes. Add more groups only when a set of routes needs shared navigation, providers, or clear separation.

## Routes And Screens

Keep `src/app/` files thin. A route file should usually export the screen it owns:

```tsx
export { default } from "@/client/screens/app/home-screen";
```

Put route-owned screens and screen-local side effects in `src/client/screens/`, organized by route ownership. Keep feature UI, data hooks, and services in `src/client/features/<feature>/`. This includes keeping List and Item services with the List feature even when a screen consumes them.

Put reusable primitives in `src/client/ui/`. Feature-owned UI stays with the owning feature folder, for example `src/client/features/list/list-page.tsx`, `list-overview.tsx`, `item-rows.tsx`, and `add-item-form.tsx`. Home's pager and toolbar stay with their route-owned screen composition under `src/client/screens/app/`.

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

Do not place tests or stories in `src/app/`; Expo Router treats files there as routes. Colocate tests next to the module they exercise outside `src/app/`, and keep reusable Jest setup or mocks under `src/test/`.

After adding, moving, or deleting stories, run `make storybook-generate`.

## Server Code

Expo API Routes live under `src/app/api` to avoid collisions with app screens. Keep route modules thin and lazy-load server-only handlers inside request handlers, because native Expo Router route registration can evaluate API modules in the iOS bundle. Server handlers and services live under `src/server/`, with Postgres and Drizzle infrastructure under `src/server/db/`. On the client, PowerSync's native module (`@powersync/op-sqlite`) is configured for Metro — a Metro inline-requires block-list, `node-linker=hoisted` in `.npmrc`, and the op-sqlite native config.

## Platform Code

Do not add Android or Web platform forks unless the product target changes. If iOS-specific files are needed, prefer `.ios.tsx` over runtime platform branching for substantial implementations.
