import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

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
			id: "household",
			title: "Household",
			rows: [
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
