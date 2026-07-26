import { ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import type { PublicHouseholdEntryState } from "@/client/features/household/use-public-household-entry";
import { Button } from "@/client/ui/button";
import { Card, CardDescription, CardTitle } from "@/client/ui/card";

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
			<Card style={styles.panel}>
				{state.status === "loading" ? (
					<>
						<CardTitle style={styles.title}>Loading Household</CardTitle>
						<ActivityIndicator />
					</>
				) : state.status === "unavailable" ? (
					<>
						<CardTitle style={styles.title}>Household unavailable</CardTitle>
						<CardDescription style={styles.body}>
							{state.message}
						</CardDescription>
					</>
				) : state.status === "complete" ? (
					<>
						<CardTitle style={styles.title}>Household joined</CardTitle>
						<CardDescription style={styles.body}>
							{state.message}
						</CardDescription>
					</>
				) : (
					<>
						<CardTitle style={styles.title}>{state.householdName}</CardTitle>
						<CardDescription style={styles.body}>
							{state.kind === "invitation"
								? `${state.inviterDisplayName ?? "A Member"} invited you to join this Household.`
								: "Join this Household with the shared Household Join Code link."}
						</CardDescription>
						<Button onPress={onSubmit} disabled={state.working}>
							{state.working ? "Joining" : primaryLabel}
						</Button>
					</>
				)}
			</Card>
		</SafeAreaView>
	);
}

export function firstParam(
	value: string | string[] | undefined,
): string | null {
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
		borderRadius: theme.radii["2xl"],
	},
	title: {
		...theme.typography.title,
		color: theme.colors.foreground,
	},
	body: {
		...theme.typography.body,
		color: theme.colors.mutedForeground,
	},
}));
