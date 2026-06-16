import { useRouter } from "expo-router";
import {
	ActivityIndicator,
	FlatList,
	Text,
	TextInput,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import {
	type AuthenticatedAppSessionReloadOptions,
	type AuthenticatedAppSessionState,
	useAuthenticatedAppSession,
} from "@/components/session";
import type { AuthenticatedAppSession } from "@/lib/services/session";
import { HouseholdButton } from "./household-button";
import {
	type HouseholdSwitchOperation,
	type HouseholdSwitchState,
	useHouseholdSwitch,
} from "./use-household-switch";

type HouseholdRow = AuthenticatedAppSession["households"][number];

export default function HouseholdSwitchScreen() {
	const { state, session, retry, reloadSession } = useAuthenticatedAppSession();
	if (!session) return <SwitchSessionState state={state} onRetry={retry} />;

	return (
		<HouseholdSwitchContent session={session} reloadSession={reloadSession} />
	);
}

function HouseholdSwitchContent({
	session,
	reloadSession,
}: {
	session: AuthenticatedAppSession;
	reloadSession: (options?: AuthenticatedAppSessionReloadOptions) => void;
}) {
	const switchModel = useHouseholdSwitch(session, reloadSession);
	return (
		<HouseholdSwitchView
			session={session}
			state={switchModel.state}
			onCodeChange={switchModel.setCode}
			onHouseholdNameChange={switchModel.setHouseholdName}
			onCreateHousehold={switchModel.createHousehold}
			onJoinByCode={switchModel.joinByCode}
			onSwitchHousehold={switchModel.switchHousehold}
		/>
	);
}

export function HouseholdSwitchView({
	session,
	state,
	onCodeChange,
	onHouseholdNameChange,
	onCreateHousehold,
	onJoinByCode,
	onSwitchHousehold,
}: {
	session: AuthenticatedAppSession;
	state: HouseholdSwitchState;
	onCodeChange: (code: string) => void;
	onHouseholdNameChange: (name: string) => void;
	onCreateHousehold: () => void;
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
				<HouseholdButton
					label="Settings"
					onPress={() => router.replace("/household/settings")}
				/>
			</View>
			<FlatList
				data={session.households}
				keyExtractor={(household) => household.id}
				contentContainerStyle={styles.listContent}
				ListHeaderComponent={
					<View style={styles.headerForms}>
						<CreateHouseholdForm
							state={state}
							onHouseholdNameChange={onHouseholdNameChange}
							onCreateHousehold={onCreateHousehold}
						/>
						<JoinByCodeForm
							state={state}
							onCodeChange={onCodeChange}
							onJoinByCode={onJoinByCode}
						/>
						{state.notice ? (
							<Text style={styles.noticeText}>{state.notice}</Text>
						) : null}
						<Text style={styles.sectionTitle}>Your Households</Text>
					</View>
				}
				renderItem={({ item }) => (
					<HouseholdListRow
						household={item}
						operation={state.operation}
						onSwitchHousehold={onSwitchHousehold}
					/>
				)}
			/>
		</SafeAreaView>
	);
}

function CreateHouseholdForm({
	state,
	onHouseholdNameChange,
	onCreateHousehold,
}: {
	state: HouseholdSwitchState;
	onHouseholdNameChange: (name: string) => void;
	onCreateHousehold: () => void;
}) {
	const busy = state.operation.status !== "idle";
	const creating = state.operation.status === "creatingHousehold";
	return (
		<View style={styles.panel}>
			<Text style={styles.panelTitle}>Create Household</Text>
			<TextInput
				accessibilityLabel="New Household name"
				autoCapitalize="words"
				editable={!busy}
				onChangeText={onHouseholdNameChange}
				placeholder="Optional name"
				style={styles.input}
				value={state.householdName}
			/>
			<HouseholdButton
				variant="primary"
				label={creating ? "Creating" : "Create Household"}
				onPress={onCreateHousehold}
				disabled={busy}
			/>
		</View>
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
	const busy = state.operation.status !== "idle";
	const joining = state.operation.status === "joiningByCode";
	return (
		<View style={styles.panel}>
			<Text style={styles.panelTitle}>Join Household with Code</Text>
			<TextInput
				accessibilityLabel="Household Join Code"
				autoCapitalize="characters"
				editable={!busy}
				onChangeText={onCodeChange}
				placeholder="ABCDEFGH"
				style={styles.input}
				value={state.code}
			/>
			<HouseholdButton
				variant="primary"
				label={joining ? "Joining" : "Join Household"}
				onPress={onJoinByCode}
				disabled={busy}
			/>
		</View>
	);
}

function HouseholdListRow({
	household,
	operation,
	onSwitchHousehold,
}: {
	household: HouseholdRow;
	operation: HouseholdSwitchOperation;
	onSwitchHousehold: (householdId: string) => void;
}) {
	const switching =
		operation.status === "switchingHousehold" &&
		operation.householdId === household.id;
	const busy = operation.status !== "idle";
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
			<HouseholdButton
				label={
					household.isActive ? "Selected" : switching ? "Switching" : "Switch"
				}
				onPress={() => onSwitchHousehold(household.id)}
				disabled={household.isActive || busy}
			/>
		</View>
	);
}

function SwitchSessionState({
	state,
	onRetry,
}: {
	state: AuthenticatedAppSessionState;
	onRetry: () => void;
}) {
	if (state.status === "error") {
		return (
			<SafeAreaView edges={["top", "bottom"]} style={styles.root}>
				<View style={styles.centered}>
					<Text style={styles.statusTitle}>Household unavailable</Text>
					<Text style={styles.statusBody}>{state.message}</Text>
					<HouseholdButton
						variant="primary"
						label="Try again"
						onPress={onRetry}
					/>
				</View>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView edges={["top", "bottom"]} style={styles.root}>
			<View style={styles.centered}>
				<Text style={styles.statusTitle}>Preparing your Household</Text>
				<ActivityIndicator />
			</View>
		</SafeAreaView>
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
	headerForms: {
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
	centered: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: theme.spacing(3),
		padding: theme.spacing(6),
	},
	statusTitle: {
		...theme.typography.headline,
		color: theme.colors.text,
		textAlign: "center",
	},
	statusBody: {
		...theme.typography.body,
		color: theme.colors.textMuted,
		textAlign: "center",
	},
}));
