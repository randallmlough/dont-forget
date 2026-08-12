import AsyncStorage from "@react-native-async-storage/async-storage";
import { UnistylesRuntime } from "react-native-unistyles";

import {
	applyAppearancePreference,
	loadAndApplyAppearancePreference,
	readAppearancePreference,
	writeAppearancePreference,
} from "./appearance-preference";

describe("appearance preference persistence", () => {
	beforeEach(() => {
		jest
			.spyOn(UnistylesRuntime, "setAdaptiveThemes")
			.mockImplementation(() => undefined);
		jest
			.spyOn(UnistylesRuntime, "setTheme")
			.mockImplementation(() => undefined);
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("defaults to system when no preference is stored", async () => {
		jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce(null);

		await expect(readAppearancePreference()).resolves.toBe("system");
	});

	it("round-trips a stored preference", async () => {
		await writeAppearancePreference("dark");

		expect(AsyncStorage.setItem).toHaveBeenCalledWith(
			"appearance-preference",
			"dark",
		);
	});

	it("ignores invalid stored values", async () => {
		jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce("sepia");

		await expect(readAppearancePreference()).resolves.toBe("system");
	});

	it("applies system preference through adaptive themes", () => {
		applyAppearancePreference("system");

		expect(UnistylesRuntime.setAdaptiveThemes).toHaveBeenCalledWith(true);
		expect(UnistylesRuntime.setTheme).not.toHaveBeenCalled();
	});

	it("applies manual preferences through fixed themes", () => {
		applyAppearancePreference("dark");

		expect(UnistylesRuntime.setAdaptiveThemes).toHaveBeenCalledWith(false);
		expect(UnistylesRuntime.setTheme).toHaveBeenCalledWith("dark");
	});

	it("logs startup failures without applying a stale preference", async () => {
		const error = new Error("storage unavailable");
		const logger = { error: jest.fn() };
		jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(error);

		await loadAndApplyAppearancePreference({ logger });

		expect(logger.error).toHaveBeenCalledWith(
			"appearance preference startup failed",
			{ error },
		);
		expect(UnistylesRuntime.setAdaptiveThemes).not.toHaveBeenCalled();
		expect(UnistylesRuntime.setTheme).not.toHaveBeenCalled();
	});
});
