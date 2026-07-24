import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import type { ReactNode } from "react";
import { useState } from "react";
import {
	ActivityIndicator,
	Alert,
	ScrollView,
	Text,
	TextInput,
	View,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { ScreenScaffold } from "@/client/app-shell/screen-scaffold";
import {
	type AuthenticatedAppSession,
	type AuthenticatedAppSessionReloadOptions,
	type AuthenticatedAppSessionState,
	useAuthenticatedAppSession,
} from "@/client/session";
import { Avatar, AvatarFallback } from "@/client/ui/avatar";
import { Button } from "@/client/ui/button";
import { Card, CardContent } from "@/client/ui/card";
import {
	Item,
	ItemActions,
	ItemActionsLabel,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemMedia,
	ItemPressable,
	ItemSeparator,
	ItemTitle,
} from "@/client/ui/item";
import { ScreenSection } from "@/client/ui/screen-section";
import {
	type HouseholdSettingsActions,
	type HouseholdSettingsOperation,
	type HouseholdSettingsState,
	useHouseholdSettings,
} from "./use-household-settings";

export default function HouseholdSettingsScreen() {
	const { state, session, retry, reloadSession } = useAuthenticatedAppSession();

	if (!session) {
		return (
			<HouseholdScreenShell label="Household" title="Household">
				<SessionState state={state} onRetry={retry} />
			</HouseholdScreenShell>
		);
	}

	return (
		<HouseholdSettingsContent session={session} reloadSession={reloadSession} />
	);
}

function HouseholdSettingsContent({
	session,
	reloadSession,
}: {
	session: AuthenticatedAppSession;
	reloadSession: (options?: AuthenticatedAppSessionReloadOptions) => void;
}) {
	const { state, actions } = useHouseholdSettings(
		session,
		undefined,
		reloadSession,
	);

	return (
		<HouseholdSettingsView session={session} state={state} actions={actions} />
	);
}

export function HouseholdSettingsView({
	session,
	state,
	actions,
}: {
	session: AuthenticatedAppSession;
	state: HouseholdSettingsState;
	actions: HouseholdSettingsActions;
}) {
	const router = useRouter();
	const householdName = householdNameForSettings(state, session);

	return (
		<HouseholdScreenShell label={householdName} title="Household">
			{state.status === "loading" ? (
				<CenteredStatus title="Loading Household">
					<ActivityIndicator />
				</CenteredStatus>
			) : state.status === "error" ? (
				<CenteredStatus title="Household unavailable">
					<Text style={styles.statusBody}>{state.message}</Text>
					<Button onPress={actions.retry}>Try again</Button>
				</CenteredStatus>
			) : (
				<HouseholdReadyView
					actions={actions}
					householdName={householdName}
					onOpenMembers={() => router.push("/household/members")}
					session={session}
					state={state}
				/>
			)}
		</HouseholdScreenShell>
	);
}

function HouseholdReadyView({
	actions,
	householdName,
	onOpenMembers,
	session,
	state,
}: {
	actions: HouseholdSettingsActions;
	householdName: string;
	onOpenMembers: () => void;
	session: AuthenticatedAppSession;
	state: Extract<HouseholdSettingsState, { status: "ready" }>;
}) {
	const roleLabel = session.activeMember.role === "owner" ? "Owner" : "Member";
	const memberCount = state.members.length;
	const invitationCount = state.invitations.length;

	return (
		<ScrollView
			contentContainerStyle={styles.content}
			contentInsetAdjustmentBehavior="automatic"
			keyboardShouldPersistTaps="handled"
		>
			{state.notice ? (
				<Card>
					<CardContent style={styles.noticeContent}>
						<Text style={styles.notice}>{state.notice}</Text>
					</CardContent>
				</Card>
			) : null}

			<Item variant="outline">
				<Avatar accessibilityLabel={householdName} size="xl">
					<AvatarFallback name={householdName} />
				</Avatar>
				<ItemContent>
					<ItemTitle style={styles.identityName}>{householdName}</ItemTitle>
					<ItemDescription style={styles.identityDetail}>
						{roleLabel} · {memberCountLabel(memberCount)}
					</ItemDescription>
				</ItemContent>
			</Item>

			<ScreenSection title="Household Details">
				<ItemGroup variant="outline">
					<HouseholdNameRow
						actions={actions}
						canRename={session.activeMember.role === "owner"}
						name={householdName}
						operation={state.operation}
					/>
					<ItemSeparator />
					<HouseholdDetailItem title="Your Membership" value={roleLabel} />
				</ItemGroup>
				<ItemGroup variant="outline">
					<ItemPressable
						accessibilityHint="Opens Member and Invitation management"
						accessibilityLabel="Members & Invitations"
						onPress={onOpenMembers}
						size="sm"
					>
						<ItemContent>
							<ItemTitle>Members & Invitations</ItemTitle>
							<ItemDescription>
								{memberCountLabel(memberCount)} ·{" "}
								{pendingInvitationLabel(invitationCount)}
							</ItemDescription>
						</ItemContent>
						<DisclosureIndicator />
					</ItemPressable>
				</ItemGroup>
			</ScreenSection>

			<ScreenSection title="Membership">
				<ItemGroup variant="outline">
					<LeaveHouseholdItem onPress={() => confirmLeaveHousehold(actions)} />
				</ItemGroup>
			</ScreenSection>
		</ScrollView>
	);
}

function HouseholdNameRow({
	actions,
	canRename,
	name,
	operation,
}: {
	actions: HouseholdSettingsActions;
	canRename: boolean;
	name: string;
	operation: HouseholdSettingsOperation;
}) {
	const { theme } = useUnistyles();
	const [editing, setEditing] = useState(false);
	const [draftName, setDraftName] = useState(name);
	const renaming = operation.status === "renamingHousehold";

	if (!editing) {
		const content = (
			<>
				<ItemContent>
					<ItemTitle>Household Name</ItemTitle>
				</ItemContent>
				<ItemActions>
					<ItemActionsLabel>{name}</ItemActionsLabel>
					{canRename ? (
						<SymbolView
							accessibilityElementsHidden
							accessible={false}
							name="chevron.right"
							size={theme.spacing(3.5)}
							tintColor={theme.colors.mutedForeground}
							weight="semibold"
						/>
					) : null}
				</ItemActions>
			</>
		);
		if (!canRename) return <Item size="sm">{content}</Item>;
		return (
			<ItemPressable
				accessibilityLabel="Household Name"
				onPress={() => {
					setDraftName(name);
					setEditing(true);
				}}
				size="sm"
			>
				{content}
			</ItemPressable>
		);
	}

	return (
		<View style={styles.renameForm}>
			<Text style={styles.inputLabel}>Household Name</Text>
			<TextInput
				accessibilityLabel="Household name"
				autoCapitalize="words"
				editable={!renaming}
				onChangeText={setDraftName}
				placeholder="Household name"
				style={styles.input}
				value={draftName}
			/>
			<View style={styles.formActions}>
				<Button
					disabled={renaming}
					onPress={() => {
						void actions.renameHousehold(draftName).then((renamed) => {
							if (renamed) setEditing(false);
						});
					}}
				>
					{renaming ? "Renaming" : "Rename"}
				</Button>
				<Button
					disabled={renaming}
					onPress={() => setEditing(false)}
					variant="outline"
				>
					Cancel
				</Button>
			</View>
		</View>
	);
}

function HouseholdDetailItem({
	title,
	value,
}: {
	title: string;
	value: string;
}) {
	return (
		<Item size="sm">
			<ItemContent>
				<ItemTitle>{title}</ItemTitle>
			</ItemContent>
			<ItemActions>
				<ItemActionsLabel>{value}</ItemActionsLabel>
			</ItemActions>
		</Item>
	);
}

function DisclosureIndicator() {
	const { theme } = useUnistyles();
	return (
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
	);
}

function LeaveHouseholdItem({ onPress }: { onPress: () => void }) {
	const { theme } = useUnistyles();
	return (
		<ItemPressable
			accessibilityLabel="Leave Household"
			onPress={onPress}
			size="sm"
		>
			<ItemMedia variant="icon">
				<SymbolView
					accessibilityElementsHidden
					accessible={false}
					name="rectangle.portrait.and.arrow.right"
					size={theme.spacing(4)}
					tintColor={theme.colors.destructive}
					weight="medium"
				/>
			</ItemMedia>
			<ItemContent>
				<ItemTitle style={styles.destructiveTitle}>Leave Household</ItemTitle>
			</ItemContent>
		</ItemPressable>
	);
}

function householdNameForSettings(
	state: HouseholdSettingsState,
	session: AuthenticatedAppSession,
): string {
	if (state.status !== "ready") return session.activeHousehold.name;
	return state.renamedHouseholdName ?? session.activeHousehold.name;
}

function memberCountLabel(count: number): string {
	return `${count} ${count === 1 ? "Member" : "Members"}`;
}

function pendingInvitationLabel(count: number): string {
	return `${count} pending`;
}

function HouseholdScreenShell({
	children,
	label,
	title,
}: {
	children: ReactNode;
	label: string;
	title: string;
}) {
	return (
		<ScreenScaffold label={label} title={title}>
			{children}
		</ScreenScaffold>
	);
}

function SessionState({
	state,
	onRetry,
}: {
	state: AuthenticatedAppSessionState;
	onRetry: () => void;
}) {
	if (state.status === "error") {
		return (
			<CenteredStatus title="Household unavailable">
				<Text style={styles.statusBody}>{state.message}</Text>
				<Button onPress={onRetry}>Try again</Button>
			</CenteredStatus>
		);
	}
	return (
		<CenteredStatus title="Preparing your Household">
			<ActivityIndicator />
		</CenteredStatus>
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

function confirmLeaveHousehold(actions: HouseholdSettingsActions) {
	Alert.alert(
		"Leave Household",
		"Leave this Household and remove your Membership?",
		[
			{ text: "Cancel", style: "cancel" },
			{
				text: "Leave",
				style: "destructive",
				onPress: () => {
					void actions.leaveHousehold({
						confirmDiscardUnsyncedChanges,
					});
				},
			},
		],
	);
}

function confirmDiscardUnsyncedChanges(): Promise<boolean> {
	return new Promise((resolve) => {
		Alert.alert(
			"Unsynced Changes",
			"You have unsynced changes that will be lost. Connect and retry, or leave anyway.",
			[
				{
					text: "Cancel",
					style: "cancel",
					onPress: () => resolve(false),
				},
				{
					text: "Leave Anyway",
					style: "destructive",
					onPress: () => resolve(true),
				},
			],
		);
	});
}

const styles = StyleSheet.create((theme) => ({
	content: {
		paddingHorizontal: theme.spacing(5),
		paddingBottom: theme.spacing(12),
		gap: theme.spacing(6),
	},
	identityName: {
		...theme.typography.headline,
		color: theme.colors.foreground,
	},
	identityDetail: {
		...theme.typography.callout,
		color: theme.colors.mutedForeground,
	},
	notice: {
		...theme.typography.callout,
		color: theme.colors.foreground,
	},
	noticeContent: {
		padding: theme.spacing(4),
		paddingTop: theme.spacing(4),
	},
	renameForm: {
		gap: theme.spacing(3),
		padding: theme.spacing(4),
		borderBottomWidth: theme.borders.hairline,
		borderBottomColor: theme.colors.border,
	},
	inputLabel: {
		...theme.typography.captionStrong,
		color: theme.colors.mutedForeground,
		textTransform: "uppercase",
	},
	input: {
		minHeight: theme.spacing(12),
		paddingHorizontal: theme.spacing(3),
		borderWidth: theme.borders.hairline,
		borderColor: theme.colors.input,
		borderRadius: theme.radii.xl,
		backgroundColor: theme.colors.glassTint,
		color: theme.colors.foreground,
		...theme.typography.body,
	},
	formActions: {
		flexDirection: "row",
		gap: theme.spacing(2),
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
	destructiveTitle: {
		color: theme.colors.destructive,
	},
}));
