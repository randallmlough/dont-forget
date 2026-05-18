# Styling

## Styling Foundation

- **Must** use Unistyles for app-owned React Native styling.
- **Must** not add NativeWind, Uniwind, or a second app styling foundation.
- **Must** keep styles colocated at the bottom of the component or screen file when they are local to that file.
- **Should** extract styles only when they are shared or when a file becomes hard to navigate.

See also: [`docs/adr/0007-unistyles-styling-foundation.md`](../adr/0007-unistyles-styling-foundation.md).

## Tokens

- **Must** use theme tokens for colors, spacing, radii, typography, opacity, and border widths.
- **Must** define both primitive typography tokens and reusable typography roles.
- **Must** keep typography roles limited to typography metrics such as `fontSize` and `fontWeight`; color, alignment, decoration, and state styling stay in component styles.
- **Must** use generic UI role names for typography roles, such as `largeTitle`, `title`, `headline`, `body`, `callout`, `caption`, `captionStrong`, and `controlLabel`.
- **Should** use `theme.spacing(...)` for component dimensions that align to the app spacing scale.
- **Avoid** raw numeric visual constants in styles unless the value is a layout primitive that should not become a design token, such as `flex: 1`, `minWidth: 0`, or percentage strings.

## Inline Styles

- **Must** avoid inline object styles for app-owned UI.
- **Should** use style arrays for state variants such as pressed, disabled, checked, or error states.
- **Should** keep dynamic style objects out of list item render paths unless no tokenized alternative exists.

## Expo UI

- **Must** introduce `@expo/ui/swift-ui` controls through app-owned wrappers or screen-level composition.
- **Must** style SwiftUI internals with Expo UI modifiers, not by assuming React Native styles inherit into SwiftUI controls.
- **Should** use Unistyles for React Native wrappers, layout, and app-owned tokens around Expo UI controls.

See also: [`docs/best-practices/expo-app-structure.md`](../best-practices/expo-app-structure.md).
