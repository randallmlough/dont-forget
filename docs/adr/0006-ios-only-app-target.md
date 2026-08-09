# iOS-only app target

_Amended 2026-08-09: “no Web product client” does not prohibit the separate, narrow public-link adapter under `apps/web/`._

The Don't Forget product client targets iOS only: local mobile development runs on the iOS Simulator, and distribution goes through TestFlight and the App Store. We explicitly do not support Android or a browser-based product client because the product is early, iOS-native quality matters more than cross-platform reach, and `@expo/ui/swift-ui` plus an iOS-focused styling foundation let us move faster without preserving Android or mobile-Web compatibility paths.

`apps/web/` is not a second product client. It is a separately built public adapter limited to Invitation and Household Join Code entry links, which hand off into the installed iOS app. It does not add browser access to authenticated Lists, Items, Household management, or the rest of the product.
