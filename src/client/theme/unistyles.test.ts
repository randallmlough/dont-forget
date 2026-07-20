import { darkTheme, lightTheme } from "./unistyles";

describe("unistyles themes", () => {
	it("defines the Editorial Pantry light palette", () => {
		expect(lightTheme.colors).toEqual({
			background: "#F7F4EE",
			foreground: "#191B17",
			card: "#FFFFFF",
			cardForeground: "#191B17",
			primary: "#263A2A",
			primaryForeground: "#FFFFFF",
			secondary: "#EFEAE1",
			secondaryForeground: "#191B17",
			muted: "#EFEAE1",
			mutedForeground: "#686B63",
			subtleForeground: "#85867E",
			destructive: "#A23D36",
			destructiveForeground: "#FFFFFF",
			border: "#DDD6CA",
			input: "#C8C0B3",
			link: "#396A8E",
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
