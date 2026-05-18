import { createElement, Fragment, type ReactNode } from "react";

type AuthState = {
	isLoaded: boolean;
	isSignedIn: boolean;
};

type UserState = {
	user: unknown;
};

type SignInState = {
	isLoaded: boolean;
	createdSessionId: string | null;
	firstFactorVerificationStatus: string | null;
};

type SignUpState = {
	isLoaded: boolean;
	createdSessionId: string | null;
};

export const clerkMocks = {
	getToken: jest.fn(),
	signInCreate: jest.fn(),
	signUpCreate: jest.fn(),
	prepareEmailAddressVerification: jest.fn(),
	attemptEmailAddressVerification: jest.fn(),
	setActive: jest.fn(),
	startSSOFlow: jest.fn(),
	signOut: jest.fn(),
	isClerkAPIResponseError: jest.fn(),
};

let authState: AuthState;
let userState: UserState;
let signInState: SignInState;
let signUpState: SignUpState;
let authCallbacksAreUnstable: boolean;

export function resetClerkMocks() {
	for (const mock of Object.values(clerkMocks)) {
		mock.mockReset();
	}

	authState = { isLoaded: true, isSignedIn: false };
	userState = { user: null };
	authCallbacksAreUnstable = false;
	signInState = {
		isLoaded: true,
		createdSessionId: null,
		firstFactorVerificationStatus: null,
	};
	signUpState = { isLoaded: true, createdSessionId: null };

	clerkMocks.isClerkAPIResponseError.mockImplementation((error: unknown) => {
		return (
			typeof error === "object" &&
			error !== null &&
			"errors" in error &&
			Array.isArray((error as { errors?: unknown }).errors)
		);
	});
}

export function setMockAuthState(next: Partial<AuthState>) {
	authState = { ...authState, ...next };
}

export function setMockAuthCallbacksUnstable(next: boolean) {
	authCallbacksAreUnstable = next;
}

export function setMockUserState(next: Partial<UserState>) {
	userState = { ...userState, ...next };
}

export function setMockSignInState(next: Partial<SignInState>) {
	signInState = { ...signInState, ...next };
}

export function setMockSignUpState(next: Partial<SignUpState>) {
	signUpState = { ...signUpState, ...next };
}

export function ClerkProvider({ children }: { children: ReactNode }) {
	return createElement(Fragment, null, children);
}

export function ClerkLoaded({ children }: { children: ReactNode }) {
	return createElement(Fragment, null, children);
}

export function useAuth() {
	return {
		...authState,
		getToken: authCallbacksAreUnstable
			? () => clerkMocks.getToken()
			: clerkMocks.getToken,
		signOut: authCallbacksAreUnstable
			? () => clerkMocks.signOut()
			: clerkMocks.signOut,
	};
}

export function useUser() {
	return userState;
}

export function useSignIn() {
	return {
		isLoaded: signInState.isLoaded,
		setActive: clerkMocks.setActive,
		signIn: {
			create: clerkMocks.signInCreate,
			get createdSessionId() {
				return signInState.createdSessionId;
			},
			get firstFactorVerification() {
				return { status: signInState.firstFactorVerificationStatus };
			},
		},
	};
}

export function useSignUp() {
	return {
		isLoaded: signUpState.isLoaded,
		setActive: clerkMocks.setActive,
		signUp: {
			create: clerkMocks.signUpCreate,
			prepareEmailAddressVerification:
				clerkMocks.prepareEmailAddressVerification,
			attemptEmailAddressVerification:
				clerkMocks.attemptEmailAddressVerification,
			get createdSessionId() {
				return signUpState.createdSessionId;
			},
		},
	};
}

export function useSSO() {
	return {
		startSSOFlow: clerkMocks.startSSOFlow,
	};
}

export const isClerkAPIResponseError = clerkMocks.isClerkAPIResponseError;

resetClerkMocks();
