import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

import {
	type AuthenticatedAppSessionState,
	useAuthenticatedAppSession,
} from "@/components/session";
import type { AuthenticatedAppSession } from "@/lib/services/session";
import { HomeCurrentList, homeSessionMemberName } from "./home-current-list";
import { HomeRetryButton, HomeStatus } from "./home-status";

export type HomeScreenViewProps = {
	state: AuthenticatedAppSessionState;
	session: AuthenticatedAppSession | null;
	onRetry?: () => void;
	onSignOut?: () => void;
};

export default function HomeScreen() {
	const { state, session, retry, signOut } = useAuthenticatedAppSession();

	return (
		<HomeScreenView
			state={state}
			session={session}
			onRetry={retry}
			onSignOut={signOut}
		/>
	);
}

export function HomeScreenView({
	state,
	session,
	onRetry,
	onSignOut,
}: HomeScreenViewProps) {
	const displayMemberName = homeSessionMemberName(session);

	return (
		<SafeAreaView edges={["top", "bottom"]} style={styles.root}>
			<View style={styles.memberBar}>
				<View style={styles.memberTextGroup}>
					<Text style={styles.memberLabel}>Signed in</Text>
					<Text style={styles.memberName} numberOfLines={1}>
						{displayMemberName}
					</Text>
				</View>
				{onSignOut ? (
					<Pressable
						accessibilityRole="button"
						onPress={onSignOut}
						style={({ pressed }) => [
							styles.signOutButton,
							pressed ? styles.signOutButtonPressed : undefined,
						]}
					>
						<Text style={styles.signOutLabel}>Sign out</Text>
					</Pressable>
				) : null}
			</View>

			{session ? (
				<HomeCurrentList session={session} />
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
	memberLabel: {
		...theme.typography.captionStrong,
		color: theme.colors.textMuted,
	},
	memberName: {
		color: theme.colors.text,
		fontSize: theme.fontSizes.subheadline,
		fontWeight: theme.fontWeights.bold,
	},
	signOutButton: {
		minHeight: theme.spacing(11),
		paddingHorizontal: theme.spacing(3.5),
		borderRadius: theme.radii.control,
		borderCurve: "continuous",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: theme.colors.destructive,
	},
	signOutButtonPressed: {
		opacity: theme.opacities.pressed,
	},
	signOutLabel: {
		...theme.typography.callout,
		color: theme.colors.inverseText,
		fontWeight: theme.fontWeights.bold,
	},
}));
