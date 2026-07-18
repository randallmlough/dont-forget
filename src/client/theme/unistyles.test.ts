import { darkTheme, lightTheme } from "./unistyles";

describe("unistyles themes", () => {
	it("defines the Editorial Pantry light palette", () => {
		expect(lightTheme.colors).toEqual({
			background: "#F7F4EE",
			authBackground: "#FFFFFF",
			surface: "#FFFFFF",
			text: "#191B17",
			textStrong: "#191B17",
			textMuted: "#686B63",
			textSubtle: "#85867E",
			border: "#DDD6CA",
			inputBorder: "#C8C0B3",
			authBorder: "#DDD6CA",
			divider: "#DDD6CA",
			primary: "#263A2A",
			primaryActionBackground: "#263A2A",
			primaryActionText: "#FFFFFF",
			primaryDisabled: "#C8C0B3",
			destructive: "#A23D36",
			link: "#396A8E",
			authPrimary: "#191B17",
			inverseText: "#FFFFFF",
			scrim: "rgba(16, 18, 15, 0.46)",
			glassTint: "rgba(255, 255, 255, 0.64)",
			glassTintSelected: "rgba(63, 93, 67, 0.22)",
			glassBorder: "rgba(255, 255, 255, 0.82)",
			appearanceLightBackground: "#F7F4EE",
			appearanceLightSurface: "#FFFFFF",
			appearanceDarkBackground: "#10120F",
			appearanceDarkSurface: "#22261F",
		});
	});

	it("keeps light and dark theme contracts aligned", () => {
		expect(themeKeyPaths(darkTheme)).toEqual(themeKeyPaths(lightTheme));
	});
});

function themeKeyPaths(value: unknown, prefix = ""): string[] {
	if (typeof value === "function") return [prefix];
	if (!value || typeof value !== "object") return [prefix];

	return Object.keys(value)
		.sort()
		.flatMap((key) =>
			themeKeyPaths(
				(value as Record<string, unknown>)[key],
				prefix ? `${prefix}.${key}` : key,
			),
		);
}
