import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { track } from "@/client/lib/analytics";
import {
	type AuthenticatedAppSession,
	type AuthenticatedAppSessionState,
	useAuthenticatedAppSession,
} from "@/client/session";
import {
	CurrentList,
	type HomeCurrentListDeps,
	homeSessionMemberName,
} from "./current-list";
import { HomeRetryButton, HomeStatus } from "./home-status";

export type HomeScreenViewProps = {
	state: AuthenticatedAppSessionState;
	session: AuthenticatedAppSession | null;
	onRetry?: () => void;
	onOpenSettings?: () => void;
	onOpenHouseholdSettings?: () => void;
	currentListDeps?: HomeCurrentListDeps;
};

export default function HomeScreen() {
	const { state, session, retry } = useAuthenticatedAppSession();
	const router = useRouter();

	return (
		<HomeScreenView
			state={state}
			session={session}
			onRetry={retry}
			onOpenSettings={() => {
				track("settings_opened", { source: "home" });
				router.push("/settings");
			}}
			onOpenHouseholdSettings={() => router.push("/household/settings")}
		/>
	);
}

export function HomeScreenView({
	state,
	session,
	onRetry,
	onOpenSettings,
	onOpenHouseholdSettings,
	currentListDeps,
}: HomeScreenViewProps) {
	const displayMemberName = homeSessionMemberName(session);

	return (
		<SafeAreaView edges={["top"]} style={styles.root}>
			<View style={styles.memberBar}>
				<View style={styles.memberTextGroup}>
					<Text style={styles.memberLabel}>Signed in</Text>
					<Text style={styles.memberName} numberOfLines={1}>
						{displayMemberName}
					</Text>
				</View>
				<View style={styles.memberActions} testID="home-header-actions">
					{onOpenHouseholdSettings ? (
						<Pressable
							accessibilityRole="button"
							onPress={onOpenHouseholdSettings}
							style={({ pressed }) => [
								styles.settingsButton,
								pressed ? styles.buttonPressed : undefined,
							]}
						>
							<Text style={styles.settingsLabel}>Household</Text>
						</Pressable>
					) : null}
					{onOpenSettings ? (
						<Pressable
							accessibilityRole="button"
							onPress={onOpenSettings}
							style={({ pressed }) => [
								styles.settingsButton,
								pressed ? styles.buttonPressed : undefined,
							]}
						>
							<Text style={styles.settingsLabel}>Settings</Text>
						</Pressable>
					) : null}
				</View>
			</View>

			{session ? (
				<CurrentList session={session} deps={currentListDeps} />
			) : state.status === "error" ? (
				<HomeStatus title="Household unavailable" body={state.message}>
					{onRetry ? <HomeRetryButton onPress={onRetry} /> : null}
				</HomeStatus>
			) : (
				<HomeStatus
					title="Preparing your Household"
					body="Loading your Household List."
				>
					<ActivityIndicator />
				</HomeStatus>
			)}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create((theme) => ({
	root: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
	memberBar: {
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
	memberTextGroup: {
		flex: 1,
		minWidth: 0,
	},
	memberActions: {
		flexDirection: "row",
		gap: theme.spacing(2),
		paddingRight: theme.spacing(14),
	},
	memberLabel: {
		...theme.typography.captionStrong,
		color: theme.colors.textMuted,
	},
	memberName: {
		color: theme.colors.text,
		fontSize: theme.fontSizes.subheadline,
		fontWeight: theme.fontWeights.bold,
	},
	settingsButton: {
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
	buttonPressed: {
		opacity: theme.opacities.pressed,
	},
	settingsLabel: {
		...theme.typography.callout,
		color: theme.colors.text,
		fontWeight: theme.fontWeights.bold,
	},
}));
