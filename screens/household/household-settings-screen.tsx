import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { useState } from "react";
import {
	ActivityIndicator,
	Alert,
	FlatList,
	Text,
	TextInput,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import {
	type AuthenticatedAppSessionState,
	useAuthenticatedAppSession,
} from "@/components/session";
import type {
	HouseholdJoinCode,
	HouseholdMember,
	PendingInvitation,
} from "@/lib/client-api/households";
import type { AuthenticatedAppSession } from "@/lib/services/session";
import { HouseholdButton } from "./household-button";
import {
	type HouseholdSettingsActions,
	type HouseholdSettingsOperation,
	type HouseholdSettingsState,
	useHouseholdSettings,
} from "./use-household-settings";

type SettingsRow =
	| { type: "householdName" }
	| { type: "invitationForm" }
	| { type: "joinCode" }
	| { type: "section"; id: string; title: string }
	| { type: "member"; member: HouseholdMember }
	| { type: "leaveHousehold" }
	| { type: "invitation"; invitation: PendingInvitation }
	| { type: "empty"; id: string; label: string };

export default function HouseholdSettingsScreen() {
	const { state, session, retry, reloadSession } = useAuthenticatedAppSession();

	if (!session) {
		return (
			<HouseholdSettingsShell title="Household settings">
				<SessionState state={state} onRetry={retry} />
			</HouseholdSettingsShell>
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
	reloadSession: (options?: { retireCurrent?: boolean }) => void;
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
	const title =
		state.status === "ready"
			? (state.householdName ?? session.activeHousehold.name)
			: session.activeHousehold.name;

	return (
		<HouseholdSettingsShell title={title}>
			<View style={styles.topActions}>
				<HouseholdButton label="Home" onPress={() => router.replace("/")} />
				<HouseholdButton
					label="Switch Household"
					onPress={() => router.push("/household/switch")}
				/>
			</View>
			{state.status === "loading" ? (
				<CenteredStatus title="Loading Household settings">
					<ActivityIndicator />
				</CenteredStatus>
			) : state.status === "error" ? (
				<CenteredStatus title="Household settings unavailable">
					<Text style={styles.statusBody}>{state.message}</Text>
					<HouseholdButton
						variant="primary"
						label="Try again"
						onPress={actions.retry}
					/>
				</CenteredStatus>
			) : (
				<SettingsList session={session} state={state} actions={actions} />
			)}
		</HouseholdSettingsShell>
	);
}

function SettingsList({
	session,
	state,
	actions,
}: {
	session: AuthenticatedAppSession;
	state: Extract<HouseholdSettingsState, { status: "ready" }>;
	actions: HouseholdSettingsActions;
}) {
	const rows = settingsRows(state, session.activeMember.role === "owner");
	const householdName = state.householdName ?? session.activeHousehold.name;

	return (
		<FlatList
			data={rows}
			keyExtractor={settingsRowKey}
			contentContainerStyle={styles.listContent}
			keyboardShouldPersistTaps="handled"
			renderItem={({ item }) => (
				<SettingsRowView
					row={item}
					session={session}
					state={state}
					householdName={householdName}
					actions={actions}
				/>
			)}
			ListHeaderComponent={
				state.notice ? (
					<View style={styles.notice}>
						<Text style={styles.noticeText}>{state.notice}</Text>
					</View>
				) : null
			}
		/>
	);
}

function SettingsRowView({
	row,
	session,
	state,
	householdName,
	actions,
}: {
	row: SettingsRow;
	session: AuthenticatedAppSession;
	state: Extract<HouseholdSettingsState, { status: "ready" }>;
	householdName: string;
	actions: HouseholdSettingsActions;
}) {
	if (row.type === "section") {
		return <Text style={styles.sectionTitle}>{row.title}</Text>;
	}
	if (row.type === "empty") {
		return <Text style={styles.emptyText}>{row.label}</Text>;
	}
	if (row.type === "member") {
		return (
			<MemberRow
				member={row.member}
				session={session}
				operation={state.operation}
				actions={actions}
			/>
		);
	}
	if (row.type === "householdName") {
		return (
			<HouseholdNamePanel
				name={householdName}
				operation={state.operation}
				actions={actions}
			/>
		);
	}
	if (row.type === "leaveHousehold") {
		return <LeaveHouseholdRow operation={state.operation} actions={actions} />;
	}
	if (row.type === "invitation") {
		return (
			<InvitationRow
				invitation={row.invitation}
				operation={state.operation}
				actions={actions}
			/>
		);
	}
	if (row.type === "joinCode") {
		return (
			<JoinCodeControls
				joinCode={state.joinCode}
				operation={state.operation}
				actions={actions}
			/>
		);
	}
	return <CreateInvitationForm operation={state.operation} actions={actions} />;
}

function HouseholdNamePanel({
	name,
	operation,
	actions,
}: {
	name: string;
	operation: HouseholdSettingsOperation;
	actions: HouseholdSettingsActions;
}) {
	const [editing, setEditing] = useState(false);
	const [draftName, setDraftName] = useState(name);
	const disabled = operation.status === "renamingHousehold";

	if (!editing) {
		return (
			<View style={styles.panel}>
				<Text style={styles.panelTitle}>Household Name</Text>
				<Text style={styles.nameText}>{name}</Text>
				<HouseholdButton
					label="Rename"
					onPress={() => {
						setDraftName(name);
						setEditing(true);
					}}
				/>
			</View>
		);
	}

	return (
		<View style={styles.panel}>
			<Text style={styles.panelTitle}>Household Name</Text>
			<TextInput
				accessibilityLabel="Household name"
				autoCapitalize="words"
				editable={!disabled}
				onChangeText={setDraftName}
				placeholder="Household name"
				style={styles.input}
				value={draftName}
			/>
			<View style={styles.rowActions}>
				<HouseholdButton
					variant="primary"
					label={disabled ? "Renaming" : "Rename"}
					onPress={() => {
						void actions.renameHousehold(draftName).then(() => {
							setEditing(false);
						});
					}}
					disabled={disabled}
				/>
				<HouseholdButton
					label="Cancel"
					onPress={() => setEditing(false)}
					disabled={disabled}
				/>
			</View>
		</View>
	);
}

function CreateInvitationForm({
	operation,
	actions,
}: {
	operation: HouseholdSettingsOperation;
	actions: HouseholdSettingsActions;
}) {
	const [email, setEmail] = useState("");
	const disabled = operation.status === "creatingInvitation";

	return (
		<View style={styles.panel}>
			<Text style={styles.panelTitle}>Create Invitation</Text>
			<TextInput
				accessibilityLabel="Invitation email"
				autoCapitalize="none"
				autoComplete="email"
				editable={!disabled}
				keyboardType="email-address"
				onChangeText={setEmail}
				placeholder="Email address"
				style={styles.input}
				textContentType="emailAddress"
				value={email}
			/>
			<HouseholdButton
				variant="primary"
				label={disabled ? "Creating" : "Create Invitation"}
				onPress={() => actions.createInvitation(email)}
				disabled={disabled}
			/>
		</View>
	);
}

function JoinCodeControls({
	joinCode,
	operation,
	actions,
}: {
	joinCode: HouseholdJoinCode;
	operation: HouseholdSettingsOperation;
	actions: HouseholdSettingsActions;
}) {
	const disabled = operation.status === "settingJoinCodeEnabled";
	const regenerating = operation.status === "regeneratingJoinCode";

	return (
		<View style={styles.panel}>
			<Text style={styles.panelTitle}>Household Join Code</Text>
			{joinCode.enabled ? (
				<>
					<Text style={styles.codeText}>{formatJoinCode(joinCode.code)}</Text>
					<View style={styles.rowActions}>
						<HouseholdButton
							label="Copy code"
							onPress={() =>
								actions.copyText(joinCode.code, "Household Join Code copied.")
							}
						/>
						<HouseholdButton
							label="Copy link"
							onPress={() =>
								actions.copyText(
									joinCode.joinUrl,
									"Household join link copied.",
								)
							}
						/>
					</View>
					<View style={styles.rowActions}>
						<HouseholdButton
							label={regenerating ? "Regenerating" : "Regenerate"}
							onPress={actions.regenerateJoinCode}
							disabled={regenerating}
						/>
						<HouseholdButton
							variant="danger"
							label={disabled ? "Disabling" : "Disable"}
							onPress={() => actions.setJoinCodeEnabled(false)}
							disabled={disabled}
						/>
					</View>
				</>
			) : (
				<>
					<Text style={styles.mutedText}>Household Join Code is disabled.</Text>
					<HouseholdButton
						variant="primary"
						label={disabled ? "Enabling" : "Enable Join Code"}
						onPress={() => actions.setJoinCodeEnabled(true)}
						disabled={disabled}
					/>
				</>
			)}
		</View>
	);
}

function MemberRow({
	member,
	session,
	operation,
	actions,
}: {
	member: HouseholdMember;
	session: AuthenticatedAppSession;
	operation: HouseholdSettingsOperation;
	actions: HouseholdSettingsActions;
}) {
	const canManageMembers =
		session.activeMember.role === "owner" &&
		member.userId !== session.activeMember.userId;
	const removing =
		operation.status === "removingMember" &&
		operation.membershipId === member.membershipId;
	const changingRole =
		operation.status === "changingRole" &&
		operation.membershipId === member.membershipId;
	const nextRole = member.role === "owner" ? "member" : "owner";

	return (
		<View style={styles.row}>
			<View style={styles.rowTextGroup}>
				<Text style={styles.rowTitle} numberOfLines={1}>
					{member.displayName ?? "Member"}
				</Text>
				<Text style={styles.rowSubtitle}>
					{member.role === "owner" ? "Owner" : "Member"}
				</Text>
			</View>
			{canManageMembers ? (
				<View style={styles.memberActions}>
					<HouseholdButton
						label={changingRole ? "Changing" : roleActionLabel(nextRole)}
						onPress={() => confirmRoleChange(member, nextRole, actions)}
						disabled={changingRole}
					/>
					<HouseholdButton
						variant="danger"
						label={removing ? "Removing" : "Remove"}
						onPress={() => confirmRemoveMember(member, actions)}
						disabled={removing}
					/>
				</View>
			) : null}
		</View>
	);
}

function LeaveHouseholdRow({
	operation,
	actions,
}: {
	operation: HouseholdSettingsOperation;
	actions: HouseholdSettingsActions;
}) {
	const leaving = operation.status === "leavingHousehold";
	return (
		<View style={styles.row}>
			<View style={styles.rowTextGroup}>
				<Text style={styles.rowTitle}>Leave Household</Text>
				<Text style={styles.rowSubtitle}>Remove your Membership</Text>
			</View>
			<HouseholdButton
				variant="danger"
				label={leaving ? "Leaving" : "Leave"}
				onPress={() => confirmLeaveHousehold(actions)}
				disabled={leaving}
			/>
		</View>
	);
}

function InvitationRow({
	invitation,
	operation,
	actions,
}: {
	invitation: PendingInvitation;
	operation: HouseholdSettingsOperation;
	actions: HouseholdSettingsActions;
}) {
	const revoking =
		operation.status === "revokingInvitation" &&
		operation.invitationId === invitation.id;
	return (
		<View style={styles.row}>
			<View style={styles.rowTextGroup}>
				<Text style={styles.rowTitle} numberOfLines={1}>
					{invitation.email ?? "Invitation link"}
				</Text>
				<Text style={styles.rowSubtitle}>
					Expires {formatDate(invitation.expiresAt)}
				</Text>
			</View>
			<View style={styles.invitationActions}>
				<HouseholdButton
					label="Copy"
					onPress={() =>
						actions.copyText(invitation.acceptUrl, "Invitation link copied.")
					}
				/>
				<HouseholdButton
					variant="danger"
					label={revoking ? "Revoking" : "Revoke"}
					onPress={() => actions.revokeInvitation(invitation.id)}
					disabled={revoking}
				/>
			</View>
		</View>
	);
}

function HouseholdSettingsShell({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<SafeAreaView edges={["top", "bottom"]} style={styles.root}>
			<View style={styles.header}>
				<Text style={styles.headerLabel}>Household settings</Text>
				<Text style={styles.headerTitle} numberOfLines={1}>
					{title}
				</Text>
			</View>
			{children}
		</SafeAreaView>
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
				<HouseholdButton
					variant="primary"
					label="Try again"
					onPress={onRetry}
				/>
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

function settingsRows(
	state: Extract<HouseholdSettingsState, { status: "ready" }>,
	canRenameHousehold: boolean,
) {
	const rows: SettingsRow[] = [];
	if (canRenameHousehold) rows.push({ type: "householdName" });
	rows.push(
		{ type: "invitationForm" },
		{ type: "joinCode" },
		{ type: "section", id: "members", title: "Members" },
	);
	for (const member of state.members) rows.push({ type: "member", member });
	if (state.members.length === 0) {
		rows.push({
			type: "empty",
			id: "members-empty",
			label: "No Members found.",
		});
	}
	rows.push({ type: "leaveHousehold" });
	rows.push({
		type: "section",
		id: "invitations",
		title: "Pending Invitations",
	});
	for (const invitation of state.invitations) {
		rows.push({ type: "invitation", invitation });
	}
	if (state.invitations.length === 0) {
		rows.push({
			type: "empty",
			id: "invitations-empty",
			label: "No pending Invitations.",
		});
	}
	return rows;
}

function settingsRowKey(row: SettingsRow): string {
	if (row.type === "member") return `member:${row.member.membershipId}`;
	if (row.type === "invitation") return `invitation:${row.invitation.id}`;
	if (row.type === "section" || row.type === "empty") return row.id;
	return row.type;
}

function roleActionLabel(role: "owner" | "member"): string {
	return role === "owner" ? "Make Owner" : "Make Member";
}

function confirmRemoveMember(
	member: HouseholdMember,
	actions: HouseholdSettingsActions,
) {
	Alert.alert(
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
	Alert.alert(
		roleActionLabel(role),
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
					void actions.leaveHousehold();
				},
			},
		],
	);
}

function formatDate(timestamp: number): string {
	return new Date(timestamp).toLocaleDateString();
}

function formatJoinCode(code: string): string {
	return code.replace(/(.{4})/g, "$1 ").trim();
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
		flexDirection: "row",
		gap: theme.spacing(2),
		padding: theme.spacing(4),
		backgroundColor: theme.colors.surface,
	},
	listContent: {
		padding: theme.spacing(4),
		paddingBottom: theme.spacing(12),
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
	codeText: {
		...theme.typography.title,
		color: theme.colors.text,
	},
	nameText: {
		...theme.typography.body,
		color: theme.colors.text,
	},
	mutedText: {
		...theme.typography.body,
		color: theme.colors.textMuted,
	},
	rowActions: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: theme.spacing(2),
	},
	sectionTitle: {
		...theme.typography.captionStrong,
		color: theme.colors.textMuted,
		textTransform: "uppercase",
		marginTop: theme.spacing(3),
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
	rowTitle: {
		...theme.typography.body,
		fontWeight: theme.fontWeights.semibold,
		color: theme.colors.text,
	},
	rowSubtitle: {
		...theme.typography.caption,
		color: theme.colors.textMuted,
	},
	invitationActions: {
		flexDirection: "row",
		gap: theme.spacing(2),
	},
	memberActions: {
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "flex-end",
		gap: theme.spacing(2),
	},
	emptyText: {
		...theme.typography.body,
		color: theme.colors.textMuted,
		paddingVertical: theme.spacing(2),
	},
	notice: {
		padding: theme.spacing(3),
		marginBottom: theme.spacing(3),
		borderRadius: theme.radii.card,
		backgroundColor: theme.colors.surface,
		borderWidth: theme.borders.thin,
		borderColor: theme.colors.primary,
	},
	noticeText: {
		...theme.typography.callout,
		color: theme.colors.text,
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
