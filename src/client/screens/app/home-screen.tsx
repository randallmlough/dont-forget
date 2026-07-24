import { Stack, useRouter } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useNavigationDrawer } from "@/client/app-shell/navigation-drawer-context";
import { CurrentList } from "@/client/features/list/current-list";
import {
	HomeRetryButton,
	HomeStatus,
} from "@/client/features/list/home-status";
import { useHomeCurrentList } from "@/client/features/list/use-home-current-list";
import { useListRows } from "@/client/features/list/use-list-rows";
import {
	type AuthenticatedAppSession,
	type AuthenticatedAppSessionState,
	useAuthenticatedAppSession,
	useSyncState,
} from "@/client/session";

const FALLBACK_TITLE = "Home";

export type HomeScreenViewProps = {
	state: AuthenticatedAppSessionState;
	onRetry?: () => void;
};

export default function HomeScreen() {
	const { state, session, retry } = useAuthenticatedAppSession();
	const { open } = useNavigationDrawer();
	const router = useRouter();
	const openLists = () => router.replace("/lists");

	if (session) {
		return (
			<HomeScreenResource
				key={session.activeHousehold.id}
				session={session}
				onOpenNavigation={open}
				onOpenLists={openLists}
			/>
		);
	}

	return (
		<>
			<HomeStackHeader
				title={FALLBACK_TITLE}
				onOpenNavigation={open}
				onOpenLists={openLists}
			/>
			<HomeScreenView state={state} onRetry={retry} />
		</>
	);
}

type HomeScreenResourceProps = {
	session: AuthenticatedAppSession;
	onOpenNavigation: () => void;
	onOpenLists: () => void;
};

function HomeScreenResource({
	session,
	onOpenNavigation,
	onOpenLists,
}: HomeScreenResourceProps) {
	// The Current List resolves here, not inside CurrentList, so the native
	// stack title survives the loading, error, and zeroActive states. A
	// Stack.Title rendered inside the active List surface would unmount in
	// those states and drop the title with it.
	const currentList = useHomeCurrentList(session);
	const syncState = useSyncState();
	const { rows } = useListRows(session);
	const title =
		currentList.state.status === "active"
			? currentList.state.list.listName
			: FALLBACK_TITLE;

	return (
		<>
			<HomeStackHeader
				title={title}
				onOpenNavigation={onOpenNavigation}
				onOpenLists={onOpenLists}
			/>
			<CurrentList
				session={session}
				deps={{ currentList, syncState, listRows: rows }}
				onOpenLists={onOpenLists}
			/>
		</>
	);
}

function HomeStackHeader({
	title,
	onOpenNavigation,
	onOpenLists,
}: {
	title: string;
	onOpenNavigation: () => void;
	onOpenLists: () => void;
}) {
	return (
		<>
			{/* The enclosing Stack sets headerShown: false, so this route opts back in. */}
			<Stack.Screen options={{ headerShown: true }} />
			<Stack.Title large>{title}</Stack.Title>
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.Button
					accessibilityHint="Opens the navigation drawer"
					accessibilityLabel="Open navigation"
					icon="sidebar.left"
					onPress={onOpenNavigation}
				/>
			</Stack.Toolbar>
			<Stack.Toolbar placement="right">
				<Stack.Toolbar.Button
					accessibilityHint="Opens Lists"
					accessibilityLabel="Open Lists"
					icon="list.bullet"
					onPress={onOpenLists}
				/>
			</Stack.Toolbar>
		</>
	);
}

export function HomeScreenView({ state, onRetry }: HomeScreenViewProps) {
	return (
		<View style={styles.root}>
			{state.status === "error" ? (
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
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	root: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
}));
