import { DataClientError } from "./applicator";

export const PAYLOAD_MAX_BYTES = 256 * 1024;

export async function readBoundedJsonBody(
	body: ReadableStream<Uint8Array> | null,
): Promise<unknown> {
	if (!body) {
		throw new DataClientError("Malformed JSON", 400);
	}

	const reader = body.getReader();
	const chunks: Uint8Array[] = [];
	let totalBytes = 0;

	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;

			totalBytes += value.byteLength;
			if (totalBytes > PAYLOAD_MAX_BYTES) {
				await reader.cancel().catch(() => undefined);
				throw new DataClientError("Payload too large", 413);
			}

			chunks.push(value);
		}
	} catch (error) {
		if (error instanceof DataClientError) {
			throw error;
		}
		throw new DataClientError("Malformed JSON", 400);
	} finally {
		reader.releaseLock();
	}

	try {
		return JSON.parse(new TextDecoder().decode(joinChunks(chunks, totalBytes)));
	} catch {
		throw new DataClientError("Malformed JSON", 400);
	}
}

function joinChunks(chunks: Uint8Array[], totalBytes: number): Uint8Array {
	const joined = new Uint8Array(totalBytes);
	let offset = 0;
	for (const chunk of chunks) {
		joined.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return joined;
}
