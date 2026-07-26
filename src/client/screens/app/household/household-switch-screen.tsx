import {
	autocorrectionDisabled,
	textInputAutocapitalization,
} from "@expo/ui/swift-ui/modifiers";
import { SymbolView } from "expo-symbols";
import { type ReactNode, useState } from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { ScreenScaffold } from "@/client/app-shell/screen-scaffold";
import {
	type HouseholdSwitchOperation,
	type HouseholdSwitchState,
	useHouseholdSwitch,
} from "@/client/features/household/use-household-switch";
import {
	type AuthenticatedAppSession,
	type AuthenticatedAppSessionReloadOptions,
	type AuthenticatedAppSessionState,
	useAuthenticatedAppSession,
} from "@/client/session";
import { Avatar, AvatarFallback } from "@/client/ui/avatar";
import { Badge } from "@/client/ui/badge";
import { Button } from "@/client/ui/button";
import { Card, CardContent } from "@/client/ui/card";
import { Field, FieldError, FieldLabel } from "@/client/ui/field";
import { Form } from "@/client/ui/form";
import { Input } from "@/client/ui/input";
import {
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemMedia,
	ItemPressable,
	ItemSeparator,
	ItemTitle,
} from "@/client/ui/item";
import { ScreenSection } from "@/client/ui/screen-section";

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
				ItemSeparatorComponent={ListItemSeparator}
				ListHeaderComponent={
					<View style={styles.listHeader}>
						<Text style={styles.intro}>
							Choose the Household you want to use.
						</Text>
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
				renderItem={({ item }) => (
					<HouseholdListRow
						household={item}
						onSwitchHousehold={onSwitchHousehold}
						operation={state.operation}
					/>
				)}
			/>
		</ScreenScaffold>
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
	const busy = operation.status !== "idle";
	const switching =
		operation.status === "switchingHousehold" &&
		operation.householdId === household.id;
	const roleLabel = household.role === "owner" ? "Owner" : "Member";

	return (
		<ItemPressable
			accessibilityHint={
				household.isActive ? undefined : `Switches to ${household.name}`
			}
			accessibilityLabel={household.name}
			accessibilityState={{ selected: household.isActive }}
			disabled={household.isActive || busy}
			onPress={() => onSwitchHousehold(household.id)}
			size="sm"
			variant={household.isActive ? "muted" : "default"}
		>
			<ItemMedia>
				<Avatar accessibilityLabel={household.name}>
					<AvatarFallback name={household.name} />
				</Avatar>
			</ItemMedia>
			<ItemContent>
				<ItemTitle>{household.name}</ItemTitle>
				<ItemDescription>
					{switching ? `${roleLabel} · Switching` : roleLabel}
				</ItemDescription>
			</ItemContent>
			<ItemActions>
				<HouseholdRowTrailing selected={household.isActive} />
			</ItemActions>
		</ItemPressable>
	);
}

function ListItemSeparator() {
	return <ItemSeparator />;
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
		<Badge style={styles.currentBadge}>
			<SymbolView
				accessibilityElementsHidden
				accessible={false}
				name="checkmark"
				size={12}
				tintColor={theme.colors.primaryForeground}
				weight="bold"
			/>
			<Text style={styles.currentBadgeLabel}>Current</Text>
		</Badge>
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
			<ScreenSection title="Add a Household">
				<ItemGroup variant="outline">
					<HouseholdActionItem
						title="Create Household"
						onPress={() =>
							onFormModeChange(formMode === "create" ? "none" : "create")
						}
						symbol="plus"
					/>
					<ItemSeparator />
					<HouseholdActionItem
						title="Join with Code"
						onPress={() =>
							onFormModeChange(formMode === "join" ? "none" : "join")
						}
						symbol="link"
					/>
				</ItemGroup>
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
			</ScreenSection>
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
		<Card>
			<CardContent style={styles.formCardContent}>
				<Form>
					<Field disabled={busy}>
						<FieldLabel>Household Name</FieldLabel>
						<Input
							accessibilityLabel="New Household name"
							defaultValue={state.householdName}
							modifiers={[textInputAutocapitalization("words")]}
							onTextChange={onHouseholdNameChange}
							placeholder="Optional name"
						/>
					</Field>
					<Button disabled={busy} onPress={onCreateHousehold}>
						{creating ? "Creating" : "Create Household"}
					</Button>
				</Form>
			</CardContent>
		</Card>
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
	const [validationMessage, setValidationMessage] = useState<string | null>(
		null,
	);
	const busy = state.operation.status !== "idle";
	const joining = state.operation.status === "joiningByCode";

	function joinByCode() {
		if (!state.code.trim()) {
			setValidationMessage("Enter a Household Join Code.");
			return;
		}
		setValidationMessage(null);
		onJoinByCode();
	}

	return (
		<Card>
			<CardContent style={styles.formCardContent}>
				<Form>
					<Field disabled={busy}>
						<FieldLabel>Household Join Code</FieldLabel>
						<Input
							accessibilityLabel="Household Join Code"
							defaultValue={state.code}
							modifiers={[
								textInputAutocapitalization("characters"),
								autocorrectionDisabled(),
							]}
							onTextChange={onCodeChange}
							placeholder="ABCDEFGH"
						/>
						<FieldError errors={validationMessage ? [validationMessage] : []} />
					</Field>
					<Button disabled={busy} onPress={joinByCode}>
						{joining ? "Joining" : "Join Household"}
					</Button>
				</Form>
			</CardContent>
		</Card>
	);
}

function HouseholdActionItem({
	onPress,
	symbol,
	title,
}: {
	onPress: () => void;
	symbol: "link" | "plus";
	title: string;
}) {
	const { theme } = useUnistyles();
	return (
		<ItemPressable accessibilityLabel={title} onPress={onPress} size="sm">
			<ItemMedia variant="icon">
				<SymbolView
					accessibilityElementsHidden
					accessible={false}
					name={symbol}
					size={theme.spacing(4)}
					tintColor={theme.colors.foreground}
					weight="medium"
				/>
			</ItemMedia>
			<ItemContent>
				<ItemTitle>{title}</ItemTitle>
			</ItemContent>
			<ItemActions>
				<SymbolView
					accessibilityElementsHidden
					accessible={false}
					name="chevron.right"
					size={theme.spacing(3.5)}
					tintColor={theme.colors.mutedForeground}
					weight="semibold"
				/>
			</ItemActions>
		</ItemPressable>
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
					<Button onPress={onRetry}>Try again</Button>
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
	sectionTitle: {
		...theme.typography.overline,
		color: theme.colors.mutedForeground,
		textTransform: "uppercase",
		paddingHorizontal: theme.spacing(1),
		paddingTop: theme.spacing(2),
		paddingBottom: theme.spacing(2),
	},
	currentBadge: {
		gap: theme.spacing(1),
		borderRadius: theme.radii.full,
	},
	currentBadgeLabel: {
		...theme.typography.captionStrong,
		color: theme.colors.primaryForeground,
	},
	actions: {
		gap: theme.spacing(4),
		paddingTop: theme.spacing(6),
	},
	formCardContent: {
		padding: theme.spacing(4),
		paddingTop: theme.spacing(4),
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
