import type { LogAttributes, Logger } from "@/client/lib/logger";

export type MockLogger = jest.Mocked<Logger>;

export type LoggerFixture = {
	root: MockLogger;
	scoped: MockLogger;
	with: jest.Mock<Logger, [LogAttributes]>;
	error: jest.Mock<void, Parameters<Logger["error"]>>;
	warn: jest.Mock<void, Parameters<Logger["warn"]>>;
};

export function loggerFixture(): LoggerFixture {
	const scoped = createMockLogger();
	scoped.with.mockReturnValue(scoped);
	const root = createMockLogger();
	const withLogger = jest.fn<Logger, [LogAttributes]>(() => scoped);
	root.with = withLogger;

	return {
		root,
		scoped,
		with: withLogger,
		error: scoped.error as jest.Mock<void, Parameters<Logger["error"]>>,
		warn: scoped.warn as jest.Mock<void, Parameters<Logger["warn"]>>,
	};
}

export function createMockLogger(): MockLogger {
	const logger: MockLogger = {
		debug: jest.fn<void, Parameters<Logger["debug"]>>(),
		info: jest.fn<void, Parameters<Logger["info"]>>(),
		warn: jest.fn<void, Parameters<Logger["warn"]>>(),
		error: jest.fn<void, Parameters<Logger["error"]>>(),
		with: jest.fn<Logger, [LogAttributes]>(),
	};
	logger.with.mockImplementation(() => createMockLogger());
	return logger;
}

export function createMockLoggerModule() {
	const logger = createMockLogger();
	logger.with.mockReturnValue(logger);

	return {
		logger,
		useLogger: jest.fn(() => logger),
	};
}
