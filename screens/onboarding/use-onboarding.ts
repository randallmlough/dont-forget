import { useAuth } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { useAuthenticatedAppSession } from "@/components/session";
import { track } from "@/lib/analytics";
import { createUsersApiClient } from "@/lib/client-api/users";
import { ONBOARDING_STEPS } from "./steps";

export type OnboardingState = {
	currentStepIndex: number;
	currentStep: (typeof ONBOARDING_STEPS)[number];
	canComplete: boolean;
	completionError: string | null;
	isCompleting: boolean;
	isFirstStep: boolean;
	isLastStep: boolean;
	steps: typeof ONBOARDING_STEPS;
};

export type OnboardingActions = {
	back: () => void;
	next: () => void;
	skip: () => void;
	finish: () => void;
};

export function useOnboarding(): {
	state: OnboardingState;
	actions: OnboardingActions;
} {
	const { getToken } = useAuth();
	const router = useRouter();
	const {
		reloadSession,
		session,
		state: sessionState,
	} = useAuthenticatedAppSession();
	const [currentStepIndex, setCurrentStepIndex] = useState(0);
	const [completionState, setCompletionState] = useState<
		"idle" | "submitting" | "error"
	>("idle");
	const completedRef = useRef(false);
	const currentStep = ONBOARDING_STEPS[currentStepIndex] ?? ONBOARDING_STEPS[0];
	const isFirstStep = currentStepIndex === 0;
	const isLastStep = currentStepIndex === ONBOARDING_STEPS.length - 1;
	const isCompleting = completionState === "submitting";
	const canComplete = sessionState.status === "ready" && session !== null;

	async function complete(skipped: boolean) {
		if (completedRef.current || !canComplete) return;
		completedRef.current = true;
		setCompletionState("submitting");
		try {
			const usersClient = createUsersApiClient({ getToken });
			await usersClient.completeOnboarding();
			track("onboarding_completed", {
				skipped,
				last_step: currentStep.key,
			});
			reloadSession({ retireCurrent: true });
			router.replace("/");
		} catch {
			completedRef.current = false;
			setCompletionState("error");
		}
	}

	function back() {
		setCurrentStepIndex((index) => Math.max(0, index - 1));
	}

	function next() {
		if (isLastStep) {
			complete(false);
			return;
		}
		setCurrentStepIndex((index) =>
			Math.min(ONBOARDING_STEPS.length - 1, index + 1),
		);
	}

	return {
		state: {
			currentStepIndex,
			currentStep,
			canComplete,
			completionError:
				completionState === "error"
					? "Unable to finish onboarding. Please try again."
					: null,
			isCompleting,
			isFirstStep,
			isLastStep,
			steps: ONBOARDING_STEPS,
		},
		actions: {
			back,
			next,
			skip: () => complete(true),
			finish: () => complete(false),
		},
	};
}
