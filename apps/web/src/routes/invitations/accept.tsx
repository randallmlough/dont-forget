import { createFileRoute } from "@tanstack/react-router";

import { OpenInAppPage } from "../../open-in-app-page";

export const Route = createFileRoute("/invitations/accept")({
	component: InvitationAcceptPage,
});

function InvitationAcceptPage() {
	return (
		<OpenInAppPage
			path="/invitations/accept"
			message="This Invitation opens in the Don't Forget app."
		/>
	);
}
