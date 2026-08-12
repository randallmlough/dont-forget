import { createFileRoute } from "@tanstack/react-router";

import { OpenInAppPage } from "../../open-in-app-page";

export const Route = createFileRoute("/households/join")({
	component: HouseholdJoinPage,
});

function HouseholdJoinPage() {
	return (
		<OpenInAppPage
			path="/households/join"
			message="This Household Join Code opens in the Don't Forget app."
		/>
	);
}
