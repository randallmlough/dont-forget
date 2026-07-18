import { useRouter } from "expo-router";
import { ScrollView, Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { ScreenScaffold } from "@/client/app-shell/screen-scaffold";
import {
	SurfaceCard,
	SurfaceRow,
	SurfaceSection,
} from "@/client/ui/settings-surface";
import {
	type SettingsActions,
	type SettingsState,
	useSettings,
} from "./use-settings";

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
				{state.notice ? (
					<SurfaceCard>
						<Text style={styles.notice}>{state.notice}</Text>
					</SurfaceCard>
				) : null}

				<SurfaceSection title="Your App">
					<SurfaceCard>
						<SurfaceRow
							divider
							label="Profile"
							onPress={() => router.push("/profile")}
							symbol="person.crop.circle"
							value={userName}
						/>
						<SurfaceRow
							label="Appearance"
							onPress={() => router.push("/settings/appearance")}
							symbol="circle.lefthalf.filled"
							value={appearanceLabel(state.appearancePreference)}
						/>
					</SurfaceCard>
				</SurfaceSection>

				<SurfaceSection title="Household">
					<SurfaceCard>
						<SurfaceRow
							divider
							label="Household"
							onPress={() => router.push("/household/settings")}
							symbol="house"
						/>
						<SurfaceRow
							divider
							label="Members & Invitations"
							onPress={() => router.push("/household/members")}
							symbol="person.2"
						/>
						<SurfaceRow
							label="Switch Household"
							onPress={() => router.push("/household/switch")}
							symbol="arrow.left.arrow.right"
						/>
					</SurfaceCard>
				</SurfaceSection>

				<SurfaceSection title="About">
					<SurfaceCard>
						{state.privacyPolicyUrl ? (
							<SurfaceRow
								divider
								label="Privacy Policy"
								onPress={() => {
									void actions.openPrivacyPolicy();
								}}
								symbol="hand.raised"
							/>
						) : null}
						{state.termsUrl ? (
							<SurfaceRow
								divider
								label="Terms of Service"
								onPress={() => {
									void actions.openTerms();
								}}
								symbol="doc.text"
							/>
						) : null}
						<SurfaceRow
							label="Version"
							symbol="info.circle"
							value={versionLabel(state.appVersion, state.appEnv)}
						/>
					</SurfaceCard>
				</SurfaceSection>
			</ScrollView>
		</ScreenScaffold>
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
	notice: {
		...theme.typography.callout,
		color: theme.colors.text,
		padding: theme.spacing(4),
	},
}));
