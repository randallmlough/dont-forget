import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { useAuthenticatedAppSession } from "@/client/session";
import { HouseholdButton } from "./household-button";
import {
	type PublicHouseholdEntryState,
	usePublicHouseholdEntry,
} from "./use-public-household-entry";

export function InvitationAcceptScreen() {
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

export function HouseholdJoinScreen() {
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

export function PublicHouseholdEntryView({
	state,
	primaryLabel,
	onSubmit,
}: {
	state: PublicHouseholdEntryState;
	primaryLabel: string;
	onSubmit: () => void;
}) {
	return (
		<SafeAreaView edges={["top", "bottom"]} style={styles.root}>
			<View style={styles.panel}>
				{state.status === "loading" ? (
					<>
						<Text style={styles.title}>Loading Household</Text>
						<ActivityIndicator />
					</>
				) : state.status === "unavailable" ? (
					<>
						<Text style={styles.title}>Household unavailable</Text>
						<Text style={styles.body}>{state.message}</Text>
					</>
				) : state.status === "complete" ? (
					<>
						<Text style={styles.title}>Household joined</Text>
						<Text style={styles.body}>{state.message}</Text>
					</>
				) : (
					<>
						<Text style={styles.title}>{state.householdName}</Text>
						<Text style={styles.body}>
							{state.kind === "invitation"
								? `${state.inviterDisplayName ?? "A Member"} invited you to join this Household.`
								: "Join this Household with the shared Household Join Code link."}
						</Text>
						{state.error ? (
							<Text style={styles.errorText}>{state.error}</Text>
						) : null}
						<HouseholdButton
							variant="primary"
							label={state.working ? "Joining" : primaryLabel}
							onPress={onSubmit}
							disabled={state.working}
						/>
					</>
				)}
			</View>
		</SafeAreaView>
	);
}

function firstParam(value: string | string[] | undefined): string | null {
	if (typeof value === "string") return value;
	return value?.[0] ?? null;
}

const styles = StyleSheet.create((theme) => ({
	root: {
		flex: 1,
		justifyContent: "center",
		padding: theme.spacing(5),
		backgroundColor: theme.colors.background,
	},
	panel: {
		gap: theme.spacing(4),
		padding: theme.spacing(5),
		borderWidth: theme.borders.thin,
		borderColor: theme.colors.border,
		borderRadius: theme.radii.card,
		backgroundColor: theme.colors.card,
	},
	title: {
		...theme.typography.title,
		color: theme.colors.foreground,
	},
	body: {
		...theme.typography.body,
		color: theme.colors.mutedForeground,
	},
	errorText: {
		...theme.typography.callout,
		color: theme.colors.destructive,
	},
}));
