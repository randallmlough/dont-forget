import { z } from "zod";

export const EXPO_PUSH_SEND_URL = "https://exp.host/--/api/v2/push/send";

export type PushMessage = {
	to: string;
	title: string;
	body: string;
	data?: Record<string, unknown>;
};

export type PushSendResult = {
	deadTokens: string[];
};

export type PushSenderDeps = {
	fetchFn?: typeof globalThis.fetch;
};

export class PushSendError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "PushSendError";
	}
}

const ticketSchema = z.discriminatedUnion("status", [
	z.object({ status: z.literal("ok"), id: z.string() }),
	z.object({
		status: z.literal("error"),
		message: z.string(),
		details: z.object({ error: z.string() }).partial().optional(),
	}),
]);

const responseSchema = z.object({
	data: z.array(ticketSchema),
});

export async function sendPushNotifications(
	messages: PushMessage[],
	deps: PushSenderDeps = {},
): Promise<PushSendResult> {
	if (messages.length === 0) return { deadTokens: [] };

	const fetchFn = deps.fetchFn ?? globalThis.fetch;
	const response = await fetchFn(EXPO_PUSH_SEND_URL, {
		method: "POST",
		headers: {
			Accept: "application/json",
			"Content-Type": "application/json",
		},
		body: JSON.stringify(messages),
	});
	const payload: unknown = await response.json().catch(() => null);
	if (!response.ok) {
		throw new PushSendError(`Expo push send failed with ${response.status}`);
	}

	const parsed = responseSchema.safeParse(payload);
	if (!parsed.success) {
		throw new PushSendError("Expo push send returned an invalid response");
	}
	if (parsed.data.data.length !== messages.length) {
		throw new PushSendError(
			"Expo push send returned an unexpected ticket count",
		);
	}

	const deadTokens = parsed.data.data.flatMap((ticket, index) => {
		if (
			ticket.status === "error" &&
			ticket.details?.error === "DeviceNotRegistered"
		) {
			return [messages[index].to];
		}
		return [];
	});

	return { deadTokens };
}
