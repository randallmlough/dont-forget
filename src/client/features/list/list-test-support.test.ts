import type { ActiveListItem } from "@/client/features/item/item-view-types";
import {
	addFixtureItem,
	largeActiveListState,
	populatedActiveListState,
	setFixtureItemChecked,
} from "./list-test-support";

describe("List test support", () => {
	it.each([
		["populated", populatedActiveListState.items],
		["large", largeActiveListState.items],
	])("groups unchecked Items before checked Items in the %s fixture", (_name, items) => {
		expectUncheckedItemsFirst(items);
	});

	it("moves a newly checked Item after every unchecked Item", () => {
		const updated = setFixtureItemChecked(
			populatedActiveListState,
			"item-1",
			true,
		);

		expect(updated.items.map((item) => item.id)).toEqual([
			"item-3",
			"item-1",
			"item-2",
		]);
		expectUncheckedItemsFirst(updated.items);
	});

	it("moves a newly unchecked Item before every remaining checked Item", () => {
		const updated = setFixtureItemChecked(
			largeActiveListState,
			"large-item-1",
			false,
		);
		const firstCheckedIndex = updated.items.findIndex((item) => item.checked);

		expect(updated.items[firstCheckedIndex - 1]?.id).toBe("large-item-1");
		expect(updated.items[firstCheckedIndex]?.id).toBe("large-item-2");
		expectUncheckedItemsFirst(updated.items);
	});

	it("places a newly added unchecked Item before checked Items", () => {
		const updated = addFixtureItem(populatedActiveListState, {
			name: "Bread",
			quantity: null,
			notes: null,
		});

		expect(updated.items.map((item) => item.id)).toEqual([
			"item-1",
			"item-3",
			"story-item-4",
			"item-2",
		]);
		expectUncheckedItemsFirst(updated.items);
	});

	it("does not mutate the original fixture", () => {
		const originalItems = populatedActiveListState.items;
		const originalChecked = originalItems.map((item) => item.checked);

		const updated = setFixtureItemChecked(
			populatedActiveListState,
			"item-1",
			true,
		);

		expect(updated).not.toBe(populatedActiveListState);
		expect(updated.items).not.toBe(originalItems);
		expect(populatedActiveListState.items).toBe(originalItems);
		expect(originalItems.map((item) => item.checked)).toEqual(originalChecked);
	});
});

function expectUncheckedItemsFirst(items: readonly ActiveListItem[]): void {
	const firstCheckedIndex = items.findIndex((item) => item.checked);

	expect(firstCheckedIndex).toBeGreaterThanOrEqual(0);
	expect(items.slice(firstCheckedIndex).every((item) => item.checked)).toBe(
		true,
	);
}
