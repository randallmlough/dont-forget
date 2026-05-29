import type {
	AuthenticatedAppSessionActivation,
	AuthenticatedAppSessionController,
} from "./controller";
import { createAuthenticatedAppSessionSignOut } from "./sign-out";

const logger = {
	debug: jest.fn(),
	info: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
	with: jest.fn(),
};

describe("createAuthenticatedAppSessionSignOut", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("signs out in analytics, controller, local cleanup, Clerk order", async () => {
		const order: string[] = [];
		const controller = controllerFixture();
		controller.dispose.mockImplementation(async () => {
			order.push("dispose");
			return { householdIdsForLocalDataDeletion: ["hh_active"] };
		});
		const auth = authFixture({
			signOut: jest.fn(async () => {
				order.push("clerk");
			}),
		});
		const analytics = {
			track: jest.fn(() => order.push("track")),
			reset: jest.fn(() => order.push("reset")),
		};
		const clearSignedOutSessionData = jest.fn(async () => {
			order.push("clear");
		});
		const signOut = createAuthenticatedAppSessionSignOut({
			controller,
			getAuth: () => auth,
			analytics,
			clearSignedOutSessionData,
			logger,
		});

		await signOut.run();

		expect(order).toEqual(["track", "reset", "dispose", "clear", "clerk"]);
		expect(clearSignedOutSessionData).toHaveBeenCalledWith(["hh_active"]);
	});

	it("ignores duplicate sign-out calls while a run is pending", async () => {
		const cleanup = deferred<void>();
		const controller = controllerFixture();
		const auth = authFixture();
		const analytics = { track: jest.fn(), reset: jest.fn() };
		const signOut = createAuthenticatedAppSessionSignOut({
			controller,
			getAuth: () => auth,
			analytics,
			clearSignedOutSessionData: jest.fn(() => cleanup.promise),
			logger,
		});

		const firstRun = signOut.run();
		await Promise.resolve();
		await signOut.run();

		expect(signOut.isRunning()).toBe(true);
		expect(analytics.track).toHaveBeenCalledTimes(1);
		expect(controller.dispose).toHaveBeenCalledTimes(1);
		expect(auth.signOut).not.toHaveBeenCalled();

		cleanup.resolve(undefined);
		await firstRun;
		expect(signOut.isRunning()).toBe(false);
		expect(auth.signOut).toHaveBeenCalledTimes(1);
	});

	it("attempts recovery with latest auth inputs when Clerk sign-out fails", async () => {
		const clerkSignOut = deferred<void>();
		const controller = controllerFixture();
		let auth = authFixture({
			signOut: jest.fn(() => clerkSignOut.promise),
		});
		const nextGetToken = jest.fn(async () => "latest-token");
		const signOut = createAuthenticatedAppSessionSignOut({
			controller,
			getAuth: () => auth,
			analytics: { track: jest.fn(), reset: jest.fn() },
			clearSignedOutSessionData: jest.fn(async () => undefined),
			logger,
		});

		const run = signOut.run();
		await Promise.resolve();
		auth = authFixture({
			getToken: nextGetToken,
			signedIn: true,
			signOut: auth.signOut,
		});
		clerkSignOut.reject(new Error("sign out failed"));
		await expect(run).rejects.toThrow("sign out failed");

		expect(controller.activate).toHaveBeenCalledWith({
			getToken: nextGetToken,
			authReady: true,
			signedIn: true,
		});
	});
});

function authFixture(
	overrides: Partial<
		AuthenticatedAppSessionActivation & { signOut: () => Promise<void> }
	> = {},
): AuthenticatedAppSessionActivation & { signOut: () => Promise<void> } {
	return {
		getToken: jest.fn(async () => "token"),
		authReady: true,
		signedIn: true,
		signOut: jest.fn(async () => undefined),
		...overrides,
	};
}

function controllerFixture(): jest.Mocked<AuthenticatedAppSessionController> {
	return {
		activate: jest.fn<
			ReturnType<AuthenticatedAppSessionController["activate"]>,
			Parameters<AuthenticatedAppSessionController["activate"]>
		>(async () => undefined),
		dispose: jest.fn(async () => ({ householdIdsForLocalDataDeletion: [] })),
		getSnapshot: jest.fn(() => ({ status: "idle" })),
		subscribe: jest.fn<
			ReturnType<AuthenticatedAppSessionController["subscribe"]>,
			Parameters<AuthenticatedAppSessionController["subscribe"]>
		>(() => ({ remove() {} })),
	};
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<T>((nextResolve, nextReject) => {
		resolve = nextResolve;
		reject = nextReject;
	});

	return { promise, resolve, reject };
}
