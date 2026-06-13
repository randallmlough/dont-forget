import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { useState } from "react";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

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
	const sections = settingsSections(state, actions, router.push);

	return (
		<SafeAreaView edges={["top", "bottom"]} style={styles.root}>
			<View style={styles.header}>
				<View style={styles.headerTextGroup}>
					<Text style={styles.headerLabel}>Settings</Text>
					<Text style={styles.headerTitle} numberOfLines={1}>
						App settings
					</Text>
				</View>
				<View style={styles.headerAction} testID="settings-header-action">
					<Pressable
						accessibilityLabel="Back to Home"
						accessibilityRole="button"
						onPress={() => router.replace("/")}
						style={({ pressed }) => [
							styles.headerButton,
							pressed ? styles.headerButtonPressed : undefined,
						]}
					>
						<Text style={styles.headerButtonLabel}>Home</Text>
					</Pressable>
				</View>
			</View>
			<ScrollView contentContainerStyle={styles.content}>
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
			id: "account",
			title: "Account",
			rows: [
				<ProfileSettingsForm
					key="profile"
					profile={state.profile}
					error={state.profileError}
					notice={state.profileNotice}
					updateInFlight={state.profileUpdateInFlight}
					onSave={actions.updateProfile}
				/>,
				<SettingsRow
					key="household"
					label="Household settings"
					onPress={() => navigate("/household/settings")}
					showChevron
				/>,
				<DeleteAccountControl
					key="delete-account"
					error={state.accountDeletionError}
					deleteInFlight={state.accountDeletionInFlight}
					onDelete={actions.deleteAccount}
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

function ProfileSettingsForm({
	profile,
	error,
	notice,
	updateInFlight,
	onSave,
}: {
	profile: SettingsState["profile"];
	error: string | null;
	notice: string | null;
	updateInFlight: boolean;
	onSave: (input: {
		firstName: string | null;
		lastName: string | null;
	}) => Promise<boolean>;
}) {
	const [expanded, setExpanded] = useState(false);
	const [firstName, setFirstName] = useState(profile.firstName ?? "");
	const [lastName, setLastName] = useState(profile.lastName ?? "");
	const [validationMessage, setValidationMessage] = useState<string | null>(
		null,
	);

	async function saveProfile() {
		const nextFirstName = emptyToNull(firstName);
		const nextLastName = emptyToNull(lastName);
		if (!nextFirstName && !nextLastName) {
			setValidationMessage("Provide a first or last name.");
			return;
		}
		setValidationMessage(null);
		await onSave({
			firstName: nextFirstName,
			lastName: nextLastName,
		});
	}

	return (
		<View style={styles.profileBlock}>
			<Pressable
				accessibilityLabel="Profile"
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
				<View style={styles.rowTextGroup}>
					<Text style={styles.rowTitle}>Profile</Text>
					<Text style={styles.rowSubtitle}>
						{profile.displayName ?? profile.email ?? "No name set"}
					</Text>
				</View>
				<Text style={styles.chevron}>{expanded ? "⌃" : "›"}</Text>
			</Pressable>
			{expanded ? (
				<View style={styles.profileForm}>
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
							void saveProfile();
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

function DeleteAccountControl({
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

	async function deleteAccount() {
		if (!confirmed || deleteInFlight) return;
		await onDelete();
	}

	return (
		<View style={styles.deleteAccountBlock}>
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
				<View style={styles.deleteAccountForm}>
					<Text style={styles.deleteAccountCopy}>
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
							void deleteAccount();
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
	const { rt } = useUnistyles();
	const selectedPreference = runtimeAppearancePreference(preference, {
		hasAdaptiveThemes: rt.hasAdaptiveThemes,
		themeName: rt.themeName,
	});

	return (
		<View style={styles.preferenceRow}>
			<View style={styles.rowTextGroup}>
				<Text style={styles.rowTitle}>Appearance</Text>
				<Text style={styles.rowSubtitle}>
					{appearanceLabel(selectedPreference)}
				</Text>
			</View>
			<View style={styles.segmentedControl}>
				{(["system", "light", "dark"] as const).map((option) => {
					const selected = option === selectedPreference;
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

function runtimeAppearancePreference(
	fallback: AppearancePreference,
	runtime: { hasAdaptiveThemes: boolean; themeName?: string },
): AppearancePreference {
	if (runtime.hasAdaptiveThemes) return "system";
	if (runtime.themeName === "light" || runtime.themeName === "dark") {
		return runtime.themeName;
	}
	return fallback;
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
	headerTextGroup: {
		flex: 1,
		minWidth: 0,
	},
	headerAction: {
		paddingRight: theme.spacing(14),
	},
	headerLabel: {
		...theme.typography.captionStrong,
		color: theme.colors.textMuted,
	},
	headerTitle: {
		...theme.typography.headline,
		color: theme.colors.text,
	},
	headerButton: {
		minHeight: theme.spacing(11),
		paddingHorizontal: theme.spacing(3),
		borderRadius: theme.radii.control,
		borderCurve: "continuous",
		alignItems: "center",
		justifyContent: "center",
		borderWidth: theme.borders.thin,
		borderColor: theme.colors.border,
		backgroundColor: theme.colors.surface,
	},
	headerButtonPressed: {
		opacity: theme.opacities.pressed,
	},
	headerButtonLabel: {
		...theme.typography.callout,
		color: theme.colors.text,
		fontWeight: theme.fontWeights.bold,
	},
	content: {
		padding: theme.spacing(4),
		paddingBottom: theme.spacing(12),
		gap: theme.spacing(5),
	},
	section: {
		gap: theme.spacing(2),
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
	profileBlock: {
		borderBottomWidth: theme.borders.hairline,
		borderBottomColor: theme.colors.border,
	},
	deleteAccountBlock: {
		borderBottomWidth: theme.borders.hairline,
		borderBottomColor: theme.colors.border,
	},
	profileForm: {
		gap: theme.spacing(3),
		paddingHorizontal: theme.spacing(4),
		paddingBottom: theme.spacing(4),
	},
	deleteAccountForm: {
		gap: theme.spacing(3),
		paddingHorizontal: theme.spacing(4),
		paddingBottom: theme.spacing(4),
	},
	deleteAccountCopy: {
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
