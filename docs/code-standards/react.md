# React

## React Compiler

- **Must** treat React Compiler as the default rendering optimization layer.
- **Must** treat React Compiler cleanup diagnostics as a prompt to simplify ownership first.
- **Must** avoid reflexive `useMemo`, `useCallback`, and `memo` just to make references look stable.
- **Should** use manual memoization only for a concrete reason: measured expensive work, list row boundaries, context values whose identity is part of the API, or third-party/native APIs that require stable references.
- **Should** preserve deliberate existing memoization at list, provider, adapter, and logging boundaries unless a refactor proves it is unnecessary.
- **Avoid** mechanically deleting `useMemo`, `useCallback`, or `memo` when the real issue is oversized component ownership, unclear state ownership, or lifecycle coupling.

## State

- **Must** keep React state as the minimum ground truth needed to render and operate the UI.
- **Must** derive values during render when they can be computed from existing state or props.
- **Must** derive counts, labels, filtered or sorted arrays, selected objects from selected IDs, empty/loading/disabled booleans, accessibility labels, and JSX fragments during render when they come from current props or state.
- **Must** store the smallest stable source of truth. For example, store `selectedItemId` instead of copying the selected `Item` into state when the current `Item` can be found from render data.
- **Must** use functional state updates when the next value depends on the previous value.
- **Must** use a reducer or explicit state transition helper when a component has multiple related state fields whose updates must stay consistent.
- **Must** encode invalid states out of the model with discriminated unions where practical.
- **Should** move unrelated state down into child components before adding memoization to protect parent renders.
- **Should** use refs for transient mutable values that should not trigger renders.
- **Should** use `useMemo` only for measured or credible expensive pure derivation, list row boundaries, context values whose identity is part of the API, or third-party/native APIs that require stable references.
- **Should** keep reducers pure and test them directly when they encode meaningful product behavior.
- **Should** name state transition actions by domain or user intent, such as `itemAddedOptimistically`, `refreshFailed`, or `invitationAccepted`, not setter mechanics.
- **Should** prefer past-tense reducer transition names for completed events or observed outcomes, such as `itemAddedOptimistically`, `refreshFailed`, or `invitationAccepted`.
- **Should** use imperative names for command functions called by UI, such as `addItem`, `refresh`, or `acceptInvitation`.
- **Avoid** mirroring props, derived booleans, counts, or filtered arrays into state unless there is a real persistence or interaction boundary.
- **Avoid** `useState` plus `useEffect` pairs where the effect only recalculates a value from other React state.
- **Avoid** scattered `setState` calls across async branches when they represent one logical transition.
- **Avoid** reducers for simple independent booleans or text inputs.
- **Avoid** reducer transitions like `setLoading`, `setError`, `updateData`, or `handleSuccess` when a domain outcome is known.

## Effects

- **Must** treat effects as synchronization escape hatches, not as the default way to coordinate React state.
- **Must** use effects only for synchronizing with external systems or lifecycle-bound resources, such as navigation redirects, analytics identity or screen tracking, native/browser SDK warmup, subscriptions, timers, imperative native APIs, or data fetching tied to the currently visible screen state.
- **Must** prefer route-owned data hooks or route-owned containers over raw screen-level data fetching effects. Screens should primarily render explicit state and call explicit actions; the hook or container should own lifecycle, async synchronization, and cleanup.
- **Must** guard async effects against stale responses and updates after unmount.
- **Must** clean up resources acquired by an effect, such as adapters, subscriptions, timers, SDK handles, or native resources.
- **Must** keep user interaction logic in event handlers instead of routing it through effects.
- **Must** derive render data during render instead of mirroring props, state, filtered arrays, counts, labels, booleans, or JSX into state from an effect.
- **Must** avoid effect chains where one effect updates state primarily to trigger another effect.
- **Must** notify parent components from the event or state transition that caused the change instead of reporting local state changes upward from an effect when practical.
- **Must** keep effect dependency arrays honest. Suppress dependency lint only when the effect intentionally uses a trigger token or another pattern the linter cannot express, and include a short reason.
- **Must** avoid effect dependency suppressions by restructuring code first.
- **Must** include the reason, the intentionally omitted dependency, and the freshness or retrigger mechanism when suppressing effect dependencies.
- **Must** keep dependency suppressions as narrow as possible on the specific line and lint rule.
- **Must** explain effects that update local React state from async work, refs, or props unless the synchronization boundary is self-evident from the surrounding API names.
- **Must** explain effect patterns that are easy to misuse, including trigger tokens, stale response guards, ref handoffs, SDK lifecycle cleanup, and dependency suppression.
- **Must** know whether an external subscription emits the current snapshot on subscribe. If it does not, subscribe first and then sample the current snapshot.
- **Must** test subscription and snapshot ordering when a missed event can leave visible UI stale.
- **Should** split effects with unrelated dependencies into separate effects.
- **Should** reset component state with a `key`, by deriving from current props/state, or by moving state to the right owner before adding a reset effect.
- **Should** use `useEffectEvent` for stable callback refs when an effect needs the latest callback without resubscribing.
- **Should** use `useSyncExternalStore` for pure external snapshots, and keep explicit subscription handling when event ordering drives product behavior.
- **Should** prefer `useEffectEvent`, a route-owned hook, or a reducer/action model before using refs to dodge dependency churn.
- **Should** leave obvious external synchronization effects uncommented when function names and dependencies make the purpose clear.
- **Should** keep each route-owned data hook or container focused on one synchronization responsibility and expose a testable state/actions API.
- **Avoid** app initialization effects that assume they run exactly once; make initialization remount-safe or move true once-per-app-load work to module or entrypoint initialization.
- **Avoid** adding raw async data fetching effects directly to screens when a named hook or container can make the lifecycle testable.
- **Avoid** adding multiple independent data fetching effects to the same screen; consolidate them into one route-owned loading model or split them into named hooks with explicit responsibilities.
- **Avoid** comments that merely restate `useEffect` mechanics.
- **Avoid** dependency suppression comments that say only "intentional," "safe," or "needed."

## Responsiveness

- **Should** use `startTransition` for non-urgent state updates that should not block immediate input feedback.
- **Should** use `useDeferredValue` when expensive derived rendering should lag behind fast-changing input.
- **Avoid** adding transitions or deferred values to simple updates where they add complexity without protecting responsiveness.

## Composition

- **Must** separate data and lifecycle ownership from presentational rendering when a surface has async loading, retries, auth/session dependencies, or resource cleanup.
- **Must** keep route files as route wiring only.
- **Must** define explicit prop types for reusable app components.
- **Must** keep event prop names semantic when the component owns domain intent, such as `onToggleItem`, `onSubmitName`, or `onRetry`, instead of generic `onPress`.
- **Must** decompose large stateful feature surfaces by responsibility: one owner for state/actions, role-named child components for rendering, and a stable compound export only when the pieces share a meaningful provider.
- **Should** use domain-shaped context values with `{ state, actions, meta }` for composed feature surfaces that share meaningful state.
- **Should** use a `Screen`/`ScreenView` split for testability when a route has non-trivial state or side effects.
- **Should** extract child components when they own independent local state, repeat a domain UI pattern, represent a list row or card, or have a distinct accessibility contract.
- **Should** keep side effects at route, screen, or container boundaries.
- **Should** expose native props selectively only when callers genuinely need native behavior.
- **Should** name render props and children APIs around the domain role they fill.
- **Avoid** adding providers just to avoid passing one or two explicit props.
- **Avoid** `...props` pass-through on app-owned components unless the accepted prop surface is intentionally documented and typed.
- **Avoid** extending broad native prop types like `ViewProps` or `PressableProps` just to avoid choosing a component API.
- **Avoid** extracting tiny one-off JSX solely to reduce line count.
- **Avoid** large components that mix fetching, mutation, styling, list rendering, analytics, and multiple local UI state machines.

## Custom Hooks

- **Must** name hooks by the behavior they own, such as `useHomeBootstrap` or `useActiveListState`, not vague names like `useData` when the domain is known.
- **Must** return explicit objects rather than positional tuples unless matching a React or native convention.
- **Must** model route-owned async resources as discriminated states such as `loading`, `ready`, `error`, and `empty`, not scattered booleans, nullable data, and retry counters.
- **Must** key route-owned async resource state by the resource identity it represents, such as authenticated app session resource key plus List ID, so stale loads cannot publish into the current view.
- **Should** return `{ state, actions, meta }` when the hook owns a feature surface or interaction model.
- **Should** expose route-owned resource hooks as explicit objects, such as `{ state, retry }` or `{ state, actions, meta }`.
- **Should** expose command-like actions that match user or domain intent, not raw setters.
- **Should** use a reducer or transition helper when load, retry, success, and failure paths all update the same resource lifecycle.
- **Avoid** returning raw setters from reusable hooks unless the hook is a tiny local state primitive.
- **Avoid** scattered `setState` calls across load, retry, success, and failure paths when they represent one route-owned resource lifecycle.
- **Avoid** hiding unrelated responsibilities in one hook just to reduce component code.

See also: [`docs/code-standards/react-composition.md`](./react-composition.md).

## Async Work

- **Must** avoid avoidable waterfalls. Start independent async work in parallel and await it as late as practical.
- **Must** prove async work is independent before parallelizing it.
- **Must** check cheap synchronous guards before starting expensive async work when the async result is only needed inside the guarded branch.
- **Must** handle async errors at the boundary where the user, retry model, logger, or caller can do something useful.
- **Must** show user-facing recovery copy for failed user actions or screen loads unless the failure is intentionally silent and documented.
- **Should** prefer `Promise.all` for independent operations.
- **Should** start dependent follow-up work as early as its dependency is available instead of waiting for unrelated work to finish.
- **Should** parallelize narrow independent reads after required mutations and setup steps complete.
- **Should** preserve the previous usable UI state when a mutation fails and refresh only when needed to restore correctness.
- **Should** keep best-effort cleanup failures silent only when they cannot affect user-visible correctness.
- **Avoid** parallelizing migrations, reset flows, pull/push/pull sync, cleanup loops, or retry/order-sensitive workflows unless the ordering contract is explicitly redesigned.
- **Avoid** empty `catch {}` blocks except for documented best-effort cleanup or test setup.
- **Avoid** catch-all "Something went wrong" copy when a domain-specific message is possible.
