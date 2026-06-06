import { format, isSameDay, isSameYear, subDays } from "date-fns";

export function formatRelativeDateLabel(
	timestampMs: number,
	nowMs: number = Date.now(),
): string {
	const timestamp = epochMillisecondsDate(timestampMs, "timestampMs");
	const now = epochMillisecondsDate(nowMs, "nowMs");

	if (isSameDay(timestamp, now)) {
		return "today";
	}

	if (isSameDay(timestamp, subDays(now, 1))) {
		return "yesterday";
	}

	if (isSameYear(timestamp, now)) {
		return format(timestamp, "MMM d");
	}

	return format(timestamp, "MMM d, yyyy");
}

function epochMillisecondsDate(value: number, name: string): Date {
	if (typeof value !== "number" || !Number.isInteger(value)) {
		throw new Error(`${name} must be an epoch millisecond integer`);
	}

	const date = new Date(value);
	if (!Number.isFinite(value) || Number.isNaN(date.getTime())) {
		throw new Error(`${name} must be a valid epoch millisecond timestamp`);
	}

	return date;
}
