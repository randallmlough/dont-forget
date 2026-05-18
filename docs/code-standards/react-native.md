# React Native

## Rendering

- **Must** render text inside React Native `Text` components; never put raw strings directly under `View` or other non-text primitives.
- **Must** avoid leaked falsy rendering in JSX. Use `condition ? <Component /> : null`, explicit boolean coercion, or early returns instead of `{value && <Component />}` when `value` can be `0`, `""`, or another renderable falsy value.
- **Should** prefer early returns when a component has no meaningful UI for a state.

## Lists

- **Must** use a virtualized list for unbounded product collections such as Items, Members, Invitations, or future Household/List pickers.
- **Must** not use `ScrollView` for unbounded collections.
- **Must** use realistic fixture sizes for list stories and tests when changing list rendering, row layout, empty states, or interactions.
- **Must** include edge-case row content when list behavior changes, such as long Item names, checked and unchecked state, missing optional metadata, and enough rows to scroll.
- **Should** keep `FlatList` acceptable for simple collections below the large-list threshold.
- **Must** use FlashList or another explicitly chosen high-performance virtualizer for large lists.
- **Must** treat a list as large when realistic or p95 usage reaches 100+ rows, or when rows are image-heavy, heterogeneous, animated, frequently updating, or otherwise expensive to render.
- **Should** keep list items lightweight and move expensive derivation out of item render paths.
- **Should** pass primitive props or stable object references to memoized list rows.
- **Should** hoist `keyExtractor`, `renderItem`, separators, and empty states out of render when practical.
- **Should** include a large-list story or fixture at the 100+ row threshold for reusable unbounded list components.
- **Should** validate keyboard and add-item behavior on device or simulator when list input sits near the bottom safe area.
- **Avoid** approving list UI changes based only on two or three ideal rows.

## Interaction And Native UI

- **Must** design screens for one-handed mobile use, keyboard behavior, safe areas, dynamic text, and touch interaction first.
- **Must** prefer native-feeling navigation, menus, modals, inputs, and feedback patterns over web-style replacements.
- **Must** give every interactive control an appropriate `accessibilityRole`.
- **Must** give stateful controls an `accessibilityState`.
- **Must** provide an `accessibilityLabel` when visible text is not enough for assistive technology.
- **Must** define the accessibility role, label, state, hint when needed, and disabled semantics for every reusable interactive component.
- **Must** make custom controls behave like the native control they visually replace. For example, a custom checkbox must expose checkbox semantics and checked state.
- **Must** ensure list row actions are understandable without relying on visual layout.
- **Should** keep touch targets at least 44x44 points unless a surrounding native control provides the target.
- **Should** verify changed interactive UI with RocketSim accessibility output when practical.
- **Must** use `Pressable` instead of deprecated touchable components for standard press interactions.
- **Should** use app-owned wrappers when adopting native or Expo UI controls so implementation details do not leak across feature code.
- **Should** use native iOS-feeling controls where they improve product quality, introduced through app-owned wrappers or screen-level composition.
- **Should** use native menus and native modals when they fit the interaction better than JavaScript-only popovers or sheets.
- **Should** use `onLayout` for view measurement instead of imperative `measure()` calls.
- **Should** keep layouts purposeful and domain-specific instead of defaulting to generic dashboard, card, or feed structures.
- **Avoid** generic accessibility labels like "button," "icon," or "row," and labels that expose implementation terms instead of user intent.
- **Avoid** hover-only affordances, tiny inline actions, web-style dense forms, nested layout wrappers with no semantic or layout purpose, and `ScrollView` as a default page template.

## Images

- **Must** use `expo-image` for app-rendered images unless a native/library component owns image rendering.
- **Should** avoid uncompressed or oversized images in list rows.

## Safe Areas And Scrolling

- **Must** handle iOS safe areas explicitly for full-screen surfaces.
- **Should** use `contentInset` and `contentInsetAdjustmentBehavior` for ScrollView/list spacing that needs to cooperate with native headers, keyboards, or safe areas.

## Animation

- **Must** animate `transform` and `opacity` by default; avoid animating layout properties unless the interaction specifically requires layout animation.
- **Should** keep animated calculations on Reanimated shared/derived values rather than routing high-frequency animation state through React state.
