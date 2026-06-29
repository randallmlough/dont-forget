import { asError } from "@/lib/errors";
import type { Logger } from "@/lib/logger";
import { logger as defaultLogger } from "@/lib/logger";
import type { ItemService } from "@/lib/services/item";
import type { ListService } from "@/lib/services/list";
import {
	type ActiveMember,
	createSessionBootstrapService,
	type GetSessionToken,
	type Member,
	type SessionBootstrap,
	type SessionBootstrapService,
	type SessionUser,
} from "./bootstrap";
import {
	createSessionDataServices,
	type SessionDataServices,
	type SessionDataServicesConfig,
} from "./services";
import { markAuthenticatedAppSessionAvailable } from "./session-hint";

export type AuthenticatedAppSessionStateSnapshot =
	| { status: "idle" }
	| {
			status: "loading";
			previous?: AuthenticatedAppSession;
			refreshingSession?: boolean;
	  }
	| { status: "error"; message: string; previous?: AuthenticatedAppSession }
	| { status: "ready"; session: AuthenticatedAppSession };

export type AuthenticatedAppSessionSync = SessionDataServices["sync"];

export type AuthenticatedAppSessionServices = {
	lists: ListService;
	items: ItemService;
	changes: {
		subscribe: (listener: () => void) => { remove: () => void };
	};
	sync: AuthenticatedAppSessionSync;
};

export type AuthenticatedAppSession = {
	user: SessionUser;
	activeHousehold: {
		id: string;
		name: string;
	};
	households: SessionBootstrap["households"];
	activeMember: ActiveMember;
	members: Member[];
	resourceKey: string;
	services: AuthenticatedAppSessionServices;
};

export type AuthenticatedAppSessionActivation = {
	getToken: GetSessionToken;
	getPowerSyncToken?: GetSessionToken;
	authReady: boolean;
	signedIn: boolean;
	cachePolicy?: AuthenticatedAppSessionCachePolicy;
};

type AuthenticatedAppSessionAuthState = "unknown" | "signedOut" | "signedIn";
export type AuthenticatedAppSessionCachePolicy = "allowCached" | "freshOnly";

type AuthenticatedAppSessionSubscriber = (
	snapshot: AuthenticatedAppSessionStateSnapshot,
) => void;

type ActivationRunGuard = {
	id: number;
	isCurrent: () => boolean;
};

export type AuthenticatedAppSessionController = {
	activate: (activation: AuthenticatedAppSessionActivation) => Promise<void>;
	dispose: (options?: { clearLocalData?: boolean }) => Promise<void>;
	getSnapshot: () => AuthenticatedAppSessionStateSnapshot;
	invalidateCurrentSession: () => Promise<void>;
	subscribe: (subscriber: AuthenticatedAppSessionSubscriber) => {
		remove: () => void;
	};
};

export type CreateSessionDataServices = (
	config: SessionDataServicesConfig,
) => Promise<SessionDataServices>;

export type AuthenticatedAppSessionControllerDeps = {
	bootstrap?: SessionBootstrapService;
	createDataServices?: CreateSessionDataServices;
	logger?: Logger;
};

const GENERIC_ERROR_MESSAGE =
	"Unable to prepare your Household. Please try again.";

export function createAuthenticatedAppSessionController(
	deps: AuthenticatedAppSessionControllerDeps = {},
): AuthenticatedAppSessionController {
	const bootstrap = deps.bootstrap ?? createSessionBootstrapService();
	const createDataServices =
		deps.createDataServices ?? createSessionDataServices;
	const logger = deps.logger ?? defaultLogger;
	const subscribers = new Set<AuthenticatedAppSessionSubscriber>();
	let snapshot: AuthenticatedAppSessionStateSnapshot = { status: "idle" };
	let activationRun = 0;
	let activeServices: SessionDataServices | null = null;
	let nextResourceVersion = 1;

	function publish(nextSnapshot: AuthenticatedAppSessionStateSnapshot) {
		snapshot = nextSnapshot;
		for (const subscriber of subscribers) {
			subscriber(nextSnapshot);
		}
	}

	function startActivationRun(): ActivationRunGuard {
		const id = ++activationRun;
		return {
			id,
			isCurrent: () => id === activationRun,
		};
	}

	function publishLoading(previousSession?: AuthenticatedAppSession) {
		publish(
			previousSession
				? {
						status: "loading",
						previous: previousSession,
						refreshingSession: true,
					}
				: { status: "loading" },
		);
	}

	async function closeActiveServices(options?: { clearLocalData?: boolean }) {
		const services = activeServices;
		activeServices = null;
		if (services) {
			await services.close(options);
		}
	}

	async function handleSignedOutActivation(run: ActivationRunGuard) {
		await closeActiveServices().catch((error) => {
			logger.error("authenticated app session resource close failed", {
				error: asError(error),
			});
		});
		if (run.isCurrent()) publish({ status: "idle" });
	}

	async function publishFreshSessionForRun(
		session: SessionBootstrap,
		activation: AuthenticatedAppSessionActivation,
		run: ActivationRunGuard,
	): Promise<void> {
		const householdLogger = logger.with({
			household_id: session.activeHousehold.id,
		});
		let openedServices: SessionDataServices | null = await createDataServices({
			householdId: session.activeHousehold.id,
			userId: session.user.id,
			getSessionToken: activation.getToken,
			getPowerSyncToken: activation.getPowerSyncToken ?? activation.getToken,
			logger: householdLogger,
		});

		if (!run.isCurrent()) {
			await openedServices.close().catch(() => undefined);
			return;
		}

		const previousServices = activeServices;
		const publishedServices = openedServices;
		activeServices = publishedServices;
		openedServices = null;

		const appSession = authenticatedAppSessionFromBootstrap(
			session,
			publishedServices,
			`authenticated-app-session:${nextResourceVersion}`,
		);
		nextResourceVersion += 1;
		publish({ status: "ready", session: appSession });
		void markAuthenticatedAppSessionAvailable().catch(() => undefined);

		if (previousServices && previousServices !== activeServices) {
			await previousServices.close();
		}
	}

	async function handleSignedInActivation(
		activation: AuthenticatedAppSessionActivation,
		run: ActivationRunGuard,
		cachePolicy: AuthenticatedAppSessionCachePolicy,
	) {
		try {
			const session = await bootstrap.getSession(activation.getToken);
			if (!run.isCurrent()) return;
			await publishFreshSessionForRun(session, activation, run);
		} catch (error) {
			await recoverActivationFailure(error, run, cachePolicy);
		}
	}

	async function recoverActivationFailure(
		error: unknown,
		run: ActivationRunGuard,
		cachePolicy: AuthenticatedAppSessionCachePolicy,
	) {
		logger.error("authenticated app session activation failed", {
			error: asError(error),
		});
		if (!run.isCurrent()) return;

		const previousSession = previousSessionFromSnapshot(snapshot);
		if (cachePolicy === "allowCached" && previousSession) {
			publish({ status: "ready", session: previousSession });
			return;
		}

		await closeActiveServices().catch(() => undefined);
		publish({ status: "error", message: GENERIC_ERROR_MESSAGE });
	}

	return {
		async activate(activation) {
			const run = startActivationRun();
			const cachePolicy = activation.cachePolicy ?? "allowCached";
			const authState =
				authenticatedAppSessionAuthStateFromActivation(activation);
			if (authState === "signedOut") {
				await handleSignedOutActivation(run);
				return;
			}

			publishLoading(previousSessionForActivation(cachePolicy, snapshot));

			if (authState === "unknown") {
				return;
			}

			await handleSignedInActivation(activation, run, cachePolicy);
		},

		async invalidateCurrentSession() {
			activationRun += 1;
			publish({ status: "loading" });
			await closeActiveServices().catch((error) => {
				logger.error("authenticated app session resource close failed", {
					error: asError(error),
				});
			});
		},

		async dispose(options) {
			activationRun += 1;
			publish({ status: "idle" });
			await closeActiveServices(options);
		},

		getSnapshot() {
			return snapshot;
		},

		subscribe(subscriber) {
			subscribers.add(subscriber);
			return {
				remove() {
					subscribers.delete(subscriber);
				},
			};
		},
	};
}

function previousSessionFromSnapshot(
	snapshot: AuthenticatedAppSessionStateSnapshot,
): AuthenticatedAppSession | undefined {
	if (snapshot.status === "ready") return snapshot.session;
	if (snapshot.status === "loading" || snapshot.status === "error") {
		return snapshot.previous;
	}
	return undefined;
}

function previousSessionForActivation(
	cachePolicy: AuthenticatedAppSessionCachePolicy,
	snapshot: AuthenticatedAppSessionStateSnapshot,
): AuthenticatedAppSession | undefined {
	if (cachePolicy === "freshOnly") return undefined;
	return previousSessionFromSnapshot(snapshot);
}

function authenticatedAppSessionAuthStateFromActivation(
	activation: AuthenticatedAppSessionActivation,
): AuthenticatedAppSessionAuthState {
	if (!activation.authReady) return "unknown";
	return activation.signedIn ? "signedIn" : "signedOut";
}

function authenticatedAppSessionFromBootstrap(
	session: SessionBootstrap,
	services: SessionDataServices,
	resourceKey: string,
): AuthenticatedAppSession {
	return {
		user: session.user,
		activeHousehold: session.activeHousehold,
		households: session.households,
		activeMember: session.activeMember,
		members: session.members,
		resourceKey,
		services: {
			lists: services.lists,
			items: services.items,
			changes: services.changes,
			sync: services.sync,
		},
	};
}
