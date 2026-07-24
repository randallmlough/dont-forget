import { Stack, useRouter } from "expo-router";
import { ActivityIndicator, View } from "react-native";
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
import { useHomeCurrentList } from "@/client/features/list/use-home-current-list";
import { useListRows } from "@/client/features/list/use-list-rows";
import {
	type AuthenticatedAppSession,
	type AuthenticatedAppSessionState,
	useAuthenticatedAppSession,
	useSyncState,
} from "@/client/session";

export type HomeScreenViewProps = {
	state: AuthenticatedAppSessionState;
	session: AuthenticatedAppSession | null;
	onRetry?: () => void;
	onOpenLists?: () => void;
	currentListDeps?: HomeCurrentListDeps;
};

export default function HomeScreen() {
	const { state, session, retry } = useAuthenticatedAppSession();
	const { open } = useNavigationDrawer();
	const router = useRouter();

	if (session) {
		return (
			<HomeScreenResource
				key={session.activeHousehold.id}
				state={state}
				session={session}
				onOpenNavigation={open}
				onOpenLists={() => router.replace("/lists")}
			/>
		);
	}

	return (
		<>
			<HomeStackHeader title="Home" onOpenNavigation={open} />
			<HomeScreenView state={state} session={null} onRetry={retry} />
		</>
	);
}

type HomeScreenResourceProps = {
	state: AuthenticatedAppSessionState;
	session: AuthenticatedAppSession;
	onOpenNavigation: () => void;
	onOpenLists: () => void;
};

function HomeScreenResource({
	state,
	session,
	onOpenNavigation,
	onOpenLists,
}: HomeScreenResourceProps) {
	const currentList = useHomeCurrentList(session);
	const syncState = useSyncState();
	const { rows } = useListRows(session);
	const title =
		currentList.state.status === "active"
			? currentList.state.list.listName
			: "Home";

	return (
		<>
			<HomeStackHeader title={title} onOpenNavigation={onOpenNavigation} />
			<HomeScreenView
				state={state}
				session={session}
				onOpenLists={onOpenLists}
				currentListDeps={{
					currentList,
					syncState,
					listRows: rows,
					allowListsEntry: true,
				}}
			/>
		</>
	);
}

function HomeStackHeader({
	title,
	onOpenNavigation,
}: {
	title: string;
	onOpenNavigation: () => void;
}) {
	return (
		<>
			<Stack.Title large>{title}</Stack.Title>
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.Button
					accessibilityHint="Opens the navigation drawer"
					accessibilityLabel="Open navigation"
					icon="sidebar.left"
					onPress={onOpenNavigation}
				/>
			</Stack.Toolbar>
		</>
	);
}

export function HomeScreenView({
	state,
	session,
	onRetry,
	onOpenLists,
	currentListDeps,
}: HomeScreenViewProps) {
	if (session && currentListDeps) {
		return (
			<CurrentList
				session={session}
				deps={currentListDeps}
				onOpenLists={onOpenLists ?? noop}
			/>
		);
	}

	return (
		<View collapsable={false} style={styles.root}>
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

function noop() {}

const styles = StyleSheet.create((theme) => ({
	root: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
}));
