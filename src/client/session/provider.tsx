import { useAuth } from "@clerk/clerk-expo";
import {
	createContext,
	type PropsWithChildren,
	use,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { clearUserCurrentListSelections } from "@/client/features/list/current-selection";
import { reset, track } from "@/client/lib/analytics";
import { readApiBaseUrl } from "@/client/lib/api-base-url";
import { useLogger } from "@/client/lib/logger";
import {
	createSessionBootstrapService,
	type GetSessionToken,
	type SessionBootstrap,
	type SessionBootstrapService,
} from "@/client/session/bootstrap";
import { db, PowerSyncConnector } from "@/client/session/powersync";
import { readPowerSyncUrl } from "@/client/session/powersync/powersync-url";
import {
	type AuthenticatedAppSessionSignOutAnalytics,
	createAuthenticatedAppSessionSignOut,
} from "@/client/session/sign-out";
import { asError } from "@/shared/errors";
import {
	clearAuthenticatedAppSessionPresent,
	markAuthenticatedAppSessionPresent,
} from "./session-hint";

export type AuthenticatedAppSession = SessionBootstrap;

export type AuthenticatedAppSessionState =
	| { status: "loading" }
	| { status: "ready"; refreshing: boolean }
	| { status: "error"; message: string };

export type AuthenticatedAppSessionContextValue = {
	state: AuthenticatedAppSessionState;
	session: AuthenticatedAppSession | null;
	retry: () => void;
	reloadSession: (options?: AuthenticatedAppSessionReloadOptions) => void;
	signOut: () => Promise<void>;
};

export type AuthenticatedAppSessionReloadOptions =
	| { mode: "freshOnly" }
	| { mode: "retireCurrent" };

export type AuthenticatedAppSessionProviderAuth = {
	getToken: GetSessionToken;
	getPowerSyncToken?: GetSessionToken;
	authReady: boolean;
	signedIn: boolean;
	signOut: () => Promise<void>;
};

export type AuthenticatedAppSessionConnectDatabase = (input: {
	getToken: GetSessionToken;
	getPowerSyncToken: GetSessionToken;
}) => Promise<void>;

type AuthenticatedAppSessionProviderProps = PropsWithChildren<{
	auth?: AuthenticatedAppSessionProviderAuth;
	analytics?: AuthenticatedAppSessionSignOutAnalytics;
	clearAuthenticatedAppSessionPresent?: typeof clearAuthenticatedAppSessionPresent;
	clearCurrentListSelectionsForUser?: typeof clearUserCurrentListSelections;
	activationEnabled?: boolean;
	bootstrapService?: SessionBootstrapService;
	connectDatabase?: AuthenticatedAppSessionConnectDatabase;
	disconnectAndClear?: () => Promise<void>;
}>;

type SessionView = {
	state: AuthenticatedAppSessionState;
	session: AuthenticatedAppSession | null;
};

type ActivationRequest = {
	attempt: number;
	mode: "normal" | "freshOnly";
};

type ActivationRun = ActivationRequest & {
	authReady: boolean;
	signedIn: boolean;
};

type SignOutStatus = "idle" | "running";

const GENERIC_ERROR_MESSAGE =
	"Unable to prepare your Household. Please try again.";

const defaultAnalytics: AuthenticatedAppSessionSignOutAnalytics = {
	track,
	reset,
};

const AuthenticatedAppSessionContext =
	createContext<AuthenticatedAppSessionContextValue | null>(null);

export function AuthenticatedAppSessionProvider({
	children,
	auth: authProp,
	analytics = defaultAnalytics,
	clearAuthenticatedAppSessionPresent:
		clearAuthenticatedAppSessionPresentProp = clearAuthenticatedAppSessionPresent,
	clearCurrentListSelectionsForUser,
	activationEnabled = true,
	bootstrapService: bootstrapServiceProp,
	connectDatabase = defaultConnectDatabase,
	disconnectAndClear = () => db.disconnectAndClear(),
}: AuthenticatedAppSessionProviderProps) {
	const clerkAuth = useAuth();
	const logger = useLogger();
	const [defaultBootstrapService] = useState(() =>
		createSessionBootstrapService(),
	);
	const bootstrapService = bootstrapServiceProp ?? defaultBootstrapService;
	const clerkGetToken = clerkAuth.getToken;
	const clerkSignOut = clerkAuth.signOut;
	const defaultAuth = useMemo(
		() => ({
			getToken: clerkGetToken,
			getPowerSyncToken: () => clerkGetToken({ template: "powersync" }),
			authReady: clerkAuth.isLoaded,
			signedIn: Boolean(clerkAuth.isSignedIn),
			signOut: clerkSignOut,
		}),
		[clerkAuth.isLoaded, clerkAuth.isSignedIn, clerkGetToken, clerkSignOut],
	);
	const auth = authProp ?? defaultAuth;
	const authReady = auth.authReady;
	const signedIn = auth.signedIn;
	const authRef = useRef(auth);
	const [view, setView] = useState<SessionView>({
		state: { status: "loading" },
		session: null,
	});
	const sessionRef = useRef<AuthenticatedAppSession | null>(null);
	const lastKnownUserIdRef = useRef<string | null>(null);
	const attemptRef = useRef(0);
	const [activationRequest, setActivationRequest] = useState<ActivationRequest>(
		{
			attempt: 0,
			mode: "normal",
		},
	);
	const activationRequestRef = useRef<ActivationRequest>(activationRequest);
	const handledActivationRunRef = useRef<string | null>(null);
	const [signOutStatus, setSignOutStatus] = useState<SignOutStatus>("idle");
	const signOutStatusRef = useRef<SignOutStatus>("idle");
	const suppressActivationUntilSignedOutRef = useRef(false);
	const getToken = useCallback(() => authRef.current.getToken(), []);
	const getPowerSyncToken = useCallback(
		() => (authRef.current.getPowerSyncToken ?? authRef.current.getToken)(),
		[],
	);
	const publishLoading = useCallback(() => {
		sessionRef.current = null;
		setView({ state: { status: "loading" }, session: null });
	}, []);
	const publishReady = useCallback(
		(session: AuthenticatedAppSession, refreshing: boolean) => {
			sessionRef.current = session;
			lastKnownUserIdRef.current = session.user.id;
			setView({ state: { status: "ready", refreshing }, session });
		},
		[],
	);
	const publishError = useCallback((message: string) => {
		sessionRef.current = null;
		setView({ state: { status: "error", message }, session: null });
	}, []);
	const setProviderSignOutStatus = useCallback((status: SignOutStatus) => {
		signOutStatusRef.current = status;
		setSignOutStatus(status);
	}, []);
	const runActivation = useCallback(
		async (request: ActivationRun) => {
			handledActivationRunRef.current = activationRunKey(request);
			const attempt = attemptRef.current + 1;
			attemptRef.current = attempt;
			const cachedSession = sessionRef.current;
			const allowCached = request.mode !== "freshOnly";

			if (!request.authReady) {
				publishLoading();
				return;
			}

			if (!request.signedIn) {
				publishLoading();
				return;
			}

			if (allowCached && cachedSession) {
				publishReady(cachedSession, true);
			} else {
				publishLoading();
			}

			try {
				const session = await bootstrapService.getSession(getToken);
				if (attempt !== attemptRef.current) return;
				await connectDatabase({ getToken, getPowerSyncToken });
				if (attempt !== attemptRef.current) return;
				publishReady(session, false);
				void markAuthenticatedAppSessionPresent().catch(() => undefined);
			} catch (error) {
				logger.error("authenticated app session activation failed", {
					error: asError(error),
				});
				if (attempt !== attemptRef.current) return;
				if (allowCached && cachedSession) {
					publishReady(cachedSession, false);
					return;
				}
				publishError(GENERIC_ERROR_MESSAGE);
			}
		},
		[
			bootstrapService,
			connectDatabase,
			getPowerSyncToken,
			getToken,
			logger,
			publishError,
			publishLoading,
			publishReady,
		],
	);
	function clearPublishedSession() {
		handledActivationRunRef.current = null;
		publishLoading();
	}

	function queueActivationRequest(mode: ActivationRequest["mode"]) {
		const nextRequest: ActivationRequest = {
			attempt: activationRequestRef.current.attempt + 1,
			mode,
		};
		activationRequestRef.current = nextRequest;
		setActivationRequest(nextRequest);
		return nextRequest;
	}

	useEffect(() => {
		if (signOutStatus === "running") {
			return;
		}
		if (suppressActivationUntilSignedOutRef.current) {
			if (signedIn) return;
			suppressActivationUntilSignedOutRef.current = false;
		}
		if (!activationEnabled && activationRequest.attempt === 0) return;
		const request = { ...activationRequest, authReady, signedIn };
		if (handledActivationRunRef.current === activationRunKey(request)) {
			return;
		}
		void runActivation(request);
	}, [
		activationEnabled,
		authReady,
		signedIn,
		activationRequest,
		signOutStatus,
		runActivation,
	]);

	useEffect(() => {
		authRef.current = auth;
	}, [auth]);

	function requestSessionReload(
		mode: ActivationRequest["mode"],
	): ActivationRequest {
		attemptRef.current += 1;
		return queueActivationRequest(mode);
	}

	function retry() {
		requestSessionReload("normal");
	}

	function reloadSession(options?: AuthenticatedAppSessionReloadOptions) {
		if (options?.mode === "retireCurrent") {
			publishLoading();
			requestSessionReload("normal");
			return;
		}
		requestSessionReload(
			options?.mode === "freshOnly" ? "freshOnly" : "normal",
		);
	}

	async function runSignOut() {
		if (signOutStatusRef.current === "running") return;
		const signOutStartedAfterAttempt = activationRequestRef.current.attempt;
		attemptRef.current += 1;
		setProviderSignOutStatus("running");
		const signOutFlow = createAuthenticatedAppSessionSignOut({
			getAuth: () => authRef.current,
			analytics,
			clearAuthenticatedAppSessionPresent:
				clearAuthenticatedAppSessionPresentProp,
			clearCurrentListSelectionsForUser,
			logger,
			disconnectAndClear,
			getSessionUserId: () => lastKnownUserIdRef.current,
		});
		try {
			await signOutFlow.run();
			clearPublishedSession();
			lastKnownUserIdRef.current = null;
			suppressActivationUntilSignedOutRef.current = true;
			setProviderSignOutStatus("idle");
		} catch (error) {
			const latestAuth = {
				authReady: authRef.current.authReady,
				signedIn: authRef.current.signedIn,
			};
			clearPublishedSession();
			if (latestAuth.authReady && latestAuth.signedIn) {
				const queuedRequest = activationRequestRef.current;
				const recoveryRequest =
					queuedRequest.attempt > signOutStartedAfterAttempt
						? queuedRequest
						: requestSessionReload("freshOnly");
				await runActivation({ ...recoveryRequest, ...latestAuth });
			} else {
				lastKnownUserIdRef.current = null;
			}
			setProviderSignOutStatus("idle");
			throw error;
		}
	}

	const value: AuthenticatedAppSessionContextValue = {
		...view,
		retry,
		reloadSession,
		signOut: runSignOut,
	};

	return (
		<AuthenticatedAppSessionContext.Provider value={value}>
			{children}
		</AuthenticatedAppSessionContext.Provider>
	);
}

export function useAuthenticatedAppSession(): AuthenticatedAppSessionContextValue {
	const value = use(AuthenticatedAppSessionContext);
	if (!value) {
		throw new Error(
			"useAuthenticatedAppSession must be used inside AuthenticatedAppSessionProvider",
		);
	}
	return value;
}

function activationRunKey(request: ActivationRun): string {
	return `${request.attempt}:${request.mode}:${request.authReady}:${request.signedIn}`;
}

async function defaultConnectDatabase({
	getToken,
	getPowerSyncToken,
}: {
	getToken: GetSessionToken;
	getPowerSyncToken: GetSessionToken;
}) {
	await db.connect(
		new PowerSyncConnector({
			powersyncGetToken: getPowerSyncToken,
			sessionGetToken: getToken,
			apiBaseUrl: readApiBaseUrl,
			powersyncUrl: readPowerSyncUrl(),
		}),
	);
}
