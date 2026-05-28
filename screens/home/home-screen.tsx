import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

import {
	type ActiveHouseholdContentState,
	useActiveHousehold,
} from "@/components/active-household";
import { ActiveList } from "@/components/active-list";
import { useList } from "@/hooks/use-list";
import { DEFAULT_LIST_ID } from "@/lib/bootstrap";

export type HomeScreenViewProps = {
	currentMemberName: string;
	content: ActiveHouseholdContentState;
	onRetry?: () => void;
	onSignOut?: () => void;
};

export default function HomeScreen() {
	const { content, currentMemberName, retry, signOut } = useActiveHousehold();

	return (
		<HomeScreenView
			currentMemberName={currentMemberName}
			content={content}
			onRetry={retry}
			onSignOut={signOut}
		/>
	);
}

export function HomeScreenView({
	currentMemberName,
	content,
	onRetry,
	onSignOut,
}: HomeScreenViewProps) {
	const displayMemberName =
		content.status === "ready" ? content.activeMemberName : currentMemberName;

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

			{content.status === "ready" ? (
				<DefaultListContent
					key={content.resourceKey}
					currentMemberName={displayMemberName}
					content={content}
				/>
			) : content.status === "loading" ? (
				<HomeStatus
					title="Preparing your Household"
					body="Loading your Household List."
				>
					<ActivityIndicator />
				</HomeStatus>
			) : (
				<HomeStatus title="Household unavailable" body={content.message}>
					{onRetry ? (
						<Pressable
							accessibilityRole="button"
							onPress={onRetry}
							style={({ pressed }) => [
								styles.retryButton,
								pressed ? styles.retryButtonPressed : undefined,
							]}
						>
							<Text style={styles.retryButtonLabel}>Try again</Text>
						</Pressable>
					) : null}
				</HomeStatus>
			)}
		</SafeAreaView>
	);
}

function DefaultListContent({
	content,
	currentMemberName,
}: {
	content: Extract<ActiveHouseholdContentState, { status: "ready" }>;
	currentMemberName: string;
}) {
	const list = useList(content, DEFAULT_LIST_ID);
	const loadState = list.state;

	if (loadState.status === "loading") {
		return (
			<HomeStatus
				title="Preparing your Household"
				body="Loading your Household List."
			>
				<ActivityIndicator />
			</HomeStatus>
		);
	}

	if (loadState.status === "error") {
		return (
			<HomeStatus title="List unavailable" body={loadState.message}>
				<Pressable
					accessibilityRole="button"
					onPress={list.retry}
					style={({ pressed }) => [
						styles.retryButton,
						pressed ? styles.retryButtonPressed : undefined,
					]}
				>
					<Text style={styles.retryButtonLabel}>Try again</Text>
				</Pressable>
			</HomeStatus>
		);
	}

	return (
		<ActiveList.Provider
			initialState={loadState.initialList}
			currentMemberName={currentMemberName}
			onLoadList={loadState.actions.loadList}
			onAddItem={loadState.actions.addItem}
			onSetItemChecked={loadState.actions.setItemChecked}
			syncCoordinator={content.syncCoordinator}
			manageSyncCoordinatorLifecycle={false}
		>
			<ActiveList.Screen>
				<ActiveList.Header />
				<ActiveList.Items />
				<ActiveList.AddItemForm />
			</ActiveList.Screen>
		</ActiveList.Provider>
	);
}

function HomeStatus({
	title,
	body,
	children,
}: {
	title: string;
	body: string;
	children: ReactNode;
}) {
	return (
		<View style={styles.statusRoot}>
			<View style={styles.statusCard}>
				<Text style={styles.statusTitle}>{title}</Text>
				<Text style={styles.statusBody}>{body}</Text>
				{children}
			</View>
		</View>
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
	statusRoot: {
		flex: 1,
		justifyContent: "center",
		padding: theme.spacing(5),
		backgroundColor: theme.colors.background,
	},
	statusCard: {
		alignItems: "center",
		gap: theme.spacing(3),
		padding: theme.spacing(7),
		borderRadius: theme.radii.card,
		borderCurve: "continuous",
		backgroundColor: theme.colors.surface,
		borderWidth: theme.borders.hairline,
		borderColor: theme.colors.border,
	},
	statusTitle: {
		...theme.typography.headline,
		color: theme.colors.text,
		textAlign: "center",
	},
	statusBody: {
		...theme.typography.callout,
		color: theme.colors.textMuted,
		textAlign: "center",
	},
	retryButton: {
		minHeight: theme.spacing(11),
		paddingHorizontal: theme.spacing(4),
		borderRadius: theme.radii.control,
		borderCurve: "continuous",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: theme.colors.primary,
	},
	retryButtonPressed: {
		opacity: theme.opacities.pressed,
	},
	retryButtonLabel: {
		...theme.typography.controlLabel,
		color: theme.colors.inverseText,
	},
}));
