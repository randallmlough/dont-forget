export type Deferred<T> = {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (error: unknown) => void;
};

export function deferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((nextResolve, nextReject) => {
		resolve = nextResolve;
		reject = nextReject;
	});

	return { promise, resolve, reject };
}

export async function waitForAsync(assertion: () => void) {
	for (let attempt = 0; attempt < 25; attempt += 1) {
		try {
			assertion();
			return;
		} catch (error) {
			if (attempt === 24) throw error;
			await new Promise((resolve) => setTimeout(resolve, 0));
		}
	}
}
