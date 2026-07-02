import { darkTheme, lightTheme } from "./unistyles";

describe("unistyles themes", () => {
	it("keeps light theme color values stable", () => {
		expect(lightTheme.colors).toEqual({
			background: "#F8FAFC",
			authBackground: "#FFFFFF",
			surface: "#FFFFFF",
			text: "#102A43",
			textStrong: "#1F1F1F",
			textMuted: "#627D98",
			textSubtle: "#829AB1",
			border: "#D9E2EC",
			inputBorder: "#BCCCDC",
			authBorder: "#DADCE0",
			divider: "#C0C0C0",
			primary: "#2F855A",
			primaryDisabled: "#9FB3C8",
			destructive: "#E53E3E",
			link: "#1A73E8",
			authPrimary: "#1F1F1F",
			inverseText: "#FFFFFF",
		});
	});

	it("keeps existing add Item composer effects stable in light mode", () => {
		expect(lightTheme.effects.addItemComposer).toEqual({
			entryBackground: "rgba(255, 255, 255, 0.86)",
			entryBorder: "rgba(130, 154, 177, 0.38)",
			trayBackground: "rgba(255, 255, 255, 0.78)",
			trayBorder: "rgba(130, 154, 177, 0.4)",
			inputBackground: "rgba(255, 255, 255, 0.74)",
			inputBorder: "rgba(130, 154, 177, 0.36)",
			fieldBackground: "rgba(255, 255, 255, 0.58)",
			pillBackground: "rgba(255, 255, 255, 0.62)",
			pillBorder: "rgba(130, 154, 177, 0.34)",
			selectedPillBackground: "rgba(47, 133, 90, 0.12)",
			selectedPillBorder: "rgba(47, 133, 90, 0.28)",
			entryShadow: "0 6px 18px rgba(16, 42, 67, 0.12)",
			trayShadow: "0 8px 28px rgba(16, 42, 67, 0.18)",
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
