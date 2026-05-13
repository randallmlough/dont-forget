# iOS-only app target

Don't Forget targets iOS only: local development runs on the iOS simulator, and distribution goes through TestFlight and the App Store. We explicitly do not support Android or Web because the product is early, iOS-native quality matters more than cross-platform reach, and `@expo/ui/swift-ui` plus an iOS-focused styling foundation let us move faster without preserving Android/Web compatibility paths.
