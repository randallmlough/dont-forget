import { useLocalSearchParams } from "expo-router";
import { usePublicHouseholdEntry } from "@/client/features/household/use-public-household-entry";
import { useAuthenticatedAppSession } from "@/client/session";
import { firstParam, PublicHouseholdEntryView } from "../public-household-entry";

export default function InvitationAcceptScreen() {
	const params = useLocalSearchParams<{ token?: string }>();
	const { reloadSession } = useAuthenticatedAppSession();
	const entry = usePublicHouseholdEntry({
		kind: "invitation",
		secret: firstParam(params.token),
		reloadSession,
	});

	return (
		<PublicHouseholdEntryView
			state={entry.state}
			primaryLabel="Accept Invitation"
			onSubmit={entry.submit}
		/>
	);
}
