import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { AuthenticatedAppSessionProvider } from "@/components/session";
import {
	type PublicHouseholdEntryState,
	usePublicHouseholdEntry,
} from "./use-public-household-entry";
import { useSessionReloadRedirect } from "./use-session-reload-redirect";

export function InvitationAcceptScreen() {
	const params = useLocalSearchParams<{ token?: string }>();
	const entry = usePublicHouseholdEntry({
		kind: "invitation",
		secret: firstParam(params.token),
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
	const entry = usePublicHouseholdEntry({
		kind: "joinCode",
		secret: firstParam(params.code),
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
						<AuthenticatedAppSessionProvider>
							<SessionReloadRedirect />
						</AuthenticatedAppSessionProvider>
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
						<PrimaryButton
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

function SessionReloadRedirect() {
	useSessionReloadRedirect();
	return null;
}

function PrimaryButton({
	label,
	onPress,
	disabled,
}: {
	label: string;
	onPress: () => void;
	disabled?: boolean;
}) {
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityState={{ disabled: Boolean(disabled) }}
			disabled={disabled}
			onPress={onPress}
			style={({ pressed }) => [
				styles.primaryButton,
				pressed ? styles.pressed : undefined,
				disabled ? styles.disabled : undefined,
			]}
		>
			<Text style={styles.primaryButtonLabel}>{label}</Text>
		</Pressable>
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
		backgroundColor: theme.colors.surface,
	},
	title: {
		...theme.typography.title,
		color: theme.colors.text,
	},
	body: {
		...theme.typography.body,
		color: theme.colors.textMuted,
	},
	errorText: {
		...theme.typography.callout,
		color: theme.colors.destructive,
	},
	primaryButton: {
		minHeight: theme.spacing(11),
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: theme.spacing(4),
		borderRadius: theme.radii.control,
		backgroundColor: theme.colors.primary,
	},
	primaryButtonLabel: {
		...theme.typography.controlLabel,
		color: theme.colors.inverseText,
	},
	pressed: {
		opacity: theme.opacities.pressed,
	},
	disabled: {
		opacity: theme.opacities.disabled,
	},
}));
