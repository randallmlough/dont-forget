import { useRouter } from "expo-router";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { useAuthenticatedAppSession } from "@/components/session";
import type { AuthenticatedAppSession } from "@/lib/services/session";
import {
	type HouseholdSwitchState,
	useHouseholdSwitch,
} from "./use-household-switch";

type HouseholdRow = AuthenticatedAppSession["households"][number];

export default function HouseholdSwitchScreen() {
	const { session, reloadSession } = useAuthenticatedAppSession();
	if (!session) return null;

	return (
		<HouseholdSwitchContent session={session} reloadSession={reloadSession} />
	);
}

function HouseholdSwitchContent({
	session,
	reloadSession,
}: {
	session: AuthenticatedAppSession;
	reloadSession: () => void;
}) {
	const switchModel = useHouseholdSwitch(session, reloadSession);
	return (
		<HouseholdSwitchView
			session={session}
			state={switchModel.state}
			onCodeChange={switchModel.setCode}
			onJoinByCode={switchModel.joinByCode}
			onSwitchHousehold={switchModel.switchHousehold}
		/>
	);
}

export function HouseholdSwitchView({
	session,
	state,
	onCodeChange,
	onJoinByCode,
	onSwitchHousehold,
}: {
	session: AuthenticatedAppSession;
	state: HouseholdSwitchState;
	onCodeChange: (code: string) => void;
	onJoinByCode: () => void;
	onSwitchHousehold: (householdId: string) => void;
}) {
	const router = useRouter();

	return (
		<SafeAreaView edges={["top", "bottom"]} style={styles.root}>
			<View style={styles.header}>
				<Text style={styles.headerLabel}>Switch Household</Text>
				<Text style={styles.headerTitle} numberOfLines={1}>
					{session.activeHousehold.name}
				</Text>
			</View>
			<View style={styles.topActions}>
				<SecondaryButton
					label="Settings"
					onPress={() => router.replace("/household/settings")}
				/>
			</View>
			<FlatList
				data={session.households}
				keyExtractor={(household) => household.id}
				contentContainerStyle={styles.listContent}
				ListHeaderComponent={
					<JoinByCodeForm
						state={state}
						onCodeChange={onCodeChange}
						onJoinByCode={onJoinByCode}
					/>
				}
				renderItem={({ item }) => (
					<HouseholdListRow
						household={item}
						working={state.working}
						onSwitchHousehold={onSwitchHousehold}
					/>
				)}
			/>
		</SafeAreaView>
	);
}

function JoinByCodeForm({
	state,
	onCodeChange,
	onJoinByCode,
}: {
	state: HouseholdSwitchState;
	onCodeChange: (code: string) => void;
	onJoinByCode: () => void;
}) {
	const joining = state.working === "join";
	return (
		<View style={styles.panel}>
			<Text style={styles.panelTitle}>Join Household with Code</Text>
			<TextInput
				accessibilityLabel="Household Join Code"
				autoCapitalize="characters"
				editable={!joining}
				onChangeText={onCodeChange}
				placeholder="ABCDEFGH"
				style={styles.input}
				value={state.code}
			/>
			<PrimaryButton
				label={joining ? "Joining" : "Join Household"}
				onPress={onJoinByCode}
				disabled={joining}
			/>
			{state.notice ? (
				<Text style={styles.noticeText}>{state.notice}</Text>
			) : null}
			<Text style={styles.sectionTitle}>Your Households</Text>
		</View>
	);
}

function HouseholdListRow({
	household,
	working,
	onSwitchHousehold,
}: {
	household: HouseholdRow;
	working: HouseholdSwitchState["working"];
	onSwitchHousehold: (householdId: string) => void;
}) {
	const switching = working === "switch";
	return (
		<View style={styles.row}>
			<View style={styles.rowTextGroup}>
				<View style={styles.nameRow}>
					<Text style={styles.rowTitle} numberOfLines={1}>
						{household.name}
					</Text>
					{household.isActive ? (
						<View style={styles.badge}>
							<Text style={styles.badgeText}>Current</Text>
						</View>
					) : null}
				</View>
				<Text style={styles.rowSubtitle}>
					{household.role === "owner" ? "Owner" : "Member"}
				</Text>
			</View>
			<SecondaryButton
				label={
					household.isActive ? "Selected" : switching ? "Switching" : "Switch"
				}
				onPress={() => onSwitchHousehold(household.id)}
				disabled={household.isActive || switching}
			/>
		</View>
	);
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

function SecondaryButton({
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
				styles.secondaryButton,
				pressed ? styles.pressed : undefined,
				disabled ? styles.disabled : undefined,
			]}
		>
			<Text style={styles.secondaryButtonLabel}>{label}</Text>
		</Pressable>
	);
}

const styles = StyleSheet.create((theme) => ({
	root: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
	header: {
		paddingHorizontal: theme.spacing(5),
		paddingTop: theme.spacing(4.5),
		paddingBottom: theme.spacing(3),
		backgroundColor: theme.colors.surface,
		borderBottomWidth: theme.borders.hairline,
		borderBottomColor: theme.colors.border,
	},
	headerLabel: {
		...theme.typography.captionStrong,
		color: theme.colors.textMuted,
	},
	headerTitle: {
		...theme.typography.headline,
		color: theme.colors.text,
	},
	topActions: {
		padding: theme.spacing(4),
		backgroundColor: theme.colors.surface,
	},
	listContent: {
		padding: theme.spacing(4),
		gap: theme.spacing(3),
	},
	panel: {
		gap: theme.spacing(3),
		padding: theme.spacing(4),
		borderWidth: theme.borders.thin,
		borderColor: theme.colors.border,
		borderRadius: theme.radii.card,
		backgroundColor: theme.colors.surface,
	},
	panelTitle: {
		...theme.typography.headline,
		color: theme.colors.text,
	},
	input: {
		minHeight: theme.spacing(12),
		paddingHorizontal: theme.spacing(3),
		borderWidth: theme.borders.thin,
		borderColor: theme.colors.inputBorder,
		borderRadius: theme.radii.control,
		backgroundColor: theme.colors.surface,
		color: theme.colors.text,
		...theme.typography.body,
	},
	noticeText: {
		...theme.typography.callout,
		color: theme.colors.destructive,
	},
	sectionTitle: {
		...theme.typography.captionStrong,
		color: theme.colors.textMuted,
		textTransform: "uppercase",
		marginTop: theme.spacing(2),
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(3),
		padding: theme.spacing(4),
		borderWidth: theme.borders.thin,
		borderColor: theme.colors.border,
		borderRadius: theme.radii.card,
		backgroundColor: theme.colors.surface,
	},
	rowTextGroup: {
		flex: 1,
		minWidth: 0,
	},
	nameRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(2),
	},
	rowTitle: {
		...theme.typography.body,
		fontWeight: theme.fontWeights.semibold,
		color: theme.colors.text,
		flexShrink: 1,
	},
	rowSubtitle: {
		...theme.typography.caption,
		color: theme.colors.textMuted,
	},
	badge: {
		paddingHorizontal: theme.spacing(2),
		paddingVertical: theme.spacing(1),
		borderRadius: theme.radii.control,
		backgroundColor: theme.colors.primary,
	},
	badgeText: {
		...theme.typography.captionStrong,
		color: theme.colors.inverseText,
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
	secondaryButton: {
		minHeight: theme.spacing(11),
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: theme.spacing(3),
		borderRadius: theme.radii.control,
		borderWidth: theme.borders.thin,
		borderColor: theme.colors.border,
		backgroundColor: theme.colors.surface,
	},
	secondaryButtonLabel: {
		...theme.typography.callout,
		fontWeight: theme.fontWeights.semibold,
		color: theme.colors.text,
	},
	pressed: {
		opacity: theme.opacities.pressed,
	},
	disabled: {
		opacity: theme.opacities.disabled,
	},
}));
