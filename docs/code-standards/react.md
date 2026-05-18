# React

## React Compiler

- **Must** treat React Compiler as the default rendering optimization layer.
- **Must** avoid reflexive `useMemo`, `useCallback`, and `memo` just to make references look stable.
- **Should** use manual memoization only for a concrete reason: measured expensive work, list row boundaries, context values whose identity is part of the API, or third-party/native APIs that require stable references.
- **Should** preserve deliberate existing memoization at list, provider, adapter, and logging boundaries unless a refactor proves it is unnecessary.

## State

- **Must** keep React state as the minimum ground truth needed to render and operate the UI.
- **Must** derive values during render when they can be computed from existing state or props.
- **Must** use functional state updates when the next value depends on the previous value.
- **Should** use refs for transient mutable values that should not trigger renders.
- **Avoid** mirroring props, derived booleans, counts, or filtered arrays into state unless there is a real persistence or interaction boundary.

## Effects

- **Must** keep user interaction logic in event handlers instead of routing it through effects.
- **Must** keep effect dependency arrays honest. Suppress dependency lint only when the effect intentionally uses a trigger token or another pattern the linter cannot express, and include a short reason.
- **Should** split effects with unrelated dependencies into separate effects.
- **Should** use `useEffectEvent` for stable callback refs when an effect needs the latest callback without resubscribing.

## Responsiveness

- **Should** use `startTransition` for non-urgent state updates that should not block immediate input feedback.
- **Should** use `useDeferredValue` when expensive derived rendering should lag behind fast-changing input.
- **Avoid** adding transitions or deferred values to simple updates where they add complexity without protecting responsiveness.

## Composition

- **Should** use domain-shaped context values with `{ state, actions, meta }` for composed feature surfaces that share meaningful state.
- **Should** keep side effects at route, screen, or container boundaries.
- **Avoid** adding providers just to avoid passing one or two explicit props.

See also: [`docs/best-practices/react-composition-pattern.md`](../best-practices/react-composition-pattern.md).

## Async Work

- **Must** avoid avoidable waterfalls. Start independent async work in parallel and await it as late as practical.
- **Must** check cheap synchronous guards before starting expensive async work when the async result is only needed inside the guarded branch.
- **Should** prefer `Promise.all` for independent operations.
- **Should** start dependent follow-up work as early as its dependency is available instead of waiting for unrelated work to finish.
