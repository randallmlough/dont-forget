import type { ReactElement } from "react";

export type OnboardingStep = {
	key: string;
	title: string;
	body: string;
	render?: () => ReactElement;
};

export const ONBOARDING_STEPS: OnboardingStep[] = [
	{
		key: "welcome",
		title: "Welcome to Don't Forget",
		body: "Share a Household List and keep Items in sync with the Members you shop with.",
	},
	{
		key: "share",
		title: "Share your Household",
		body: "Use Invitations or a Household Join Code when another User is ready to become a Member.",
	},
	{
		key: "done",
		title: "Start with Groceries",
		body: "Your first List is ready. Add Items now, or adjust Household settings later.",
	},
];
