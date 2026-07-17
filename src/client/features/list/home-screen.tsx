import { useState } from "react";
import { ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { useNavigationDrawer } from "@/client/app-shell/navigation-drawer-context";
import {
	type AuthenticatedAppSession,
	type AuthenticatedAppSessionState,
	useAuthenticatedAppSession,
} from "@/client/session";
import { CurrentList, type HomeCurrentListDeps } from "./current-list";
import { HomeRetryButton, HomeStatus } from "./home-status";

export type HomeScreenViewProps = {
	state: AuthenticatedAppSessionState;
	session: AuthenticatedAppSession | null;
	onRetry?: () => void;
	onOpenNavigation?: () => void;
	currentListDeps?: HomeCurrentListDeps;
};

export default function HomeScreen() {
	const { state, session, retry } = useAuthenticatedAppSession();
	const { open } = useNavigationDrawer();

	return (
		<HomeScreenView
			state={state}
			session={session}
			onRetry={retry}
			onOpenNavigation={open}
		/>
	);
}

export function HomeScreenView({
	state,
	session,
	onRetry,
	onOpenNavigation,
	currentListDeps,
}: HomeScreenViewProps) {
	const [listSwitcherOpen, setListSwitcherOpen] = useState(false);

	return (
		<SafeAreaView edges={["top"]} style={styles.root}>
			{session ? (
				<CurrentList
					session={session}
					deps={currentListDeps}
					listSwitcherOpen={listSwitcherOpen}
					onListSwitcherOpenChange={setListSwitcherOpen}
					onOpenNavigation={onOpenNavigation ?? noop}
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
