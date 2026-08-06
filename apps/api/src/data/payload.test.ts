import { PAYLOAD_MAX_BYTES, readBoundedJsonBody } from "./payload";

describe("readBoundedJsonBody", () => {
	it("allows a JSON body exactly at the byte cap", async () => {
		const body = jsonWithByteLength(PAYLOAD_MAX_BYTES);

		await expect(readBoundedJsonBody(streamFromText(body))).resolves.toEqual(
			JSON.parse(body),
		);
	});

	it("rejects a JSON body one byte over the cap", async () => {
		await expect(
			readBoundedJsonBody(
				streamFromText(jsonWithByteLength(PAYLOAD_MAX_BYTES + 1)),
			),
		).rejects.toMatchObject({
			message: "Payload too large",
			status: 413,
		});
	});

	it("rejects a null body as malformed JSON", async () => {
		await expect(readBoundedJsonBody(null)).rejects.toMatchObject({
			message: "Malformed JSON",
			status: 400,
		});
	});
});

function streamFromText(text: string): ReadableStream<Uint8Array> {
	const bytes = new TextEncoder().encode(text);
	return new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(bytes);
			controller.close();
		},
	});
}

function jsonWithByteLength(byteLength: number): string {
	const prefix = '{"pad":"';
	const suffix = '"}';
	const padLength = byteLength - prefix.length - suffix.length;
	if (padLength < 0) {
		throw new Error("byteLength too small for JSON fixture");
	}
	return `${prefix}${"a".repeat(padLength)}${suffix}`;
}
