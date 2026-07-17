import { type SFSymbol, SymbolView } from "expo-symbols";
import { usePathname, useRouter } from "expo-router";
import { useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { track } from "@/client/lib/analytics";
import {
	sessionMemberDisplayName,
	useAuthenticatedAppSession,
} from "@/client/session";
import { SideDrawer } from "@/client/ui/side-drawer";

type DrawerDestination =
	| "/"
	| "/lists"
	| "/household/settings"
	| "/settings"
	| "/household/switch";

type DrawerRowProps = {
	icon: SFSymbol;
	label: string;
	selected: boolean;
	onPress: () => void;
};

export type NavigationDrawerProps = {
	isOpen: boolean;
	onClose: () => void;
};

export function NavigationDrawer({ isOpen, onClose }: NavigationDrawerProps) {
	const { session } = useAuthenticatedAppSession();
	const router = useRouter();
	const pathname = usePathname();
	const pendingAction = useRef<(() => void) | null>(null);

	if (!session) return null;

	function navigate(destination: DrawerDestination, beforeNavigate?: () => void) {
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
					<View style={styles.memberRow}>
						<View style={styles.avatar}>
							<Text style={styles.avatarLabel}>{initials(memberName)}</Text>
						</View>
						<View style={styles.memberText}>
							<Text numberOfLines={1} style={styles.memberName}>
								{memberName}
							</Text>
							<Text numberOfLines={1} style={styles.householdName}>
								{householdName}
							</Text>
						</View>
					</View>
				</View>

				<View style={styles.destinationGroup}>
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
				</View>

				<View style={styles.separator} />

				<View style={styles.destinationGroup}>
					<DrawerRow
						icon="house"
						label="Household"
						selected={pathname === "/household/settings"}
						onPress={() => onNavigate("/household/settings")}
					/>
					<DrawerRow
						icon="person.2"
						label="Members & Invitations"
						selected={pathname === "/household/settings"}
						onPress={() => onNavigate("/household/settings")}
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
						selected={pathname === "/settings"}
						onPress={() => onNavigate("/settings")}
					/>
				</View>

				<View style={styles.drawerFooter}>
					<DrawerRow
						icon="arrow.left.arrow.right"
						label="Switch Household"
						selected={pathname === "/household/switch"}
						onPress={() => onNavigate("/household/switch")}
					/>
				</View>
			</SafeAreaView>
		</SideDrawer>
	);
}

function DrawerRow({ icon, label, selected, onPress }: DrawerRowProps) {
	const { theme } = useUnistyles();

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityState={{ selected }}
			onPress={onPress}
			style={({ pressed }) => [
				styles.destination,
				selected ? styles.destinationSelected : undefined,
				pressed ? styles.pressed : undefined,
			]}
		>
			<SymbolView
				accessibilityElementsHidden
				accessible={false}
				name={icon}
				size={20}
				tintColor={selected ? theme.colors.primary : theme.colors.textMuted}
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
		</Pressable>
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
	brand: { ...theme.typography.overline, color: theme.colors.textMuted },
	memberRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(3),
	},
	avatar: {
		width: theme.spacing(12),
		height: theme.spacing(12),
		alignItems: "center",
		justifyContent: "center",
		borderRadius: theme.radii.pill,
		borderWidth: theme.borders.hairline,
		borderColor: theme.colors.border,
		backgroundColor: theme.colors.surface,
	},
	avatarLabel: {
		...theme.typography.callout,
		fontWeight: theme.fontWeights.semibold,
		color: theme.colors.text,
	},
	memberText: { flex: 1, minWidth: 0, gap: theme.spacing(0.5) },
	memberName: {
		...theme.typography.body,
		fontWeight: theme.fontWeights.semibold,
		color: theme.colors.text,
	},
	householdName: { ...theme.typography.caption, color: theme.colors.textMuted },
	destinationGroup: {
		gap: theme.spacing(1),
		paddingHorizontal: theme.spacing(3),
	},
	destination: {
		minHeight: theme.spacing(12),
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(3),
		paddingHorizontal: theme.spacing(3),
		borderRadius: theme.radii.control,
		borderCurve: "continuous",
	},
	destinationSelected: { backgroundColor: theme.colors.surface },
	destinationLabel: { ...theme.typography.body, color: theme.colors.text },
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
	pressed: { opacity: theme.opacities.pressed },
}));
