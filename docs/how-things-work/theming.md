# Theming

Don't Forget uses Unistyles as the single app-owned styling foundation. Theme
data has two layers:

- `apps/mobile/src/theme/palette.ts` contains raw brand primitives. This is the only
  source file where app UI color literals should be introduced.
- `apps/mobile/src/theme/unistyles.ts` maps those primitives into semantic theme tokens
  consumed by components, screens, navigation chrome, and focused visual effects.

`apps/mobile/src/theme/theme-contract.ts` defines the complete `AppTheme` shape. The
light and dark themes both use `satisfies AppTheme`, and
`apps/mobile/src/theme/unistyles.test.ts` compares their deep key paths so a missing
nested token is caught before a component can render with an incomplete theme.

## Runtime Behavior

Unistyles is configured with both `light` and `dark` themes, plus
`initialTheme: "light"`. The app does not configure `adaptiveThemes` at startup
because Unistyles treats `initialTheme` and `adaptiveThemes` as mutually
exclusive, and this app stores the User's Appearance preference in AsyncStorage.
AsyncStorage is asynchronous, so it cannot feed Unistyles' synchronous
`initialTheme` setting.

At boot, `apps/mobile/app/_layout.tsx` reads the stored Appearance preference and applies it
through `apps/mobile/src/theme/appearance-preference.ts`:

- `system` calls `UnistylesRuntime.setAdaptiveThemes(true)`.
- `light` and `dark` call `setAdaptiveThemes(false)` and then
  `UnistylesRuntime.setTheme(...)`.

The accepted tradeoff is a brief light-theme default on cold start before
AsyncStorage resolves. Do not add MMKV just to avoid that flash. If the flash
becomes a real product issue, the narrow change is to add a synchronous storage
dependency and return its value from Unistyles' `initialTheme` function.

The root layout subscribes with `useUnistyles()`. It derives the Expo Router
navigation theme through `navigationThemeFor(theme, isDark)` and sets the
StatusBar style from the active theme. Settings uses the same runtime helper, so
Appearance changes apply immediately after they are persisted.

The authenticated app shell temporarily mounts a later `StatusBar` override
while its navigation drawer is open or dismissing. The override hides the iOS
system status bar until the drawer modal reports that native dismissal has
finished, then unmounts so the root layout's theme-owned style becomes active
again.

## Rebrand Checklist

1. Replace or rename primitives in `apps/mobile/src/theme/palette.ts`.
2. Review light and dark semantic mappings in `apps/mobile/src/theme/unistyles.ts`.
3. Run `pnpm --filter @dont-forget/mobile exec jest --runInBand --runTestsByPath ./src/theme/unistyles.test.ts` to confirm light-theme value stability and
   light/dark key parity.
4. Review build-time branding outside this system:
   - `app.json` name, slug, scheme, icon, and splash colors.
   - `app.config.ts` environment-derived app name, scheme, and bundle
     identifier.
   - iOS bundle identifier and asset files under `assets/`.
5. Leave `navigationThemeFor` alone unless the semantic theme contract changes;
   navigation chrome derives from the active app theme.
6. Run Storybook and review auth, Current List, add Item composer, Home, and
   Settings states in both light and dark themes.

## Guardrails

App-owned UI should use theme tokens, not direct color strings. The local ESLint
rule `dont-forget/no-raw-color-literals` reports raw hex, rgb/rgba, and hsl/hsla
strings in `apps/mobile/app/` and `apps/mobile/src/`. When a new color is needed,
add or reuse a palette primitive, map it into a semantic theme token, and consume
that token from the component.
