import { useRouter } from "expo-router";
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
import { StyleSheet } from "react-native-unistyles";
import { ScreenScaffold } from "@/client/app-shell/screen-scaffold";
import {
	type AuthenticatedAppSession,
	type AuthenticatedAppSessionReloadOptions,
	type AuthenticatedAppSessionState,
	useAuthenticatedAppSession,
} from "@/client/session";
import { AppButton } from "@/client/ui/app-button";
import {
	InitialsAvatar,
	SurfaceCard,
	SurfaceRow,
	SurfaceSection,
} from "@/client/ui/settings-surface";
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
					<AppButton
						label="Try again"
						onPress={actions.retry}
						variant="primary"
					/>
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
				<SurfaceCard>
					<Text style={styles.notice}>{state.notice}</Text>
				</SurfaceCard>
			) : null}

			<SurfaceCard>
				<View style={styles.identityCard}>
					<InitialsAvatar label={householdName} size="large" />
					<View style={styles.identityText}>
						<Text style={styles.identityName}>{householdName}</Text>
						<Text style={styles.identityDetail}>
							{roleLabel} · {memberCountLabel(memberCount)}
						</Text>
					</View>
				</View>
			</SurfaceCard>

			<SurfaceSection title="Household Details">
				<SurfaceCard>
					<HouseholdNameRow
						actions={actions}
						canRename={session.activeMember.role === "owner"}
						name={householdName}
						operation={state.operation}
					/>
					<SurfaceRow label="Your Membership" value={roleLabel} />
				</SurfaceCard>
				<SurfaceCard>
					<SurfaceRow
						accessibilityHint="Opens Member and Invitation management"
						detail={`${memberCountLabel(memberCount)} · ${pendingInvitationLabel(invitationCount)}`}
						label="Members & Invitations"
						onPress={onOpenMembers}
					/>
				</SurfaceCard>
			</SurfaceSection>

			<SurfaceSection title="Membership">
				<SurfaceCard>
					<SurfaceRow
						disclosure={false}
						label="Leave Household"
						onPress={() => confirmLeaveHousehold(actions)}
						symbol="rectangle.portrait.and.arrow.right"
						tone="destructive"
					/>
				</SurfaceCard>
			</SurfaceSection>
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
	const [editing, setEditing] = useState(false);
	const [draftName, setDraftName] = useState(name);
	const renaming = operation.status === "renamingHousehold";

	if (!editing) {
		return (
			<SurfaceRow
				divider
				disclosure={canRename}
				label="Household Name"
				onPress={
					canRename
						? () => {
								setDraftName(name);
								setEditing(true);
							}
						: undefined
				}
				value={name}
			/>
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
				<AppButton
					disabled={renaming}
					label={renaming ? "Renaming" : "Rename"}
					onPress={() => {
						void actions.renameHousehold(draftName).then((renamed) => {
							if (renamed) setEditing(false);
						});
					}}
					variant="primary"
				/>
				<AppButton
					disabled={renaming}
					label="Cancel"
					onPress={() => setEditing(false)}
				/>
			</View>
		</View>
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
				<AppButton label="Try again" onPress={onRetry} variant="primary" />
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
	identityCard: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(4),
		padding: theme.spacing(4),
	},
	identityText: {
		flex: 1,
		minWidth: 0,
		gap: theme.spacing(1),
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
		padding: theme.spacing(4),
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
}));
