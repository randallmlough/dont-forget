import type { LogAttributes, Logger } from "@/lib/logger";

export type LoggerFixture = {
	root: Logger;
	with: jest.Mock<Logger, [LogAttributes]>;
	error: jest.Mock<void, Parameters<Logger["error"]>>;
};

export function loggerFixture(): LoggerFixture {
	const scoped = createMockLogger();
	const root = createMockLogger();
	const withLogger = jest.fn<Logger, [LogAttributes]>(() => scoped);
	root.with = withLogger;

	return {
		root,
		with: withLogger,
		error: scoped.error as jest.Mock<void, Parameters<Logger["error"]>>,
	};
}

export function createMockLogger(): Logger {
	return {
		debug: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		with: jest.fn(() => createMockLogger()),
	};
}
