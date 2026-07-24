import { useLocalSearchParams } from "expo-router";
import { usePublicHouseholdEntry } from "@/client/features/household/use-public-household-entry";
import { useAuthenticatedAppSession } from "@/client/session";
import {
	firstParam,
	PublicHouseholdEntryView,
} from "../public-household-entry";

export default function HouseholdJoinScreen() {
	const params = useLocalSearchParams<{ code?: string }>();
	const { reloadSession } = useAuthenticatedAppSession();
	const entry = usePublicHouseholdEntry({
		kind: "joinCode",
		secret: firstParam(params.code),
		reloadSession,
	});

	return (
		<PublicHouseholdEntryView
			state={entry.state}
			primaryLabel="Join Household"
			onSubmit={entry.submit}
		/>
	);
}
