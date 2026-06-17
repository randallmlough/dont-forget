import { z } from "zod";

export const EXPO_PUSH_SEND_URL = "https://exp.host/--/api/v2/push/send";
export const EXPO_PUSH_RECEIPTS_URL =
	"https://exp.host/--/api/v2/push/getReceipts";

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
	receiptRetryDelaysMs?: number[];
	sleep?: (delayMs: number) => Promise<void>;
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

const receiptSchema = z.discriminatedUnion("status", [
	z.object({ status: z.literal("ok") }),
	z.object({
		status: z.literal("error"),
		message: z.string(),
		details: z.object({ error: z.string() }).partial().optional(),
	}),
]);

const receiptResponseSchema = z.object({
	data: z.record(z.string(), receiptSchema),
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

	const deadTokens: string[] = [];
	const acceptedTickets: { id: string; expoPushToken: string }[] = [];
	for (const [index, ticket] of parsed.data.data.entries()) {
		if (ticket.status === "ok") {
			acceptedTickets.push({
				id: ticket.id,
				expoPushToken: messages[index].to,
			});
			continue;
		}
		if (ticket.details?.error === "DeviceNotRegistered") {
			deadTokens.push(messages[index].to);
			continue;
		}
		throw new PushSendError(`Expo push send failed: ${ticket.message}`);
	}
	deadTokens.push(
		...(await fetchDeadReceiptTokens(acceptedTickets, {
			fetchFn,
			retryDelaysMs: deps.receiptRetryDelaysMs ?? [1_000, 2_000],
			sleep: deps.sleep ?? sleep,
		})),
	);

	return { deadTokens };
}

async function fetchDeadReceiptTokens(
	tickets: { id: string; expoPushToken: string }[],
	deps: {
		fetchFn: typeof globalThis.fetch;
		retryDelaysMs: number[];
		sleep: (delayMs: number) => Promise<void>;
	},
): Promise<string[]> {
	if (tickets.length === 0) return [];

	let pendingTickets = tickets;
	const deadTokens: string[] = [];
	for (let attempt = 0; ; attempt++) {
		const result = await fetchReceiptAttempt(pendingTickets, deps.fetchFn);
		deadTokens.push(...result.deadTokens);
		pendingTickets = result.missingTickets;
		if (pendingTickets.length === 0) return deadTokens;
		const retryDelayMs = deps.retryDelaysMs[attempt];
		if (retryDelayMs === undefined) {
			return deadTokens;
		}
		await deps.sleep(retryDelayMs);
	}
}

async function fetchReceiptAttempt(
	tickets: { id: string; expoPushToken: string }[],
	fetchFn: typeof globalThis.fetch,
): Promise<{
	deadTokens: string[];
	missingTickets: { id: string; expoPushToken: string }[];
}> {
	const response = await fetchFn(EXPO_PUSH_RECEIPTS_URL, {
		method: "POST",
		headers: {
			Accept: "application/json",
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ ids: tickets.map((ticket) => ticket.id) }),
	});
	const payload: unknown = await response.json().catch(() => null);
	if (!response.ok) {
		throw new PushSendError(
			`Expo push receipt check failed with ${response.status}`,
		);
	}

	const parsed = receiptResponseSchema.safeParse(payload);
	if (!parsed.success) {
		throw new PushSendError("Expo push receipts returned an invalid response");
	}

	const deadTokens: string[] = [];
	const missingTickets: { id: string; expoPushToken: string }[] = [];
	for (const ticket of tickets) {
		const receipt = parsed.data.data[ticket.id];
		if (!receipt) {
			missingTickets.push(ticket);
			continue;
		}
		if (receipt.status === "ok") continue;
		if (receipt.details?.error === "DeviceNotRegistered") {
			deadTokens.push(ticket.expoPushToken);
			continue;
		}
		throw new PushSendError(`Expo push receipt failed: ${receipt.message}`);
	}
	return { deadTokens, missingTickets };
}

function sleep(delayMs: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, delayMs));
}
