export const INITIAL_HOUSEHOLD_NAMES = [
	"Blue Basket",
	"Golden Pantry",
	"Maple Cart",
	"Silver Spoon",
	"Fresh Market",
	"Sunrise Shelf",
	"Copper Kettle",
	"Garden Crate",
	"Juniper Pantry",
	"Harbor Basket",
	"Cedar Cart",
	"Bright Cupboard",
	"Clover Basket",
	"Orchard Shelf",
	"Pepper Pantry",
	"Willow Crate",
] as const;

export function generateInitialHouseholdName(): string {
	const index = Math.floor(Math.random() * INITIAL_HOUSEHOLD_NAMES.length);
	return INITIAL_HOUSEHOLD_NAMES[index];
}
