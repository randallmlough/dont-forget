import { usePathname, useRouter } from "expo-router";
import { type SFSymbol, SymbolView } from "expo-symbols";
import { useRef } from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { track } from "@mobile/lib/analytics";
import {
	sessionMemberDisplayName,
	useAuthenticatedAppSession,
} from "@mobile/session";
import { Button } from "@mobile/ui/button";
import { SideDrawer } from "@mobile/ui/side-drawer";

type DrawerDestination =
	| "/"
	| "/lists"
	| "/household/settings"
	| "/household/members"
	| "/settings"
	| "/settings/appearance"
	| "/household/switch"
	| "/profile";

type DrawerRowProps = {
	icon: SFSymbol;
	label: string;
	selected: boolean;
	onPress: () => void;
};

export type NavigationDrawerProps = {
	isOpen: boolean;
	onClose: () => void;
	onDismissed?: () => void;
};

export function NavigationDrawer({
	isOpen,
	onClose,
	onDismissed,
}: NavigationDrawerProps) {
	const { session } = useAuthenticatedAppSession();
	const router = useRouter();
	const pathname = usePathname();
	const pendingAction = useRef<(() => void) | null>(null);

	if (!session) return null;

	function navigate(
		destination: DrawerDestination,
		beforeNavigate?: () => void,
	) {
		if (pathname === destination) {
			onClose();
			return;
		}
		pendingAction.current = () => {
			beforeNavigate?.();
			router.replace(destination);
		};
		onClose();
	}

	return (
		<NavigationDrawerView
			isOpen={isOpen}
			memberName={sessionMemberDisplayName(session)}
			householdName={session.activeHousehold.name}
			pathname={pathname}
			onClose={onClose}
			onDismissed={() => {
				const action = pendingAction.current;
				pendingAction.current = null;
				action?.();
				onDismissed?.();
			}}
			onNavigate={navigate}
		/>
	);
}

export type NavigationDrawerViewProps = {
	isOpen: boolean;
	memberName: string;
	householdName: string;
	pathname: string;
	onClose: () => void;
	onDismissed: () => void;
	onNavigate: (
		destination: DrawerDestination,
		beforeNavigate?: () => void,
	) => void;
};

export function NavigationDrawerView({
	isOpen,
	memberName,
	householdName,
	pathname,
	onClose,
	onDismissed,
	onNavigate,
}: NavigationDrawerViewProps) {
	const { theme } = useUnistyles();

	return (
		<SideDrawer
			isOpen={isOpen}
			onClose={onClose}
			onDismissed={onDismissed}
			testID="navigation-drawer-modal"
		>
			<SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
				<View style={styles.brandBlock}>
					<Text style={styles.brand}>DON&apos;T FORGET</Text>
				</View>

				<View style={styles.destinationGroup}>
					<Text numberOfLines={1} style={styles.householdName}>
						{householdName}
					</Text>
					<DrawerRow
						icon="checklist"
						label="Home"
						selected={pathname === "/"}
						onPress={() => onNavigate("/")}
					/>
					<DrawerRow
						icon="list.bullet"
						label="Lists"
						selected={pathname === "/lists"}
						onPress={() => onNavigate("/lists")}
					/>

					<DrawerRow
						icon="house"
						label="Household"
						selected={pathname === "/household/settings"}
						onPress={() => onNavigate("/household/settings")}
					/>
					<DrawerRow
						icon="person.2"
						label="Members & Invitations"
						selected={pathname === "/household/members"}
						onPress={() => onNavigate("/household/members")}
					/>
				</View>

				<View style={styles.separator} />

				<View style={styles.destinationGroup}>
					<DrawerRow
						icon="arrow.left.arrow.right"
						label="Switch Household"
						selected={pathname === "/household/switch"}
						onPress={() => onNavigate("/household/switch")}
					/>
					<DrawerRow
						icon="gearshape"
						label="Settings"
						selected={pathname === "/settings"}
						onPress={() =>
							onNavigate("/settings", () =>
								track("settings_opened", { source: "navigation_drawer" }),
							)
						}
					/>
					<DrawerRow
						icon="circle.lefthalf.filled"
						label="Appearance"
						selected={pathname === "/settings/appearance"}
						onPress={() => onNavigate("/settings/appearance")}
					/>
				</View>
				<View style={styles.drawerFooter}>
					<Button
						accessibilityLabel="Profile"
						accessibilityState={{ selected: pathname === "/profile" }}
						onPress={() => onNavigate("/profile")}
						style={[
							styles.memberRow,
							pathname === "/profile" ? styles.destinationSelected : undefined,
						]}
						variant="link"
					>
						<View style={styles.avatar}>
							<Text style={styles.avatarLabel}>{initials(memberName)}</Text>
						</View>
						<View style={styles.memberText}>
							<Text numberOfLines={1} style={styles.memberName}>
								{memberName}
							</Text>
						</View>
						<SymbolView
							accessibilityElementsHidden
							accessible={false}
							name="chevron.right"
							size={14}
							tintColor={theme.colors.mutedForeground}
							weight="semibold"
						/>
					</Button>
				</View>
			</SafeAreaView>
		</SideDrawer>
	);
}

function DrawerRow({ icon, label, selected, onPress }: DrawerRowProps) {
	const { theme } = useUnistyles();

	return (
		<Button
			accessibilityState={{ selected }}
			onPress={onPress}
			style={[
				styles.destination,
				selected ? styles.destinationSelected : undefined,
			]}
			variant="link"
		>
			<SymbolView
				accessibilityElementsHidden
				accessible={false}
				name={icon}
				size={20}
				tintColor={
					selected ? theme.colors.primary : theme.colors.mutedForeground
				}
				weight={selected ? "semibold" : "regular"}
			/>
			<Text
				style={[
					styles.destinationLabel,
					selected ? styles.destinationLabelSelected : undefined,
				]}
			>
				{label}
			</Text>
		</Button>
	);
}

function initials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
	return parts.map((part) => part[0]?.toUpperCase()).join("") || "M";
}

const styles = StyleSheet.create((theme) => ({
	safeArea: { flex: 1 },
	brandBlock: {
		gap: theme.spacing(5),
		paddingHorizontal: theme.spacing(5),
		paddingTop: theme.spacing(4),
		paddingBottom: theme.spacing(5),
	},
	brand: { ...theme.typography.title, color: theme.colors.mutedForeground },
	memberRow: {
		minHeight: theme.spacing(14),
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(3),
		paddingHorizontal: theme.spacing(2),
		borderRadius: theme.radii.xl,
	},
	avatar: {
		width: theme.spacing(12),
		height: theme.spacing(12),
		alignItems: "center",
		justifyContent: "center",
		borderRadius: theme.radii.full,
		borderWidth: theme.borders.hairline,
		borderColor: theme.colors.border,
		backgroundColor: theme.colors.card,
	},
	avatarLabel: {
		...theme.typography.callout,
		fontWeight: theme.fontWeights.semibold,
		color: theme.colors.foreground,
	},
	memberText: { flex: 1, minWidth: 0, gap: theme.spacing(0.5) },
	memberName: {
		...theme.typography.body,
		fontWeight: theme.fontWeights.semibold,
		color: theme.colors.foreground,
	},
	householdName: {
		...theme.typography.body,
		color: theme.colors.mutedForeground,
		paddingHorizontal: theme.spacing(2),
	},
	destinationGroup: {
		gap: theme.spacing(1),
		paddingHorizontal: theme.spacing(3),
	},
	destination: {
		minHeight: theme.spacing(12),
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "flex-start",
		gap: theme.spacing(3),
		paddingHorizontal: theme.spacing(3),
		borderRadius: theme.radii.xl,
		borderCurve: "continuous",
	},
	destinationSelected: { backgroundColor: theme.colors.card },
	destinationLabel: {
		...theme.typography.body,
		color: theme.colors.foreground,
	},
	destinationLabelSelected: {
		fontWeight: theme.fontWeights.semibold,
		color: theme.colors.primary,
	},
	separator: {
		height: theme.borders.hairline,
		marginHorizontal: theme.spacing(5),
		marginVertical: theme.spacing(3),
		backgroundColor: theme.colors.border,
	},
	drawerFooter: {
		marginTop: "auto",
		gap: theme.spacing(2),
		paddingHorizontal: theme.spacing(3),
		paddingBottom: theme.spacing(2),
	},
}));
