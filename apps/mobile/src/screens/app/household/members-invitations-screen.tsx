import { ScreenScaffold } from "@mobile/app-shell/screen-scaffold";
import type {
	HouseholdJoinCode,
	HouseholdMember,
	PendingInvitation,
} from "@mobile/features/household/api";
import {
	type HouseholdSettingsActions,
	type HouseholdSettingsOperation,
	type HouseholdSettingsState,
	normalizeInvitationEmail,
	useHouseholdSettings,
} from "@mobile/features/household/use-household-settings";
import {
	type AuthenticatedAppSession,
	type AuthenticatedAppSessionReloadOptions,
	type AuthenticatedAppSessionState,
	useAuthenticatedAppSession,
} from "@mobile/session";
import {
	ActionMenuButton,
	type ActionMenuItem,
} from "@mobile/ui/action-menu-button";
import { Avatar, AvatarFallback } from "@mobile/ui/avatar";
import { Button } from "@mobile/ui/button";
import { Card, CardContent } from "@mobile/ui/card";
import { Field, FieldError, FieldLabel } from "@mobile/ui/field";
import { Form } from "@mobile/ui/form";
import { Input } from "@mobile/ui/input";
import {
	Item,
	ItemActions,
	ItemActionsLabel,
	ItemContent,
	ItemDescription,
	ItemFooter,
	ItemMedia,
	ItemTitle,
} from "@mobile/ui/item";
import { themedAlert } from "@mobile/ui/native-dialogs";
import { SymbolView } from "expo-symbols";
import type { ReactNode } from "react";
import { useState } from "react";
import {
	ActivityIndicator,
	FlatList,
	Pressable,
	Text,
	View,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

type CollaborationRow =
	| { type: "section"; id: string; title: string }
	| { type: "member"; member: HouseholdMember }
	| { type: "membersEmpty" }
	| { type: "invitationForm" }
	| { type: "joinCode" }
	| {
			type: "invitation";
			invitation: PendingInvitation;
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
					<Button onPress={actions.retry}>Try again</Button>
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
			/>
		);
	}

	return (
		<Item variant="outline">
			<ItemContent>
				<ItemDescription>
					{row.type === "membersEmpty"
						? "No Members found."
						: "No pending Invitations."}
				</ItemDescription>
			</ItemContent>
		</Item>
	);
}

function MemberRow({
	actions,
	member,
	operation,
	session,
}: {
	actions: HouseholdSettingsActions;
	member: HouseholdMember;
	operation: HouseholdSettingsOperation;
	session: AuthenticatedAppSession;
}) {
	const canManage =
		session.activeMember.role === "owner" &&
		member.userId !== session.activeMember.userId;
	const roleLabel = member.role === "owner" ? "Owner" : "Member";
	const isCurrentUser = member.userId === session.activeMember.userId;
	const displayName = member.displayName ?? "Unnamed Member";

	return (
		<Item size="sm" variant="outline">
			<ItemMedia>
				<Avatar accessibilityLabel={displayName}>
					<AvatarFallback name={displayName} />
				</Avatar>
			</ItemMedia>
			<ItemContent>
				<ItemTitle>{displayName}</ItemTitle>
				<ItemDescription>
					{roleLabel}
					{isCurrentUser ? " · You" : ""}
				</ItemDescription>
			</ItemContent>
			{canManage ? (
				<ItemActions>
					<ActionMenuButton
						accessibilityLabel={`Manage ${displayName}`}
						actions={memberMenuActions(member, actions)}
						disabled={operation.status !== "idle"}
					/>
				</ItemActions>
			) : null}
		</Item>
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
	const [validationMessage, setValidationMessage] = useState<string | null>(
		null,
	);
	const creating = operation.status === "creatingInvitation";

	function sendInvite() {
		if (!normalizeInvitationEmail(email)) {
			setValidationMessage("Enter a valid email address.");
			return;
		}
		setValidationMessage(null);
		void actions.createInvitation(email);
	}

	return (
		<Card>
			<CardContent style={styles.invitationFormContent}>
				<Form style={styles.invitationForm}>
					<Field disabled={creating} style={styles.invitationField}>
						<FieldLabel>Email Address</FieldLabel>
						<Input
							accessibilityLabel="Invitation email"
							kind="email"
							onTextChange={setEmail}
							placeholder="name@example.com"
						/>
						<FieldError errors={validationMessage ? [validationMessage] : []} />
					</Field>
					<Button disabled={creating} onPress={sendInvite}>
						{creating ? "Sending" : "Send Invite"}
					</Button>
				</Form>
			</CardContent>
		</Card>
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
	const { theme } = useUnistyles();
	const [expanded, setExpanded] = useState(false);
	const settingEnabled = operation.status === "settingJoinCodeEnabled";
	const regenerating = operation.status === "regeneratingJoinCode";

	return (
		<View style={styles.joinCodeSpacing}>
			<Item style={styles.joinCodeCard} variant="outline">
				<Pressable
					accessibilityLabel="Household Join Code"
					accessibilityRole="button"
					accessibilityState={{ expanded }}
					onPress={() => setExpanded((current) => !current)}
					style={({ pressed }) => [
						styles.joinCodeToggle,
						pressed ? styles.pressed : undefined,
					]}
				>
					<ItemContent>
						<ItemTitle>Household Join Code</ItemTitle>
					</ItemContent>
					<ItemActions>
						<ItemActionsLabel>
							{joinCode.enabled ? formatJoinCode(joinCode.code) : "Disabled"}
						</ItemActionsLabel>
						<SymbolView
							accessibilityElementsHidden
							accessible={false}
							name="chevron.right"
							size={theme.spacing(3.5)}
							tintColor={theme.colors.mutedForeground}
							weight="semibold"
						/>
					</ItemActions>
				</Pressable>
				{joinCode.enabled ? (
					<ItemActions style={styles.joinCodeCopyAction}>
						<CopyButton
							accessibilityLabel="Copy Household Join Code"
							onPress={() =>
								actions.copyText(joinCode.code, "Household Join Code copied.")
							}
						/>
					</ItemActions>
				) : null}
				{expanded ? (
					<ItemFooter style={styles.joinCodeActions}>
						{joinCode.enabled ? (
							<>
								<Button
									onPress={() =>
										actions.copyText(
											joinCode.joinUrl,
											"Household Join Code URL copied.",
										)
									}
									variant="outline"
								>
									<SymbolView
										accessibilityElementsHidden
										accessible={false}
										name="doc.on.doc"
										size={17}
										tintColor={theme.colors.foreground}
										weight="medium"
									/>
									<Text style={styles.outlineButtonLabel}>Copy Link</Text>
								</Button>
								<Button
									disabled={regenerating}
									onPress={actions.regenerateJoinCode}
									variant="outline"
								>
									{regenerating ? "Regenerating" : "Regenerate"}
								</Button>
								<Button
									disabled={settingEnabled}
									onPress={() => actions.setJoinCodeEnabled(false)}
									variant="destructive"
								>
									{settingEnabled ? "Disabling" : "Disable"}
								</Button>
							</>
						) : (
							<Button
								disabled={settingEnabled}
								onPress={() => actions.setJoinCodeEnabled(true)}
							>
								{settingEnabled ? "Enabling" : "Enable Join Code"}
							</Button>
						)}
					</ItemFooter>
				) : null}
			</Item>
		</View>
	);
}

function InvitationRow({
	actions,
	invitation,
	operation,
}: {
	actions: HouseholdSettingsActions;
	invitation: PendingInvitation;
	operation: HouseholdSettingsOperation;
}) {
	const { theme } = useUnistyles();
	const label = invitation.email ?? "Invitation";
	const revoking =
		operation.status === "revokingInvitation" &&
		operation.invitationId === invitation.id;

	return (
		<Item size="sm" variant="outline">
			<ItemMedia variant="icon">
				<SymbolView
					accessibilityElementsHidden
					accessible={false}
					name="envelope"
					size={theme.spacing(4)}
					tintColor={theme.colors.foreground}
					weight="medium"
				/>
			</ItemMedia>
			<ItemContent>
				<ItemTitle>{label}</ItemTitle>
				<ItemDescription>
					Expires {formatDate(invitation.expiresAt)}
				</ItemDescription>
			</ItemContent>
			<ItemActions>
				<ActionMenuButton
					accessibilityLabel={`Manage ${label}`}
					actions={invitationMenuActions(invitation, actions)}
					disabled={revoking}
				/>
			</ItemActions>
		</Item>
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
		<Button
			accessibilityLabel={accessibilityLabel}
			onPress={onPress}
			size="icon"
			style={styles.copyButton}
			variant="ghost"
		>
			<SymbolView
				accessibilityElementsHidden
				accessible={false}
				name="doc.on.doc"
				size={17}
				tintColor={theme.colors.mutedForeground}
				weight="medium"
			/>
		</Button>
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
		state.members.forEach((member) => {
			rows.push({
				type: "member",
				member,
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
		state.invitations.forEach((invitation) => {
			rows.push({
				type: "invitation",
				invitation,
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
		color: theme.colors.mutedForeground,
		textTransform: "uppercase",
		paddingHorizontal: theme.spacing(1),
		paddingTop: theme.spacing(6),
		paddingBottom: theme.spacing(2),
	},
	invitationForm: {
		flexDirection: "row",
		alignItems: "flex-end",
		gap: theme.spacing(3),
	},
	invitationFormContent: {
		padding: theme.spacing(3),
		paddingTop: theme.spacing(3),
	},
	invitationField: {
		flex: 1,
		minWidth: 0,
	},
	joinCodeSpacing: {
		paddingTop: theme.spacing(3),
	},
	joinCodeCard: {
		gap: theme.spacing(0),
		paddingHorizontal: theme.spacing(0),
		paddingVertical: theme.spacing(0),
	},
	joinCodeToggle: {
		flex: 1,
		minWidth: 0,
		minHeight: theme.spacing(14),
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(2),
		paddingLeft: theme.spacing(4),
		paddingRight: theme.spacing(2.5),
		paddingVertical: theme.spacing(2.5),
	},
	joinCodeCopyAction: {
		paddingRight: theme.spacing(4),
	},
	pressed: {
		opacity: theme.opacities.pressed,
	},
	outlineButtonLabel: {
		...theme.typography.callout,
		fontWeight: theme.fontWeights.semibold,
		color: theme.colors.foreground,
	},
	joinCodeActions: {
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "flex-start",
		gap: theme.spacing(2),
		paddingHorizontal: theme.spacing(3),
		paddingTop: theme.spacing(3),
		paddingBottom: theme.spacing(3),
	},
	copyButton: {
		width: theme.spacing(11),
		height: theme.spacing(11),
		alignItems: "center",
		justifyContent: "center",
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
