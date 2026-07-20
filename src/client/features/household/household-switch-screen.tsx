import { SymbolView } from "expo-symbols";
import { type ReactNode, useState } from "react";
import {
	ActivityIndicator,
	FlatList,
	Text,
	TextInput,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { ScreenScaffold } from "@/client/app-shell/screen-scaffold";
import {
	type AuthenticatedAppSession,
	type AuthenticatedAppSessionReloadOptions,
	type AuthenticatedAppSessionState,
	useAuthenticatedAppSession,
} from "@/client/session";
import { AppButton } from "@/client/ui/app-button";
import {
	type GroupPosition,
	groupPosition,
	InitialsAvatar,
	SurfaceCard,
	SurfaceRow,
	SurfaceSection,
} from "@/client/ui/settings-surface";
import {
	type HouseholdSwitchOperation,
	type HouseholdSwitchState,
	useHouseholdSwitch,
} from "./use-household-switch";

type HouseholdRow = AuthenticatedAppSession["households"][number];
type HouseholdFormMode = "none" | "create" | "join";

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
	const [formMode, setFormMode] = useState<HouseholdFormMode>("none");

	return (
		<ScreenScaffold label="Households" title="Switch Household">
			<FlatList
				contentContainerStyle={styles.listContent}
				contentInsetAdjustmentBehavior="automatic"
				data={session.households}
				keyboardShouldPersistTaps="handled"
				keyExtractor={(household) => household.id}
				ListHeaderComponent={
					<View style={styles.listHeader}>
						<Text style={styles.intro}>
							Choose the Household you want to use.
						</Text>
						{state.notice ? (
							<SurfaceCard>
								<Text style={styles.notice}>{state.notice}</Text>
							</SurfaceCard>
						) : null}
						<Text style={styles.sectionTitle}>Your Households</Text>
					</View>
				}
				ListFooterComponent={
					<HouseholdActions
						formMode={formMode}
						onCodeChange={onCodeChange}
						onCreateHousehold={onCreateHousehold}
						onFormModeChange={setFormMode}
						onHouseholdNameChange={onHouseholdNameChange}
						onJoinByCode={onJoinByCode}
						state={state}
					/>
				}
				renderItem={({ item, index }) => (
					<HouseholdListRow
						household={item}
						onSwitchHousehold={onSwitchHousehold}
						operation={state.operation}
						position={groupPosition(index, session.households.length)}
					/>
				)}
			/>
		</ScreenScaffold>
	);
}

function HouseholdListRow({
	household,
	operation,
	position,
	onSwitchHousehold,
}: {
	household: HouseholdRow;
	operation: HouseholdSwitchOperation;
	position: GroupPosition;
	onSwitchHousehold: (householdId: string) => void;
}) {
	const busy = operation.status !== "idle";
	const switching =
		operation.status === "switchingHousehold" &&
		operation.householdId === household.id;
	const roleLabel = household.role === "owner" ? "Owner" : "Member";

	return (
		<SurfaceCard
			groupPosition={position}
			tone={household.isActive ? "selected" : "default"}
		>
			<SurfaceRow
				accessibilityHint={
					household.isActive ? undefined : `Switches to ${household.name}`
				}
				detail={switching ? `${roleLabel} · Switching` : roleLabel}
				disabled={household.isActive || busy}
				divider={position === "first" || position === "middle"}
				label={household.name}
				leading={<InitialsAvatar label={household.name} />}
				onPress={() => onSwitchHousehold(household.id)}
				selected={household.isActive}
				trailing={<HouseholdRowTrailing selected={household.isActive} />}
			/>
		</SurfaceCard>
	);
}

function HouseholdRowTrailing({ selected }: { selected: boolean }) {
	const { theme } = useUnistyles();
	if (!selected) {
		return (
			<SymbolView
				accessibilityElementsHidden
				accessible={false}
				name="chevron.right"
				size={14}
				tintColor={theme.colors.mutedForeground}
				weight="semibold"
			/>
		);
	}

	return (
		<View style={styles.currentTrailing}>
			<Text style={styles.currentLabel}>Current</Text>
			<View style={styles.currentCheck}>
				<SymbolView
					accessibilityElementsHidden
					accessible={false}
					name="checkmark"
					size={13}
					tintColor={theme.colors.primaryForeground}
					weight="bold"
				/>
			</View>
		</View>
	);
}

function HouseholdActions({
	formMode,
	onCodeChange,
	onCreateHousehold,
	onFormModeChange,
	onHouseholdNameChange,
	onJoinByCode,
	state,
}: {
	formMode: HouseholdFormMode;
	onCodeChange: (code: string) => void;
	onCreateHousehold: () => void;
	onFormModeChange: (mode: HouseholdFormMode) => void;
	onHouseholdNameChange: (name: string) => void;
	onJoinByCode: () => void;
	state: HouseholdSwitchState;
}) {
	return (
		<View style={styles.actions}>
			<SurfaceSection title="Add a Household">
				<SurfaceCard>
					<SurfaceRow
						divider
						label="Create Household"
						onPress={() =>
							onFormModeChange(formMode === "create" ? "none" : "create")
						}
						symbol="plus"
					/>
					<SurfaceRow
						label="Join with Code"
						onPress={() =>
							onFormModeChange(formMode === "join" ? "none" : "join")
						}
						symbol="link"
					/>
				</SurfaceCard>
				{formMode === "create" ? (
					<CreateHouseholdForm
						onCreateHousehold={onCreateHousehold}
						onHouseholdNameChange={onHouseholdNameChange}
						state={state}
					/>
				) : null}
				{formMode === "join" ? (
					<JoinByCodeForm
						onCodeChange={onCodeChange}
						onJoinByCode={onJoinByCode}
						state={state}
					/>
				) : null}
			</SurfaceSection>
			<Text style={styles.footer}>
				Your Lists change with the selected Household.
			</Text>
		</View>
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
		<SurfaceCard>
			<View style={styles.form}>
				<Text style={styles.fieldLabel}>Household Name</Text>
				<TextInput
					accessibilityLabel="New Household name"
					autoCapitalize="words"
					editable={!busy}
					onChangeText={onHouseholdNameChange}
					placeholder="Optional name"
					style={styles.input}
					value={state.householdName}
				/>
				<AppButton
					disabled={busy}
					label={creating ? "Creating" : "Create Household"}
					onPress={onCreateHousehold}
					variant="primary"
				/>
			</View>
		</SurfaceCard>
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
		<SurfaceCard>
			<View style={styles.form}>
				<Text style={styles.fieldLabel}>Household Join Code</Text>
				<TextInput
					accessibilityLabel="Household Join Code"
					autoCapitalize="characters"
					editable={!busy}
					onChangeText={onCodeChange}
					placeholder="ABCDEFGH"
					style={styles.input}
					value={state.code}
				/>
				<AppButton
					disabled={busy}
					label={joining ? "Joining" : "Join Household"}
					onPress={onJoinByCode}
					variant="primary"
				/>
			</View>
		</SurfaceCard>
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
				<CenteredStatus title="Household unavailable">
					<Text style={styles.statusBody}>{state.message}</Text>
					<AppButton label="Try again" onPress={onRetry} variant="primary" />
				</CenteredStatus>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView edges={["top", "bottom"]} style={styles.root}>
			<CenteredStatus title="Preparing your Household">
				<ActivityIndicator />
			</CenteredStatus>
		</SafeAreaView>
	);
}

function CenteredStatus({
	title,
	children,
}: {
	title: string;
	children?: ReactNode;
}) {
	return (
		<View style={styles.centered}>
			<Text style={styles.statusTitle}>{title}</Text>
			{children}
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	root: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
	listContent: {
		paddingHorizontal: theme.spacing(5),
		paddingBottom: theme.spacing(12),
	},
	listHeader: {
		gap: theme.spacing(4),
	},
	intro: {
		...theme.typography.body,
		color: theme.colors.mutedForeground,
	},
	notice: {
		...theme.typography.callout,
		color: theme.colors.foreground,
		padding: theme.spacing(4),
	},
	sectionTitle: {
		...theme.typography.overline,
		color: theme.colors.mutedForeground,
		textTransform: "uppercase",
		paddingHorizontal: theme.spacing(1),
		paddingTop: theme.spacing(2),
		paddingBottom: theme.spacing(2),
	},
	currentTrailing: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(2),
	},
	currentLabel: {
		...theme.typography.caption,
		color: theme.colors.primary,
	},
	currentCheck: {
		width: theme.spacing(7),
		height: theme.spacing(7),
		alignItems: "center",
		justifyContent: "center",
		borderRadius: theme.radii.pill,
		backgroundColor: theme.colors.primary,
	},
	actions: {
		gap: theme.spacing(4),
		paddingTop: theme.spacing(6),
	},
	form: {
		gap: theme.spacing(3),
		padding: theme.spacing(4),
	},
	fieldLabel: {
		...theme.typography.captionStrong,
		color: theme.colors.mutedForeground,
		textTransform: "uppercase",
	},
	input: {
		minHeight: theme.spacing(12),
		paddingHorizontal: theme.spacing(3),
		borderWidth: theme.borders.hairline,
		borderColor: theme.colors.input,
		borderRadius: theme.radii.control,
		backgroundColor: theme.colors.glassTint,
		color: theme.colors.foreground,
		...theme.typography.body,
	},
	footer: {
		...theme.typography.caption,
		color: theme.colors.mutedForeground,
		paddingHorizontal: theme.spacing(1),
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
		color: theme.colors.foreground,
		textAlign: "center",
	},
	statusBody: {
		...theme.typography.body,
		color: theme.colors.mutedForeground,
		textAlign: "center",
	},
}));
