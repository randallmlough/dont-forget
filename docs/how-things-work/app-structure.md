# Expo App Structure

This project follows Expo Router's file-based routing model, with a few local exceptions chosen for Don't Forget's current shape.

Sources reviewed:

- Expo blog: [How to organize Expo app folder structure for clarity and scalability](https://expo.dev/blog/expo-app-folder-structure-best-practices)
- Expo Router docs: [Parentheses route groups](https://docs.expo.dev/router/basics/notation/#parentheses)
- Expo sample: [expo/hot-chocolate app](https://github.com/expo/hot-chocolate/tree/main/app)

## Current Decision

Keep source folders at the repository root for now:

```text
app/
screens/
components/
lib/
db/
docs/
```

Expo's general guidance recommends `/src` for larger projects because it separates application code from config. Don't Forget is intentionally not moving to `/src` yet because the app already has root aliases, Jest coverage paths, Storybook generation, Unistyles setup, database tooling, and agent guidance anchored to root-level folders. Revisit `/src` only if root-level source folders become difficult to navigate.

## Route Groups

Use Expo Router route groups to organize routes without changing URLs:

```text
app/
  _layout.tsx
  (app)/
    _layout.tsx
    index.tsx       # /
  (auth)/
    _layout.tsx
    sign-in.tsx     # /sign-in
    sign-up.tsx     # /sign-up
```

Route groups are implementation structure only. The group names do not appear in URLs, so `app/(auth)/sign-in.tsx` remains `/sign-in`.

Use `(app)` for authenticated app routes and `(auth)` for signed-out auth routes. Add more groups only when a set of routes needs shared navigation, providers, or clear separation.

## Routes And Screens

Keep `app/` files thin. A route file should usually export the screen it owns:

```tsx
export { default } from "@/screens/home/home-screen";
```

Put route-owned UI and screen-local side effects in `screens/<surface>/`. This includes hooks that are specific to that screen, such as Clerk session hooks or screen-only analytics handlers.

Put reusable feature UI in `components/`. A component belongs in `components/` when multiple screens could use it or when it is a domain feature surface with its own provider, such as `components/active-list`.

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

Do not place tests or stories in `app/`; Expo Router treats files there as routes. Colocate tests next to the module they exercise outside `app/`, and keep reusable Jest setup or mocks under `lib/test`.

After adding, moving, or deleting stories, run `make storybook-generate`.

## Server Code

When Expo API Routes are added, put them under `app/api` to avoid collisions with app screens. Keep route modules thin and lazy-load server-only helpers inside request handlers, because native Expo Router route registration can evaluate `app/api` modules in the iOS bundle. Put shared server-only helpers in a clearly server-owned folder and keep secrets out of client code. Expo's Metro config maps the default `@libsql/client` import to `@libsql/client/http` so Drizzle's libSQL driver does not pull the native Node `libsql` package into API-route bundles; app-owned remote clients should import the HTTP or Web subpath explicitly. The existing `db/` folder stays at the root because it is shared by schema generation, Drizzle config, migrations, tests, and API routes.

## Platform Code

Do not add Android or Web platform forks unless the product target changes. If iOS-specific files are needed, prefer `.ios.tsx` over runtime platform branching for substantial implementations.
