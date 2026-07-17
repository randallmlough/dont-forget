import { type SFSymbol, SymbolView } from "expo-symbols";
import { useEffect, useRef, useState } from "react";
import {
	Animated,
	Modal,
	Pressable,
	Text,
	useWindowDimensions,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export type HomeNavigationDrawerProps = {
	isOpen: boolean;
	memberName: string;
	householdName: string;
	onClose: () => void;
	onOpenAllLists: () => void;
	onOpenHousehold: () => void;
	onOpenSettings: () => void;
	onSwitchHousehold: () => void;
};

type DrawerRowProps = {
	icon: SFSymbol;
	label: string;
	selected?: boolean;
	onPress: () => void;
};

export function HomeNavigationDrawer({
	isOpen,
	memberName,
	householdName,
	onClose,
	onOpenAllLists,
	onOpenHousehold,
	onOpenSettings,
	onSwitchHousehold,
}: HomeNavigationDrawerProps) {
	const { width } = useWindowDimensions();
	const drawerWidth = Math.min(width * 0.84, 360);
	const [translateX] = useState(() => new Animated.Value(-drawerWidth));
	const pendingAction = useRef<(() => void) | null>(null);

	useEffect(() => {
		if (!isOpen) return;
		translateX.setValue(-drawerWidth);
		Animated.spring(translateX, {
			toValue: 0,
			useNativeDriver: true,
			damping: 23,
			stiffness: 230,
			mass: 0.8,
		}).start();
	}, [drawerWidth, isOpen, translateX]);

	function navigate(action: () => void) {
		pendingAction.current = action;
		onClose();
	}

	return (
		<Modal
			animationType="fade"
			onDismiss={() => {
				const action = pendingAction.current;
				pendingAction.current = null;
				action?.();
			}}
			onRequestClose={onClose}
			presentationStyle="overFullScreen"
			statusBarTranslucent
			transparent
			visible={isOpen}
		>
			<View accessibilityViewIsModal style={styles.modalRoot}>
				<Pressable
					accessibilityLabel="Close navigation"
					accessibilityRole="button"
					onPress={onClose}
					style={styles.scrim}
				/>
				<Animated.View
					style={[
						styles.drawer,
						{ width: drawerWidth, transform: [{ translateX }] },
					]}
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
								label="Current List"
								onPress={onClose}
								selected
							/>
							<DrawerRow
								icon="list.bullet"
								label="All Lists"
								onPress={() => navigate(onOpenAllLists)}
							/>
						</View>

						<View style={styles.separator} />

						<View style={styles.destinationGroup}>
							{/* Members live on the Household screen; Appearance and Help
							    live on the Settings screen. Dedicated rows keep the
							    destinations discoverable until those screens exist. */}
							<DrawerRow
								icon="house"
								label="Household"
								onPress={() => navigate(onOpenHousehold)}
							/>
							<DrawerRow
								icon="person.2"
								label="Members & Invitations"
								onPress={() => navigate(onOpenHousehold)}
							/>
							<DrawerRow
								icon="gearshape"
								label="Settings"
								onPress={() => navigate(onOpenSettings)}
							/>
							<DrawerRow
								icon="circle.lefthalf.filled"
								label="Appearance"
								onPress={() => navigate(onOpenSettings)}
							/>
							<DrawerRow
								icon="questionmark.circle"
								label="Help"
								onPress={() => navigate(onOpenSettings)}
							/>
						</View>

						<View style={styles.drawerFooter}>
							<View style={styles.syncRow}>
								<View style={styles.syncDot} />
								<Text style={styles.syncLabel}>Synced just now</Text>
							</View>
							<DrawerRow
								icon="arrow.left.arrow.right"
								label="Switch Household"
								onPress={() => navigate(onSwitchHousehold)}
							/>
						</View>
					</SafeAreaView>
				</Animated.View>
			</View>
		</Modal>
	);
}

function DrawerRow({ icon, label, selected = false, onPress }: DrawerRowProps) {
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
	modalRoot: {
		flex: 1,
	},
	scrim: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: theme.colors.scrim,
	},
	drawer: {
		height: "100%",
		backgroundColor: theme.colors.background,
		borderTopRightRadius: theme.spacing(7),
		borderBottomRightRadius: theme.spacing(7),
		borderCurve: "continuous",
		overflow: "hidden",
		boxShadow: `8px 0 36px ${theme.colors.scrim}`,
	},
	safeArea: {
		flex: 1,
	},
	brandBlock: {
		gap: theme.spacing(5),
		paddingHorizontal: theme.spacing(5),
		paddingTop: theme.spacing(4),
		paddingBottom: theme.spacing(5),
	},
	brand: {
		...theme.typography.overline,
		color: theme.colors.textMuted,
	},
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
	memberText: {
		flex: 1,
		minWidth: 0,
		gap: theme.spacing(0.5),
	},
	memberName: {
		...theme.typography.body,
		fontWeight: theme.fontWeights.semibold,
		color: theme.colors.text,
	},
	householdName: {
		...theme.typography.caption,
		color: theme.colors.textMuted,
	},
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
	destinationSelected: {
		backgroundColor: theme.colors.surface,
	},
	destinationLabel: {
		...theme.typography.body,
		color: theme.colors.text,
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
	syncRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(2),
		paddingHorizontal: theme.spacing(3),
	},
	syncDot: {
		width: theme.spacing(2),
		height: theme.spacing(2),
		borderRadius: theme.radii.pill,
		backgroundColor: theme.colors.primary,
	},
	syncLabel: {
		...theme.typography.caption,
		color: theme.colors.textSubtle,
	},
	pressed: {
		opacity: theme.opacities.pressed,
	},
}));
