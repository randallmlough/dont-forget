import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { useState } from "react";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

import { AuthTextInput } from "@/components/auth/auth-text-input";
import type { AppearancePreference } from "./appearance-preference";
import {
	type SettingsActions,
	type SettingsState,
	useSettings,
} from "./use-settings";

type SettingsSection = {
	id: string;
	title: string;
	rows: ReactNode[];
};

export default function SettingsScreen() {
	const { state, actions } = useSettings();
	return <SettingsScreenView state={state} actions={actions} />;
}

export function SettingsScreenView({
	state,
	actions,
}: {
	state: SettingsState;
	actions: SettingsActions;
}) {
	const router = useRouter();
	const sections = settingsSections(
		state,
		{ ...actions, signOut: signOutFromSettings },
		router.push,
	);

	async function signOutFromSettings() {
		router.replace("/");
		await actions.signOut();
	}

	return (
		<SafeAreaView edges={["top", "bottom"]} style={styles.root}>
			<View style={styles.header}>
				<View style={styles.headerTopRow}>
					<Text style={styles.headerLabel}>Settings</Text>
					<Pressable
						accessibilityRole="button"
						onPress={() => router.replace("/")}
						style={({ pressed }) => [
							styles.homeButton,
							pressed ? styles.rowPressed : undefined,
						]}
					>
						<Text style={styles.homeButtonLabel}>Home</Text>
					</Pressable>
				</View>
				<Text style={styles.headerTitle}>App settings</Text>
			</View>
			<ScrollView contentContainerStyle={styles.content}>
				{state.notice ? (
					<View style={styles.notice}>
						<Text style={styles.noticeText}>{state.notice}</Text>
					</View>
				) : null}
				{sections.map((section) => (
					<View key={section.id} style={styles.section}>
						<Text style={styles.sectionTitle}>{section.title}</Text>
						<View style={styles.sectionRows}>{section.rows}</View>
					</View>
				))}
			</ScrollView>
		</SafeAreaView>
	);
}

function settingsSections(
	state: SettingsState,
	actions: SettingsActions,
	navigate: (href: "/household/settings") => void,
): SettingsSection[] {
	const aboutRows: ReactNode[] = [];
	if (state.privacyPolicyUrl) {
		aboutRows.push(
			<SettingsRow
				key="privacy"
				label="Privacy Policy"
				onPress={actions.openPrivacyPolicy}
				showChevron
			/>,
		);
	}
	if (state.termsUrl) {
		aboutRows.push(
			<SettingsRow
				key="terms"
				label="Terms of Service"
				onPress={actions.openTerms}
				showChevron
			/>,
		);
	}
	aboutRows.push(
		<SettingsRow
			key="version"
			label="Version"
			value={versionLabel(state.appVersion, state.appEnv)}
		/>,
	);

	return [
		{
			id: "user",
			title: "User",
			rows: [
				<UserNameSettingsForm
					key="user-name"
					user={state.user}
					error={state.userError}
					notice={state.userNotice}
					updateInFlight={state.userUpdateInFlight}
					onSave={actions.updateUserName}
				/>,
				<SettingsRow
					key="household"
					label="Household settings"
					onPress={() => navigate("/household/settings")}
					showChevron
				/>,
				<DeleteUserControl
					key="delete-user"
					error={state.userDeletionError}
					deleteInFlight={state.userDeletionInFlight}
					onDelete={actions.deleteUser}
				/>,
			],
		},
		{
			id: "appearance",
			title: "Appearance",
			rows: [
				<AppearancePreferenceControl
					key="appearance"
					preference={state.appearancePreference}
					onChange={actions.setAppearancePreference}
				/>,
			],
		},
		{
			id: "notifications",
			title: "Notifications",
			rows: [
				<NotificationToggleRow
					key="notifications-toggle"
					enabled={state.notificationsEnabled}
					notice={state.notificationNotice}
					onChange={actions.setNotificationsEnabled}
				/>,
				...(state.appEnv === "production"
					? []
					: [
							<SettingsRow
								key="test-notification"
								label="Send test notification"
								onPress={actions.sendTestNotification}
							/>,
						]),
			],
		},
		{ id: "about", title: "About", rows: aboutRows },
		{
			id: "sign-out",
			title: "Sign out",
			rows: [
				<SettingsRow
					key="sign-out"
					label="Sign out"
					onPress={actions.signOut}
					variant="destructive"
				/>,
			],
		},
	];
}

function UserNameSettingsForm({
	user,
	error,
	notice,
	updateInFlight,
	onSave,
}: {
	user: SettingsState["user"];
	error: string | null;
	notice: string | null;
	updateInFlight: boolean;
	onSave: (input: {
		firstName: string | null;
		lastName: string | null;
	}) => Promise<boolean>;
}) {
	const [expanded, setExpanded] = useState(false);
	const [firstName, setFirstName] = useState(user.firstName ?? "");
	const [lastName, setLastName] = useState(user.lastName ?? "");
	const [validationMessage, setValidationMessage] = useState<string | null>(
		null,
	);

	async function saveUserName() {
		const nextFirstName = emptyToNull(firstName);
		const nextLastName = emptyToNull(lastName);
		if (!nextFirstName && !nextLastName) {
			setValidationMessage("Provide a first or last name.");
			return;
		}
		setValidationMessage(null);
		const saved = await onSave({
			firstName: nextFirstName,
			lastName: nextLastName,
		});
		if (saved) {
			setFirstName(nextFirstName ?? "");
			setLastName(nextLastName ?? "");
		}
	}

	return (
		<View style={styles.userNameBlock}>
			<Pressable
				accessibilityLabel="Name"
				accessibilityRole="button"
				accessibilityState={{ expanded }}
				onPress={() => {
					setExpanded((current) => {
						const nextExpanded = !current;
						if (nextExpanded) {
							setFirstName(user.firstName ?? "");
							setLastName(user.lastName ?? "");
							setValidationMessage(null);
						}
						return nextExpanded;
					});
				}}
				style={({ pressed }) => [
					styles.row,
					pressed ? styles.rowPressed : undefined,
				]}
			>
				<View style={styles.rowTextGroup}>
					<Text style={styles.rowTitle}>Name</Text>
					<Text style={styles.rowSubtitle}>
						{user.displayName ?? user.email ?? "No name set"}
					</Text>
				</View>
				<Text style={styles.chevron}>{expanded ? "⌃" : "›"}</Text>
			</Pressable>
			{expanded ? (
				<View style={styles.userNameForm}>
					<AuthTextInput
						accessibilityLabel="First name"
						autoCapitalize="words"
						autoComplete="given-name"
						editable={!updateInFlight}
						onChangeText={setFirstName}
						placeholder="First name"
						returnKeyType="next"
						value={firstName}
					/>
					<AuthTextInput
						accessibilityLabel="Last name"
						autoCapitalize="words"
						autoComplete="family-name"
						editable={!updateInFlight}
						onChangeText={setLastName}
						placeholder="Last name"
						returnKeyType="done"
						value={lastName}
					/>
					{validationMessage ? (
						<Text style={styles.formError}>{validationMessage}</Text>
					) : null}
					{error ? <Text style={styles.formError}>{error}</Text> : null}
					{notice ? <Text style={styles.formNotice}>{notice}</Text> : null}
					<Pressable
						accessibilityRole="button"
						accessibilityState={{ disabled: updateInFlight }}
						disabled={updateInFlight}
						onPress={() => {
							void saveUserName();
						}}
						style={({ pressed }) => [
							styles.primaryButton,
							pressed ? styles.rowPressed : undefined,
							updateInFlight ? styles.disabledButton : undefined,
						]}
					>
						<Text style={styles.primaryButtonText}>
							{updateInFlight ? "Saving" : "Save"}
						</Text>
					</Pressable>
				</View>
			) : null}
		</View>
	);
}

function DeleteUserControl({
	error,
	deleteInFlight,
	onDelete,
}: {
	error: string | null;
	deleteInFlight: boolean;
	onDelete: () => Promise<boolean>;
}) {
	const [expanded, setExpanded] = useState(false);
	const [confirmation, setConfirmation] = useState("");
	const confirmed = confirmation === "DELETE";

	async function deleteUser() {
		if (!confirmed || deleteInFlight) return;
		await onDelete();
	}

	return (
		<View style={styles.deleteUserBlock}>
			<Pressable
				accessibilityLabel="Delete Account"
				accessibilityRole="button"
				accessibilityState={{ expanded }}
				onPress={() => {
					setExpanded((current) => !current);
				}}
				style={({ pressed }) => [
					styles.row,
					pressed ? styles.rowPressed : undefined,
				]}
			>
				<Text style={[styles.rowTitle, styles.destructiveText]}>
					Delete Account
				</Text>
				<Text style={styles.chevron}>{expanded ? "⌃" : "›"}</Text>
			</Pressable>
			{expanded ? (
				<View style={styles.deleteUserForm}>
					<Text style={styles.deleteUserCopy}>
						Your account, your Memberships, and any Household where you are the
						only Member — including all of its Lists — are permanently deleted.
						This cannot be undone.
					</Text>
					<AuthTextInput
						accessibilityLabel="Type DELETE to confirm"
						autoCapitalize="characters"
						autoCorrect={false}
						editable={!deleteInFlight}
						onChangeText={setConfirmation}
						placeholder="DELETE"
						returnKeyType="done"
						value={confirmation}
					/>
					{error ? <Text style={styles.formError}>{error}</Text> : null}
					<Pressable
						accessibilityLabel="Permanently delete account"
						accessibilityRole="button"
						accessibilityState={{ disabled: !confirmed || deleteInFlight }}
						disabled={!confirmed || deleteInFlight}
						onPress={() => {
							void deleteUser();
						}}
						style={({ pressed }) => [
							styles.destructiveButton,
							pressed ? styles.rowPressed : undefined,
							!confirmed || deleteInFlight ? styles.disabledButton : undefined,
						]}
					>
						<Text style={styles.destructiveButtonText}>
							{deleteInFlight ? "Deleting" : "Delete Account"}
						</Text>
					</Pressable>
				</View>
			) : null}
		</View>
	);
}

function AppearancePreferenceControl({
	preference,
	onChange,
}: {
	preference: AppearancePreference;
	onChange: (preference: AppearancePreference) => Promise<void>;
}) {
	return (
		<View style={styles.preferenceRow}>
			<View style={styles.rowTextGroup}>
				<Text style={styles.rowTitle}>Appearance</Text>
				<Text style={styles.rowSubtitle}>{appearanceLabel(preference)}</Text>
			</View>
			<View style={styles.segmentedControl}>
				{(["system", "light", "dark"] as const).map((option) => {
					const selected = option === preference;
					return (
						<Pressable
							key={option}
							accessibilityRole="button"
							accessibilityState={{ selected }}
							onPress={() => {
								void onChange(option);
							}}
							style={({ pressed }) => [
								styles.segment,
								selected ? styles.segmentSelected : undefined,
								pressed ? styles.rowPressed : undefined,
							]}
						>
							<Text
								style={[
									styles.segmentLabel,
									selected ? styles.segmentLabelSelected : undefined,
								]}
							>
								{appearanceLabel(option)}
							</Text>
						</Pressable>
					);
				})}
			</View>
		</View>
	);
}

function NotificationToggleRow({
	enabled,
	notice,
	onChange,
}: {
	enabled: boolean;
	notice: string | null;
	onChange: (enabled: boolean) => Promise<void>;
}) {
	return (
		<View style={styles.row}>
			<View style={styles.rowTextGroup}>
				<Text style={styles.rowTitle}>Notifications</Text>
				<Text style={styles.rowSubtitle}>
					{notice ?? "Allow push notifications for this User"}
				</Text>
			</View>
			<Switch
				accessibilityLabel="Notifications"
				accessibilityRole="switch"
				value={enabled}
				onValueChange={(value) => {
					void onChange(value);
				}}
			/>
		</View>
	);
}

function SettingsRow({
	label,
	value,
	onPress,
	showChevron = false,
	variant = "default",
}: {
	label: string;
	value?: string;
	onPress?: () => void | Promise<void>;
	showChevron?: boolean;
	variant?: "default" | "destructive";
}) {
	const content = (
		<>
			<Text
				style={[
					styles.rowTitle,
					variant === "destructive" ? styles.destructiveText : undefined,
				]}
			>
				{label}
			</Text>
			<View style={styles.rowMeta}>
				{value ? <Text style={styles.rowValue}>{value}</Text> : null}
				{showChevron ? <Text style={styles.chevron}>›</Text> : null}
			</View>
		</>
	);

	if (!onPress) {
		return <View style={styles.row}>{content}</View>;
	}

	return (
		<Pressable
			accessibilityRole="button"
			onPress={() => {
				void onPress();
			}}
			style={({ pressed }) => [
				styles.row,
				pressed ? styles.rowPressed : undefined,
			]}
		>
			{content}
		</Pressable>
	);
}

function appearanceLabel(preference: AppearancePreference): string {
	switch (preference) {
		case "system":
			return "System";
		case "light":
			return "Light";
		case "dark":
			return "Dark";
	}
}

function versionLabel(
	version: string,
	appEnv: SettingsState["appEnv"],
): string {
	if (appEnv === "production") return version;
	return `${version} (${appEnv})`;
}

function emptyToNull(value: string): string | null {
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

const styles = StyleSheet.create((theme) => ({
	root: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: theme.spacing(3),
		paddingHorizontal: theme.spacing(5),
		paddingTop: theme.spacing(4.5),
		paddingBottom: theme.spacing(3),
		backgroundColor: theme.colors.surface,
		borderBottomWidth: theme.borders.hairline,
		borderBottomColor: theme.colors.border,
	},
	headerTopRow: {
		minHeight: theme.spacing(11),
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: theme.spacing(3),
	},
	headerLabel: {
		...theme.typography.captionStrong,
		color: theme.colors.textMuted,
	},
	headerTitle: {
		...theme.typography.headline,
		color: theme.colors.text,
	},
	homeButton: {
		minHeight: theme.spacing(11),
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: theme.spacing(3),
		borderWidth: theme.borders.thin,
		borderColor: theme.colors.border,
		borderRadius: theme.radii.control,
		backgroundColor: theme.colors.surface,
	},
	homeButtonLabel: {
		...theme.typography.callout,
		color: theme.colors.text,
		fontWeight: theme.fontWeights.semibold,
	},
	content: {
		padding: theme.spacing(4),
		paddingBottom: theme.spacing(12),
		gap: theme.spacing(5),
	},
	section: {
		gap: theme.spacing(2),
	},
	notice: {
		paddingHorizontal: theme.spacing(4),
		paddingVertical: theme.spacing(3),
		borderWidth: theme.borders.thin,
		borderColor: theme.colors.border,
		borderRadius: theme.radii.card,
		backgroundColor: theme.colors.surface,
	},
	noticeText: {
		...theme.typography.callout,
		color: theme.colors.text,
	},
	sectionTitle: {
		...theme.typography.captionStrong,
		color: theme.colors.textMuted,
		textTransform: "uppercase",
	},
	sectionRows: {
		borderWidth: theme.borders.thin,
		borderColor: theme.colors.border,
		borderRadius: theme.radii.card,
		backgroundColor: theme.colors.surface,
		overflow: "hidden",
	},
	row: {
		minHeight: theme.spacing(13),
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: theme.spacing(3),
		paddingHorizontal: theme.spacing(4),
		paddingVertical: theme.spacing(3),
		borderBottomWidth: theme.borders.hairline,
		borderBottomColor: theme.colors.border,
	},
	userNameBlock: {
		borderBottomWidth: theme.borders.hairline,
		borderBottomColor: theme.colors.border,
	},
	deleteUserBlock: {
		borderBottomWidth: theme.borders.hairline,
		borderBottomColor: theme.colors.border,
	},
	userNameForm: {
		gap: theme.spacing(3),
		paddingHorizontal: theme.spacing(4),
		paddingBottom: theme.spacing(4),
	},
	deleteUserForm: {
		gap: theme.spacing(3),
		paddingHorizontal: theme.spacing(4),
		paddingBottom: theme.spacing(4),
	},
	deleteUserCopy: {
		...theme.typography.callout,
		color: theme.colors.text,
	},
	preferenceRow: {
		gap: theme.spacing(3),
		paddingHorizontal: theme.spacing(4),
		paddingVertical: theme.spacing(3),
		borderBottomWidth: theme.borders.hairline,
		borderBottomColor: theme.colors.border,
	},
	rowPressed: {
		opacity: theme.opacities.pressed,
	},
	rowTextGroup: {
		gap: theme.spacing(1),
	},
	rowTitle: {
		...theme.typography.body,
		color: theme.colors.text,
	},
	rowSubtitle: {
		...theme.typography.caption,
		color: theme.colors.textMuted,
	},
	rowMeta: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(2),
		minWidth: 0,
	},
	rowValue: {
		...theme.typography.callout,
		color: theme.colors.textMuted,
	},
	chevron: {
		...theme.typography.title,
		color: theme.colors.textMuted,
	},
	destructiveText: {
		color: theme.colors.destructive,
		fontWeight: theme.fontWeights.bold,
	},
	formError: {
		...theme.typography.caption,
		color: theme.colors.destructive,
	},
	formNotice: {
		...theme.typography.caption,
		color: theme.colors.textMuted,
	},
	primaryButton: {
		minHeight: theme.spacing(11),
		alignItems: "center",
		justifyContent: "center",
		borderRadius: theme.radii.control,
		backgroundColor: theme.colors.text,
	},
	primaryButtonText: {
		...theme.typography.controlLabel,
		color: theme.colors.inverseText,
	},
	destructiveButton: {
		minHeight: theme.spacing(11),
		alignItems: "center",
		justifyContent: "center",
		borderRadius: theme.radii.control,
		backgroundColor: theme.colors.destructive,
	},
	destructiveButtonText: {
		...theme.typography.controlLabel,
		color: theme.colors.inverseText,
	},
	disabledButton: {
		opacity: theme.opacities.disabled,
	},
	segmentedControl: {
		flexDirection: "row",
		borderWidth: theme.borders.thin,
		borderColor: theme.colors.border,
		borderRadius: theme.radii.control,
		backgroundColor: theme.colors.background,
		overflow: "hidden",
	},
	segment: {
		flex: 1,
		minHeight: theme.spacing(10),
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: theme.spacing(2),
	},
	segmentSelected: {
		backgroundColor: theme.colors.text,
	},
	segmentLabel: {
		...theme.typography.controlLabel,
		color: theme.colors.text,
	},
	segmentLabelSelected: {
		color: theme.colors.inverseText,
	},
}));
