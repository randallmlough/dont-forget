import AsyncStorage from "@react-native-async-storage/async-storage";

import {
	readAppearancePreference,
	writeAppearancePreference,
} from "./appearance-preference";

describe("appearance preference persistence", () => {
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
});
