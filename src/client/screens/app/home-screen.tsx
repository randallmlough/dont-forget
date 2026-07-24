import { useRouter } from "expo-router";
import { ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { useNavigationDrawer } from "@/client/app-shell/navigation-drawer-context";
import {
	CurrentList,
	type HomeCurrentListDeps,
} from "@/client/features/list/current-list";
import {
	HomeRetryButton,
	HomeStatus,
} from "@/client/features/list/home-status";
import {
	type AuthenticatedAppSession,
	type AuthenticatedAppSessionState,
	useAuthenticatedAppSession,
} from "@/client/session";

export type HomeScreenViewProps = {
	state: AuthenticatedAppSessionState;
	session: AuthenticatedAppSession | null;
	onRetry?: () => void;
	onOpenNavigation?: () => void;
	onOpenLists?: () => void;
	currentListDeps?: HomeCurrentListDeps;
};

export default function HomeScreen() {
	const { state, session, retry } = useAuthenticatedAppSession();
	const { open } = useNavigationDrawer();
	const router = useRouter();

	return (
		<HomeScreenView
			state={state}
			session={session}
			onRetry={retry}
			onOpenNavigation={open}
			onOpenLists={() => router.replace("/lists")}
		/>
	);
}

export function HomeScreenView({
	state,
	session,
	onRetry,
	onOpenNavigation,
	onOpenLists,
	currentListDeps,
}: HomeScreenViewProps) {
	return (
		<SafeAreaView edges={["top"]} style={styles.root}>
			{session ? (
				<CurrentList
					session={session}
					deps={currentListDeps}
					onOpenNavigation={onOpenNavigation ?? noop}
					onOpenLists={onOpenLists ?? noop}
				/>
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

function noop() {}

const styles = StyleSheet.create((theme) => ({
	root: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
}));
