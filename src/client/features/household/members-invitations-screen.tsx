import { SymbolView } from "expo-symbols";
import type { ReactNode } from "react";
import { useState } from "react";
import {
	ActivityIndicator,
	FlatList,
	Pressable,
	Text,
	TextInput,
	View,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { ScreenScaffold } from "@/client/app-shell/screen-scaffold";
import type {
	HouseholdJoinCode,
	HouseholdMember,
	PendingInvitation,
} from "@/client/features/household/api";
import {
	type AuthenticatedAppSession,
	type AuthenticatedAppSessionReloadOptions,
	type AuthenticatedAppSessionState,
	useAuthenticatedAppSession,
} from "@/client/session";
import {
	ActionMenuButton,
	type ActionMenuItem,
} from "@/client/ui/action-menu-button";
import { AppButton } from "@/client/ui/app-button";
import { themedAlert } from "@/client/ui/native-dialogs";
import {
	type GroupPosition,
	groupPosition,
	InitialsAvatar,
	SurfaceCard,
	SurfaceRow,
} from "@/client/ui/settings-surface";
import {
	type HouseholdSettingsActions,
	type HouseholdSettingsOperation,
	type HouseholdSettingsState,
	useHouseholdSettings,
} from "./use-household-settings";

type CollaborationRow =
	| { type: "section"; id: string; title: string }
	| { type: "member"; member: HouseholdMember; position: GroupPosition }
	| { type: "membersEmpty" }
	| { type: "invitationForm" }
	| { type: "joinCode" }
	| {
			type: "invitation";
			invitation: PendingInvitation;
			position: GroupPosition;
	  }
	| { type: "invitationsEmpty" };

export default function MembersInvitationsScreen() {
	const { state, session, retry, reloadSession } = useAuthenticatedAppSession();

	if (!session) {
		return (
			<ScreenScaffold label="Household" title="Members & Invitations">
				<SessionState state={state} onRetry={retry} />
			</ScreenScaffold>
		);
	}

	return (
		<MembersInvitationsContent
			session={session}
			reloadSession={reloadSession}
		/>
	);
}

function MembersInvitationsContent({
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
		<MembersInvitationsView session={session} state={state} actions={actions} />
	);
}

export function MembersInvitationsView({
	session,
	state,
	actions,
}: {
	session: AuthenticatedAppSession;
	state: HouseholdSettingsState;
	actions: HouseholdSettingsActions;
}) {
	return (
		<ScreenScaffold
			label={session.activeHousehold.name}
			title="Members & Invitations"
		>
			{state.status === "loading" ? (
				<CenteredStatus title="Loading Members and Invitations">
					<ActivityIndicator />
				</CenteredStatus>
			) : state.status === "error" ? (
				<CenteredStatus title="Members and Invitations unavailable">
					<Text style={styles.statusBody}>{state.message}</Text>
					<AppButton
						label="Try again"
						onPress={actions.retry}
						variant="primary"
					/>
				</CenteredStatus>
			) : (
				<MembersInvitationsList
					actions={actions}
					session={session}
					state={state}
				/>
			)}
		</ScreenScaffold>
	);
}

function MembersInvitationsList({
	actions,
	session,
	state,
}: {
	actions: HouseholdSettingsActions;
	session: AuthenticatedAppSession;
	state: Extract<HouseholdSettingsState, { status: "ready" }>;
}) {
	const rows = collaborationRows(state);

	return (
		<FlatList
			contentContainerStyle={styles.listContent}
			contentInsetAdjustmentBehavior="automatic"
			data={rows}
			keyboardShouldPersistTaps="handled"
			keyExtractor={collaborationRowKey}
			ListHeaderComponent={
				state.notice ? (
					<SurfaceCard>
						<Text style={styles.notice}>{state.notice}</Text>
					</SurfaceCard>
				) : null
			}
			renderItem={({ item }) => (
				<CollaborationRowView
					actions={actions}
					row={item}
					session={session}
					state={state}
				/>
			)}
		/>
	);
}

function CollaborationRowView({
	actions,
	row,
	session,
	state,
}: {
	actions: HouseholdSettingsActions;
	row: CollaborationRow;
	session: AuthenticatedAppSession;
	state: Extract<HouseholdSettingsState, { status: "ready" }>;
}) {
	if (row.type === "section") {
		return <Text style={styles.sectionTitle}>{row.title}</Text>;
	}
	if (row.type === "member") {
		return (
			<MemberRow
				actions={actions}
				member={row.member}
				operation={state.operation}
				position={row.position}
				session={session}
			/>
		);
	}
	if (row.type === "invitationForm") {
		return <InvitationForm actions={actions} operation={state.operation} />;
	}
	if (row.type === "joinCode") {
		return (
			<JoinCodeCard
				actions={actions}
				joinCode={state.joinCode}
				operation={state.operation}
			/>
		);
	}
	if (row.type === "invitation") {
		return (
			<InvitationRow
				actions={actions}
				invitation={row.invitation}
				operation={state.operation}
				position={row.position}
			/>
		);
	}

	return (
		<SurfaceCard>
			<Text style={styles.emptyText}>
				{row.type === "membersEmpty"
					? "No Members found."
					: "No pending Invitations."}
			</Text>
		</SurfaceCard>
	);
}

function MemberRow({
	actions,
	member,
	operation,
	position,
	session,
}: {
	actions: HouseholdSettingsActions;
	member: HouseholdMember;
	operation: HouseholdSettingsOperation;
	position: GroupPosition;
	session: AuthenticatedAppSession;
}) {
	const canManage =
		session.activeMember.role === "owner" &&
		member.userId !== session.activeMember.userId;
	const roleLabel = member.role === "owner" ? "Owner" : "Member";
	const isCurrentUser = member.userId === session.activeMember.userId;
	const displayName = member.displayName ?? "Unnamed Member";

	return (
		<SurfaceCard groupPosition={position}>
			<SurfaceRow
				detail={`${roleLabel}${isCurrentUser ? " · You" : ""}`}
				divider={position === "first" || position === "middle"}
				label={displayName}
				leading={<InitialsAvatar label={displayName} />}
				trailing={
					canManage ? (
						<ActionMenuButton
							accessibilityLabel={`Manage ${displayName}`}
							actions={memberMenuActions(member, actions)}
							disabled={operation.status !== "idle"}
						/>
					) : undefined
				}
			/>
		</SurfaceCard>
	);
}

function InvitationForm({
	actions,
	operation,
}: {
	actions: HouseholdSettingsActions;
	operation: HouseholdSettingsOperation;
}) {
	const [email, setEmail] = useState("");
	const creating = operation.status === "creatingInvitation";

	return (
		<SurfaceCard>
			<View style={styles.invitationForm}>
				<View style={styles.invitationInputGroup}>
					<Text style={styles.inputLabel}>Email Address</Text>
					<TextInput
						accessibilityLabel="Invitation email"
						autoCapitalize="none"
						autoComplete="email"
						editable={!creating}
						keyboardType="email-address"
						onChangeText={setEmail}
						placeholder="name@example.com"
						style={styles.input}
						textContentType="emailAddress"
						value={email}
					/>
				</View>
				<AppButton
					disabled={creating}
					label={creating ? "Sending" : "Send Invite"}
					onPress={() => {
						void actions.createInvitation(email);
					}}
					variant="primary"
				/>
			</View>
		</SurfaceCard>
	);
}

function JoinCodeCard({
	actions,
	joinCode,
	operation,
}: {
	actions: HouseholdSettingsActions;
	joinCode: HouseholdJoinCode;
	operation: HouseholdSettingsOperation;
}) {
	const [expanded, setExpanded] = useState(false);
	const settingEnabled = operation.status === "settingJoinCodeEnabled";
	const regenerating = operation.status === "regeneratingJoinCode";

	return (
		<View style={styles.joinCodeSpacing}>
			<SurfaceCard>
				<SurfaceRow
					disclosure
					label="Household Join Code"
					onPress={() => setExpanded((current) => !current)}
					trailing={
						joinCode.enabled ? (
							<View style={styles.codeTrailing}>
								<Text style={styles.codeText}>
									{formatJoinCode(joinCode.code)}
								</Text>
								<CopyButton
									accessibilityLabel="Copy Household Join Code"
									onPress={() =>
										actions.copyText(
											joinCode.code,
											"Household Join Code copied.",
										)
									}
								/>
							</View>
						) : (
							<Text style={styles.codeText}>Disabled</Text>
						)
					}
				/>
				{expanded ? (
					<View style={styles.joinCodeActions}>
						{joinCode.enabled ? (
							<>
								<AppButton
									label="Copy Link"
									onPress={() =>
										actions.copyText(
											joinCode.joinUrl,
											"Household Join Code URL copied.",
										)
									}
									symbol="doc.on.doc"
								/>
								<AppButton
									disabled={regenerating}
									label={regenerating ? "Regenerating" : "Regenerate"}
									onPress={actions.regenerateJoinCode}
								/>
								<AppButton
									disabled={settingEnabled}
									label={settingEnabled ? "Disabling" : "Disable"}
									onPress={() => actions.setJoinCodeEnabled(false)}
									variant="destructive"
								/>
							</>
						) : (
							<AppButton
								disabled={settingEnabled}
								label={settingEnabled ? "Enabling" : "Enable Join Code"}
								onPress={() => actions.setJoinCodeEnabled(true)}
								variant="primary"
							/>
						)}
					</View>
				) : null}
			</SurfaceCard>
		</View>
	);
}

function InvitationRow({
	actions,
	invitation,
	operation,
	position,
}: {
	actions: HouseholdSettingsActions;
	invitation: PendingInvitation;
	operation: HouseholdSettingsOperation;
	position: GroupPosition;
}) {
	const label = invitation.email ?? "Invitation";
	const revoking =
		operation.status === "revokingInvitation" &&
		operation.invitationId === invitation.id;

	return (
		<SurfaceCard groupPosition={position}>
			<SurfaceRow
				detail={`Expires ${formatDate(invitation.expiresAt)}`}
				divider={position === "first" || position === "middle"}
				label={label}
				symbol="envelope"
				trailing={
					<ActionMenuButton
						accessibilityLabel={`Manage ${label}`}
						actions={invitationMenuActions(invitation, actions)}
						disabled={revoking}
					/>
				}
			/>
		</SurfaceCard>
	);
}

function CopyButton({
	accessibilityLabel,
	onPress,
}: {
	accessibilityLabel: string;
	onPress: () => void;
}) {
	const { theme } = useUnistyles();
	return (
		<Pressable
			accessibilityLabel={accessibilityLabel}
			accessibilityRole="button"
			onPress={onPress}
			style={({ pressed }) => [
				styles.copyButton,
				pressed ? styles.pressed : undefined,
			]}
		>
			<SymbolView
				accessibilityElementsHidden
				accessible={false}
				name="doc.on.doc"
				size={17}
				tintColor={theme.colors.textMuted}
				weight="medium"
			/>
		</Pressable>
	);
}

function collaborationRows(
	state: Extract<HouseholdSettingsState, { status: "ready" }>,
): CollaborationRow[] {
	const rows: CollaborationRow[] = [
		{ type: "section", id: "members", title: "Members" },
	];
	if (state.members.length === 0) {
		rows.push({ type: "membersEmpty" });
	} else {
		state.members.forEach((member, index) => {
			rows.push({
				type: "member",
				member,
				position: groupPosition(index, state.members.length),
			});
		});
	}
	rows.push(
		{ type: "section", id: "invite", title: "Invite People" },
		{ type: "invitationForm" },
		{ type: "joinCode" },
		{ type: "section", id: "pending", title: "Pending" },
	);
	if (state.invitations.length === 0) {
		rows.push({ type: "invitationsEmpty" });
	} else {
		state.invitations.forEach((invitation, index) => {
			rows.push({
				type: "invitation",
				invitation,
				position: groupPosition(index, state.invitations.length),
			});
		});
	}
	return rows;
}

function collaborationRowKey(row: CollaborationRow): string {
	switch (row.type) {
		case "section":
			return row.id;
		case "member":
			return `member:${row.member.membershipId}`;
		case "invitation":
			return `invitation:${row.invitation.id}`;
		default:
			return row.type;
	}
}

function memberMenuActions(
	member: HouseholdMember,
	actions: HouseholdSettingsActions,
): ActionMenuItem[] {
	const role = member.role === "owner" ? "member" : "owner";
	const roleAction = role === "owner" ? "Make Owner" : "Make Member";

	return [
		{
			label: roleAction,
			symbol: role === "owner" ? "crown" : "person",
			onPress: () => confirmRoleChange(member, role, actions),
		},
		{
			label: "Remove Member",
			symbol: "person.badge.minus",
			role: "destructive",
			onPress: () => confirmRemoveMember(member, actions),
		},
	];
}

function invitationMenuActions(
	invitation: PendingInvitation,
	actions: HouseholdSettingsActions,
): ActionMenuItem[] {
	return [
		{
			label: "Copy Invitation",
			symbol: "doc.on.doc",
			onPress: () => {
				void actions.copyText(invitation.acceptUrl, "Invitation copied.");
			},
		},
		{
			label: "Revoke Invitation",
			symbol: "xmark.circle",
			role: "destructive",
			onPress: () => confirmRevokeInvitation(invitation, actions),
		},
	];
}

function confirmRemoveMember(
	member: HouseholdMember,
	actions: HouseholdSettingsActions,
) {
	themedAlert(
		"Remove Member",
		`Remove ${member.displayName ?? "this Member"} from this Household?`,
		[
			{ text: "Cancel", style: "cancel" },
			{
				text: "Remove",
				style: "destructive",
				onPress: () => {
					void actions.removeMember(member.membershipId);
				},
			},
		],
	);
}

function confirmRoleChange(
	member: HouseholdMember,
	role: "owner" | "member",
	actions: HouseholdSettingsActions,
) {
	const actionLabel = role === "owner" ? "Make Owner" : "Make Member";
	themedAlert(
		actionLabel,
		`Change ${member.displayName ?? "this Member"} to ${
			role === "owner" ? "Owner" : "Member"
		}?`,
		[
			{ text: "Cancel", style: "cancel" },
			{
				text: "Change",
				onPress: () => {
					void actions.setMemberRole(member.membershipId, role);
				},
			},
		],
	);
}

function confirmRevokeInvitation(
	invitation: PendingInvitation,
	actions: HouseholdSettingsActions,
) {
	themedAlert(
		"Revoke Invitation",
		`Revoke the Invitation for ${invitation.email ?? "this recipient"}?`,
		[
			{ text: "Cancel", style: "cancel" },
			{
				text: "Revoke",
				style: "destructive",
				onPress: () => {
					void actions.revokeInvitation(invitation.id);
				},
			},
		],
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

function formatDate(timestamp: number): string {
	return new Date(timestamp).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
	});
}

function formatJoinCode(code: string): string {
	return code.replace(/(.{4})/g, "$1 ").trim();
}

const styles = StyleSheet.create((theme) => ({
	listContent: {
		paddingHorizontal: theme.spacing(5),
		paddingBottom: theme.spacing(12),
	},
	sectionTitle: {
		...theme.typography.overline,
		color: theme.colors.textMuted,
		textTransform: "uppercase",
		paddingHorizontal: theme.spacing(1),
		paddingTop: theme.spacing(6),
		paddingBottom: theme.spacing(2),
	},
	notice: {
		...theme.typography.callout,
		color: theme.colors.text,
		padding: theme.spacing(4),
	},
	emptyText: {
		...theme.typography.callout,
		color: theme.colors.textMuted,
		padding: theme.spacing(4),
	},
	invitationForm: {
		flexDirection: "row",
		alignItems: "flex-end",
		gap: theme.spacing(3),
		padding: theme.spacing(3),
	},
	invitationInputGroup: {
		flex: 1,
		minWidth: 0,
		gap: theme.spacing(1),
	},
	inputLabel: {
		...theme.typography.captionStrong,
		color: theme.colors.textMuted,
		textTransform: "uppercase",
	},
	input: {
		minHeight: theme.spacing(11),
		paddingHorizontal: theme.spacing(3),
		borderWidth: theme.borders.hairline,
		borderColor: theme.colors.inputBorder,
		borderRadius: theme.radii.control,
		backgroundColor: theme.colors.glassTint,
		color: theme.colors.text,
		...theme.typography.callout,
	},
	joinCodeSpacing: {
		paddingTop: theme.spacing(3),
	},
	codeTrailing: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(1),
	},
	codeText: {
		...theme.typography.caption,
		color: theme.colors.textMuted,
	},
	joinCodeActions: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: theme.spacing(2),
		paddingHorizontal: theme.spacing(3),
		paddingBottom: theme.spacing(3),
	},
	copyButton: {
		width: theme.spacing(11),
		height: theme.spacing(11),
		alignItems: "center",
		justifyContent: "center",
	},
	pressed: {
		opacity: theme.opacities.pressed,
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
