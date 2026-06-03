export const MANUAL_HOUSEHOLD_JOIN_CODE_SOURCE = "manual_code";
export const JOIN_LINK_HOUSEHOLD_JOIN_CODE_SOURCE = "join_link";

export const HOUSEHOLD_JOIN_CODE_SOURCES = [
	MANUAL_HOUSEHOLD_JOIN_CODE_SOURCE,
	JOIN_LINK_HOUSEHOLD_JOIN_CODE_SOURCE,
] as const;

export type HouseholdJoinCodeSource =
	(typeof HOUSEHOLD_JOIN_CODE_SOURCES)[number];

export function isHouseholdJoinCodeSource(
	value: unknown,
): value is HouseholdJoinCodeSource {
	return (
		typeof value === "string" &&
		HOUSEHOLD_JOIN_CODE_SOURCES.includes(value as HouseholdJoinCodeSource)
	);
}
