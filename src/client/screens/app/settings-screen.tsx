import { useRouter } from "expo-router";
import { type SFSymbol, SymbolView } from "expo-symbols";
import { ScrollView } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { ScreenScaffold } from "@/client/app-shell/screen-scaffold";
import {
	type SettingsActions,
	type SettingsState,
	useSettings,
} from "@/client/features/settings/use-settings";
import {
	Item,
	ItemActions,
	ItemActionsLabel,
	ItemContent,
	ItemGroup,
	ItemMedia,
	ItemPressable,
	ItemSeparator,
	ItemTitle,
} from "@/client/ui/item";
import { ScreenSection } from "@/client/ui/screen-section";

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
	const userName = state.user.displayName ?? state.user.email ?? "Profile";

	return (
		<ScreenScaffold label="Don't Forget" title="Settings">
			<ScrollView
				contentContainerStyle={styles.content}
				contentInsetAdjustmentBehavior="automatic"
			>
				<ScreenSection title="Your App">
					<ItemGroup variant="outline">
						<SettingsItem
							title="Profile"
							onPress={() => router.push("/profile")}
							symbol="person.crop.circle"
							value={userName}
						/>
						<ItemSeparator />
						<SettingsItem
							title="Appearance"
							onPress={() => router.push("/settings/appearance")}
							symbol="circle.lefthalf.filled"
							value={appearanceLabel(state.appearancePreference)}
						/>
					</ItemGroup>
				</ScreenSection>

				<ScreenSection title="Household">
					<ItemGroup variant="outline">
						<SettingsItem
							title="Household"
							onPress={() => router.push("/household/settings")}
							symbol="house"
						/>
						<ItemSeparator />
						<SettingsItem
							title="Members & Invitations"
							onPress={() => router.push("/household/members")}
							symbol="person.2"
						/>
						<ItemSeparator />
						<SettingsItem
							title="Switch Household"
							onPress={() => router.push("/household/switch")}
							symbol="arrow.left.arrow.right"
						/>
					</ItemGroup>
				</ScreenSection>

				<ScreenSection title="About">
					<ItemGroup variant="outline">
						{state.privacyPolicyUrl ? (
							<SettingsItem
								title="Privacy Policy"
								onPress={() => {
									void actions.openPrivacyPolicy();
								}}
								symbol="hand.raised"
							/>
						) : null}
						{state.privacyPolicyUrl ? <ItemSeparator /> : null}
						{state.termsUrl ? (
							<SettingsItem
								title="Terms of Service"
								onPress={() => {
									void actions.openTerms();
								}}
								symbol="doc.text"
							/>
						) : null}
						{state.termsUrl ? <ItemSeparator /> : null}
						<SettingsItem
							title="Version"
							symbol="info.circle"
							value={versionLabel(state.appVersion, state.appEnv)}
						/>
					</ItemGroup>
				</ScreenSection>
			</ScrollView>
		</ScreenScaffold>
	);
}

function SettingsItem({
	onPress,
	symbol,
	title,
	value,
}: {
	onPress?: () => void;
	symbol: SFSymbol;
	title: string;
	value?: string;
}) {
	const { theme } = useUnistyles();
	const content = (
		<>
			<ItemMedia variant="icon">
				<SymbolView
					accessibilityElementsHidden
					accessible={false}
					name={symbol}
					size={theme.spacing(4)}
					tintColor={theme.colors.foreground}
					weight="medium"
				/>
			</ItemMedia>
			<ItemContent>
				<ItemTitle>{title}</ItemTitle>
			</ItemContent>
			<ItemActions>
				{value ? <ItemActionsLabel>{value}</ItemActionsLabel> : null}
				{onPress ? (
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

	if (!onPress) return <Item size="sm">{content}</Item>;
	return (
		<ItemPressable accessibilityLabel={title} onPress={onPress} size="sm">
			{content}
		</ItemPressable>
	);
}

function appearanceLabel(
	preference: SettingsState["appearancePreference"],
): string {
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
	content: {
		paddingHorizontal: theme.spacing(5),
		paddingBottom: theme.spacing(12),
		gap: theme.spacing(6),
	},
}));
