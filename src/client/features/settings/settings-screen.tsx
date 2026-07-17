import { useRouter } from "expo-router";
import { type ReactNode, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { ScreenScaffold } from "@/client/app-shell/screen-scaffold";
import { AuthTextInput } from "@/client/features/auth/auth-text-input";
import type { AppearancePreference } from "@/client/theme/appearance-preference";
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
		try {
			await actions.signOut();
		} catch {
			// The Authenticated App Session provider owns recovery when Clerk sign-out
			// fails after local cleanup. Settings has already returned the User Home.
		}
	}

	return (
		<ScreenScaffold label="Settings" title="App settings">
			<ScrollView
				contentContainerStyle={styles.content}
				keyboardShouldPersistTaps="handled"
			>
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
		</ScreenScaffold>
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
					error={state.userError}
					notice={state.userNotice}
					onSave={actions.updateUserName}
					updateInFlight={state.userUpdateInFlight}
					user={state.user}
				/>,
				<SettingsRow
					key="household"
					label="Household settings"
					onPress={() => navigate("/household/settings")}
					showChevron
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
	error,
	notice,
	onSave,
	updateInFlight,
	user,
}: {
	error: string | null;
	notice: string | null;
	onSave: (input: {
		firstName: string | null;
		lastName: string | null;
	}) => Promise<boolean>;
	updateInFlight: boolean;
	user: SettingsState["user"];
}) {
	const [expanded, setExpanded] = useState(false);
	const [firstNameDraft, setFirstNameDraft] = useState<string | null>(null);
	const [lastNameDraft, setLastNameDraft] = useState<string | null>(null);
	const [validationMessage, setValidationMessage] = useState<string | null>(
		null,
	);
	const userFirstName = user.firstName ?? "";
	const userLastName = user.lastName ?? "";
	const firstName = firstNameDraft ?? userFirstName;
	const lastName = lastNameDraft ?? userLastName;

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
			setFirstNameDraft(nextFirstName ?? "");
			setLastNameDraft(nextLastName ?? "");
		}
	}

	return (
		<View style={styles.userNameBlock}>
			<Pressable
				accessibilityLabel="User name"
				accessibilityRole="button"
				accessibilityState={{ expanded }}
				onPress={() => {
					setExpanded((current) => {
						const nextExpanded = !current;
						if (nextExpanded) {
							setFirstNameDraft(null);
							setLastNameDraft(null);
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
					<Text style={styles.rowTitle}>User name</Text>
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
						onChangeText={(text) => {
							setFirstNameDraft(text);
						}}
						placeholder="First name"
						returnKeyType="next"
						value={firstName}
					/>
					<AuthTextInput
						accessibilityLabel="Last name"
						autoCapitalize="words"
						autoComplete="family-name"
						editable={!updateInFlight}
						onChangeText={(text) => {
							setLastNameDraft(text);
						}}
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
	userNameForm: {
		gap: theme.spacing(3),
		paddingHorizontal: theme.spacing(4),
		paddingBottom: theme.spacing(4),
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
		borderCurve: "continuous",
		backgroundColor: theme.colors.text,
	},
	primaryButtonText: {
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
