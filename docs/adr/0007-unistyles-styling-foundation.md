# Unistyles as the app-owned styling foundation

Don't Forget uses Unistyles as the app-owned styling foundation and will migrate the existing React Native `StyleSheet` surfaces to Unistyles while the app is still small. We chose this over Uniwind plus React Native Reusables because the app is iOS-only, product-specific, and likely to use `@expo/ui/swift-ui`; Unistyles preserves the React Native `StyleSheet` mental model for app-owned tokens, themes, variants, and wrapper layout without adopting a Tailwind/shadcn component stack.
