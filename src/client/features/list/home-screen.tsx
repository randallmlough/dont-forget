import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator } from "react-native";
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
import { HomeNavigationDrawer } from "./home-navigation-drawer";
import { HomeRetryButton, HomeStatus } from "./home-status";

export type HomeScreenViewProps = {
	state: AuthenticatedAppSessionState;
	session: AuthenticatedAppSession | null;
	onRetry?: () => void;
	onOpenSettings?: () => void;
	onOpenHouseholdSettings?: () => void;
	onSwitchHousehold?: () => void;
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
			onSwitchHousehold={() => router.push("/household/switch")}
		/>
	);
}

export function HomeScreenView({
	state,
	session,
	onRetry,
	onOpenSettings,
	onOpenHouseholdSettings,
	onSwitchHousehold,
	currentListDeps,
}: HomeScreenViewProps) {
	const displayMemberName = homeSessionMemberName(session);
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [listSwitcherOpen, setListSwitcherOpen] = useState(false);

	return (
		<SafeAreaView edges={["top"]} style={styles.root}>
			{session ? (
				<CurrentList
					session={session}
					deps={currentListDeps}
					listSwitcherOpen={listSwitcherOpen}
					onListSwitcherOpenChange={setListSwitcherOpen}
					onOpenNavigation={() => setDrawerOpen(true)}
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
			{session ? (
				<HomeNavigationDrawer
					isOpen={drawerOpen}
					memberName={displayMemberName}
					householdName={session.activeHousehold.name}
					onClose={() => setDrawerOpen(false)}
					onOpenAllLists={() => setListSwitcherOpen(true)}
					onOpenHousehold={onOpenHouseholdSettings ?? noop}
					onOpenSettings={onOpenSettings ?? noop}
					onSwitchHousehold={onSwitchHousehold ?? noop}
				/>
			) : null}
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
