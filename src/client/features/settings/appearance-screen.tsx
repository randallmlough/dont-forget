import { useRouter } from "expo-router";
import { type SFSymbol, SymbolView } from "expo-symbols";
import { Pressable, ScrollView, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { ScreenScaffold } from "@/client/app-shell/screen-scaffold";
import type { AppearancePreference } from "@/client/theme/appearance-preference";
import { Card, CardContent } from "@/client/ui/card";
import { GlassSurface } from "@/client/ui/glass-surface";
import { ScreenSection } from "@/client/ui/screen-section";
import {
	type SettingsActions,
	type SettingsState,
	useSettings,
} from "./use-settings";

const appearanceOptions = ["system", "light", "dark"] as const;

export default function AppearanceScreen() {
	const router = useRouter();
	const { state, actions } = useSettings();
	const returnToSettings = () => {
		if (router.canGoBack()) {
			router.back();
			return;
		}
		router.replace("/settings");
	};

	return (
		<AppearanceScreenView
			actions={actions}
			onBack={returnToSettings}
			state={state}
		/>
	);
}

export function AppearanceScreenView({
	actions,
	onBack,
	state,
}: {
	actions: SettingsActions;
	onBack: () => void;
	state: SettingsState;
}) {
	return (
		<ScreenScaffold
			label="Settings"
			navigation={{ kind: "back", onPress: onBack }}
			title="Appearance"
		>
			<ScrollView
				contentContainerStyle={styles.content}
				contentInsetAdjustmentBehavior="automatic"
			>
				<Text style={styles.intro}>
					Choose how Don&apos;t Forget looks on this iPhone.
				</Text>

				<View accessibilityRole="radiogroup" style={styles.options}>
					{appearanceOptions.map((option) => (
						<AppearanceOption
							key={option}
							onSelect={() => {
								void actions.setAppearancePreference(option);
							}}
							preference={option}
							selected={state.appearancePreference === option}
						/>
					))}
				</View>

				{state.notice ? (
					<Card>
						<CardContent style={styles.noticeContent}>
							<Text style={styles.notice}>{state.notice}</Text>
						</CardContent>
					</Card>
				) : null}

				<ScreenSection title="Preview">
					<AppearancePreview />
				</ScreenSection>
				<Text style={styles.footer}>Changes apply immediately.</Text>
			</ScrollView>
		</ScreenScaffold>
	);
}

function AppearanceOption({
	onSelect,
	preference,
	selected,
}: {
	onSelect: () => void;
	preference: AppearancePreference;
	selected: boolean;
}) {
	const { theme } = useUnistyles();
	const symbol: SFSymbol =
		preference === "system"
			? "circle.lefthalf.filled"
			: preference === "light"
				? "sun.max"
				: "moon";

	return (
		<Pressable
			accessibilityLabel={appearanceLabel(preference)}
			accessibilityRole="radio"
			accessibilityState={{ selected }}
			onPress={onSelect}
			style={({ pressed }) => [
				styles.optionPressable,
				pressed ? styles.pressed : undefined,
			]}
		>
			<GlassSurface
				interactive
				style={styles.optionCard}
				tone={selected ? "selected" : "default"}
			>
				<View style={styles.optionPreview}>
					<ThemeMiniature preference={preference} />
					{selected ? (
						<View style={styles.checkmark}>
							<SymbolView
								accessibilityElementsHidden
								accessible={false}
								name="checkmark"
								size={13}
								tintColor={theme.colors.primaryForeground}
								weight="bold"
							/>
						</View>
					) : null}
				</View>
				<SymbolView
					accessibilityElementsHidden
					accessible={false}
					name={symbol}
					size={17}
					tintColor={theme.colors.mutedForeground}
					weight="medium"
				/>
				<Text style={styles.optionLabel}>{appearanceLabel(preference)}</Text>
			</GlassSurface>
		</Pressable>
	);
}

function ThemeMiniature({ preference }: { preference: AppearancePreference }) {
	return (
		<View
			style={[
				styles.miniature,
				preference === "dark" ? styles.miniatureDark : styles.miniatureLight,
			]}
		>
			{preference === "system" ? <View style={styles.systemDarkHalf} /> : null}
			<View
				style={[
					styles.miniatureTitle,
					preference === "dark"
						? styles.miniatureLineDark
						: styles.miniatureLineLight,
				]}
			/>
			{[0, 1, 2].map((line) => (
				<View
					key={line}
					style={[
						styles.miniatureRow,
						preference === "dark"
							? styles.miniatureLineDark
							: styles.miniatureLineLight,
					]}
				/>
			))}
		</View>
	);
}

function AppearancePreview() {
	return (
		<Card>
			<View style={styles.previewCard}>
				<View style={styles.previewHeading}>
					<Text style={styles.previewTitle}>Groceries</Text>
					<SymbolView
						accessibilityElementsHidden
						accessible={false}
						name="person.2"
						size={18}
						weight="medium"
					/>
				</View>
				<View style={styles.previewRows}>
					<PreviewItem label="Whole milk" />
					<PreviewItem label="Sourdough bread" />
				</View>
				<GlassSurface style={styles.previewComposer}>
					<SymbolView
						accessibilityElementsHidden
						accessible={false}
						name="plus"
						size={17}
						weight="medium"
					/>
					<Text style={styles.previewComposerLabel}>Add an Item</Text>
				</GlassSurface>
			</View>
		</Card>
	);
}

function PreviewItem({ label }: { label: string }) {
	return (
		<View style={styles.previewRow}>
			<View style={styles.previewCheckbox} />
			<Text style={styles.previewItemLabel}>{label}</Text>
		</View>
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

const styles = StyleSheet.create((theme) => ({
	content: {
		paddingHorizontal: theme.spacing(5),
		paddingBottom: theme.spacing(12),
		gap: theme.spacing(6),
	},
	intro: {
		...theme.typography.body,
		color: theme.colors.mutedForeground,
		marginTop: -theme.spacing(2),
	},
	options: {
		flexDirection: "row",
		gap: theme.spacing(2),
	},
	optionPressable: {
		flex: 1,
	},
	optionCard: {
		minHeight: theme.spacing(43),
		alignItems: "center",
		justifyContent: "center",
		gap: theme.spacing(2),
		padding: theme.spacing(2),
		borderRadius: theme.radii["2xl"],
	},
	optionPreview: {
		position: "relative",
	},
	optionLabel: {
		...theme.typography.callout,
		color: theme.colors.foreground,
	},
	checkmark: {
		position: "absolute",
		top: -theme.spacing(2),
		right: -theme.spacing(2),
		width: theme.spacing(7),
		height: theme.spacing(7),
		alignItems: "center",
		justifyContent: "center",
		borderRadius: theme.radii.full,
		backgroundColor: theme.colors.primary,
	},
	miniature: {
		width: theme.spacing(18),
		height: theme.spacing(24),
		gap: theme.spacing(2),
		padding: theme.spacing(2),
		borderRadius: theme.radii.xl,
		overflow: "hidden",
	},
	miniatureLight: {
		backgroundColor: theme.colors.appearanceLightBackground,
	},
	miniatureDark: {
		backgroundColor: theme.colors.appearanceDarkBackground,
	},
	systemDarkHalf: {
		position: "absolute",
		top: 0,
		right: 0,
		bottom: 0,
		width: "50%",
		backgroundColor: theme.colors.appearanceDarkBackground,
	},
	miniatureTitle: {
		width: "48%",
		height: theme.spacing(1),
		borderRadius: theme.radii.full,
	},
	miniatureRow: {
		width: "100%",
		height: theme.spacing(3),
		borderRadius: theme.radii.full,
	},
	miniatureLineLight: {
		backgroundColor: theme.colors.appearanceLightSurface,
	},
	miniatureLineDark: {
		backgroundColor: theme.colors.appearanceDarkSurface,
	},
	previewCard: {
		gap: theme.spacing(3),
		padding: theme.spacing(4),
	},
	previewHeading: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	previewTitle: {
		fontSize: theme.typography.title.fontSize,
		fontFamily: theme.fontFamilies.serif,
		color: theme.colors.foreground,
	},
	previewRows: {
		borderWidth: theme.borders.hairline,
		borderColor: theme.colors.border,
		borderRadius: theme.radii.xl,
		overflow: "hidden",
	},
	previewRow: {
		minHeight: theme.spacing(12),
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(3),
		paddingHorizontal: theme.spacing(3),
		borderBottomWidth: theme.borders.hairline,
		borderBottomColor: theme.colors.border,
	},
	previewCheckbox: {
		width: theme.spacing(5),
		height: theme.spacing(5),
		borderWidth: theme.borders.thin,
		borderColor: theme.colors.mutedForeground,
		borderRadius: theme.radii.full,
	},
	previewItemLabel: {
		...theme.typography.callout,
		color: theme.colors.foreground,
	},
	previewComposer: {
		minHeight: theme.spacing(12),
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(2),
		paddingHorizontal: theme.spacing(3),
		borderRadius: theme.radii.full,
	},
	previewComposerLabel: {
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
	footer: {
		...theme.typography.caption,
		color: theme.colors.mutedForeground,
	},
	pressed: {
		opacity: theme.opacities.pressed,
	},
}));
