import { UnistylesRuntime } from "react-native-unistyles";

// Native views (SwiftUI hosts, glass surfaces, alerts) don't follow the
// Unistyles theme, which the user can pin independently of the system
// appearance, so they need the resolved scheme passed explicitly.
export function nativeColorScheme(
	themeName: string | undefined = UnistylesRuntime.themeName,
): "light" | "dark" {
	return themeName === "dark" ? "dark" : "light";
}
