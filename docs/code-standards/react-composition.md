# React Composition Pattern

Prefer composition for stateful React Native surfaces that have multiple related UI pieces sharing the same state and actions.

Use this pattern when a screen or feature would otherwise pass many props through a top-level component just so child controls can read state or fire events. Do not use it for simple standalone components that are already clear with direct props.

## Shape

Organize feature context into three sections:

```ts
type FeatureContextValue = {
  state: FeatureState;
  actions: FeatureActions;
  meta: FeatureMeta;
};
```

- `state`: reactive data that affects rendering.
- `actions`: functions that change state or request feature operations.
- `meta`: stable configuration, refs, permissions, and other non-reactive facts.

Keep the context domain-shaped. For example, an active List provider should expose List state and List actions, not a raw database client or generic storage API.

## Compound Exports

For composed feature surfaces, export a namespace object:

```tsx
<ActiveList.Provider>
  <ActiveList.Header />
  <ActiveList.Items />
  <ActiveList.AddItemForm />
</ActiveList.Provider>
```

This keeps related pieces discoverable and lets screens arrange them without prop drilling.

Only use compound exports where the pieces share a meaningful provider. Components like `AuthScreen` should stay as normal named exports unless they grow shared state.

## Feature Surface Decomposition

When a reusable feature surface has shared state/actions and multiple distinct UI regions, decompose it by ownership instead of keeping one large component file.

- **Must** keep the feature state machine, async coordination, logging, and service-adapter callbacks in a single provider or container boundary.
- **Must** expose shared feature context as `{ state, actions, meta }`.
- **Must** keep child components focused on one UI role, such as `Header`, `Items`, `ItemRow`, `AddItemForm`, or `Screen`.
- **Must** keep child components free of route, auth, database, service, sync-lifecycle, and analytics ownership unless that child is explicitly the owner of that boundary.
- **Should** use a compound namespace export when the pieces require the same provider, such as `ActiveList.Provider`, `ActiveList.Header`, `ActiveList.Items`, and `ActiveList.AddItemForm`.
- **Should** keep the public import path stable through the feature folder `index.ts`.
- **Should** keep each decomposed child component's private styles in that component file, close to the JSX that uses them.
- **Avoid** extracting tiny one-off JSX solely to reduce line count.
- **Avoid** creating a provider or compound namespace for simple standalone components that are already clear with explicit props.
- **Avoid** splitting the state machine across child components just because the render tree was split.
- **Avoid** creating feature-level style registries that force child components to depend on unrelated style names.

A decomposition is successful when the provider still tells the complete state/action story, and each child component can be understood as one named piece of the user interface.

## Containers

Keep app side effects at the route or container boundary:

- auth and session behavior
- analytics and diagnostic logging
- database reads and writes
- navigation side effects
- network calls

Providers may adapt those dependencies behind domain-shaped actions, but presentational children should not import Clerk, PostHog, Turso, Drizzle, or Expo Router just to render a feature surface.

## Storybook

Storybook should compose the same feature pieces with local state providers and fixture data. This makes stories useful before live database wiring exists and keeps UI review deterministic.

## Naming

Use project language in provider names and actions. Prefer `ActiveList`, `Household`, `Member`, `Item`, and `Invitation` over generic names like group, team, todo, task, or invite link.

## When Not To Use It

Do not introduce a provider just to avoid passing one or two explicit props. Do not create app-wide provider namespaces for unrelated behavior. Do not let a provider become a service locator for arbitrary feature code.
