import { useAuth } from "@clerk/clerk-expo";
import {
	createContext,
	type PropsWithChildren,
	use,
	useEffect,
	useEffectEvent,
	useReducer,
	useRef,
	useState,
} from "react";
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
	activationEnabled = true,
	bootstrapService = createSessionBootstrapService(),
	connectDatabase = defaultConnectDatabase,
	disconnectAndClear = () => db.disconnectAndClear(),
}: AuthenticatedAppSessionProviderProps) {
	const clerkAuth = useAuth();
	const logger = useLogger();
	const clerkGetToken = clerkAuth.getToken;
	const clerkGetPowerSyncToken = () =>
		clerkAuth.getToken({ template: "powersync" });
	const auth = authProp ?? {
		getToken: clerkGetToken,
		getPowerSyncToken: clerkGetPowerSyncToken,
		authReady: clerkAuth.isLoaded,
		signedIn: Boolean(clerkAuth.isSignedIn),
		signOut: clerkAuth.signOut,
	};
	const authReady = auth.authReady;
	const signedIn = auth.signedIn;
	const [view, setView] = useState<SessionView>({
		state: { status: "loading" },
		session: null,
	});
	const sessionRef = useRef<AuthenticatedAppSession | null>(null);
	const attemptRef = useRef(0);
	const [activationRequest, requestActivation] = useReducer(
		(
			_request: ActivationRequest,
			mode: ActivationRequest["mode"] = "normal",
		) => ({
			attempt: _request.attempt + 1,
			mode,
		}),
		{ attempt: 0, mode: "normal" },
	);
	const [signOutRunningState] = useState(() => ({ running: false }));
	const getToken = useEffectEvent(() => auth.getToken());
	const getPowerSyncToken = useEffectEvent(() =>
		(auth.getPowerSyncToken ?? auth.getToken)(),
	);
	const activate = useEffectEvent(async (request: ActivationRun) => {
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
	});
	const signOutFlow = createAuthenticatedAppSessionSignOut({
		getAuth: () => auth,
		analytics,
		clearAuthenticatedAppSessionPresent:
			clearAuthenticatedAppSessionPresentProp,
		logger,
		runningState: signOutRunningState,
		disconnectAndClear,
		getSessionUserId: () => sessionRef.current?.user.id ?? null,
	});

	function publishLoading() {
		sessionRef.current = null;
		setView({ state: { status: "loading" }, session: null });
	}

	function publishReady(session: AuthenticatedAppSession, refreshing: boolean) {
		sessionRef.current = session;
		setView({ state: { status: "ready", refreshing }, session });
	}

	function publishError(message: string) {
		sessionRef.current = null;
		setView({ state: { status: "error", message }, session: null });
	}

	useEffect(() => {
		if (signOutRunningState.running) return;
		if (!activationEnabled && activationRequest.attempt === 0) return;
		void activate({ ...activationRequest, authReady, signedIn });
	}, [
		activationEnabled,
		authReady,
		signedIn,
		activationRequest,
		signOutRunningState,
	]);

	function requestSessionReload(mode: ActivationRequest["mode"]) {
		attemptRef.current += 1;
		requestActivation(mode);
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

	const value: AuthenticatedAppSessionContextValue = {
		...view,
		retry,
		reloadSession,
		signOut: signOutFlow.run,
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
