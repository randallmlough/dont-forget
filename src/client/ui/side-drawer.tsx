import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import {
	Animated,
	Modal,
	Pressable,
	useWindowDimensions,
	View,
} from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

/**
 * App-owned side-drawer primitive. It owns native modal, safe-area provider,
 * scrim, panel, and entrance-animation mechanics; callers own safe-area edges,
 * content, and any action that must wait for native dismissal.
 */
export type SideDrawerProps = {
	children: ReactElement;
	isOpen: boolean;
	onClose: () => void;
	/** Fires after the native modal finishes dismissing — the safe moment to present the next screen. */
	onDismissed?: () => void;
	testID?: string;
};

export function SideDrawer({
	children,
	isOpen,
	onClose,
	onDismissed,
	testID,
}: SideDrawerProps) {
	const { width } = useWindowDimensions();
	const drawerWidth = Math.min(width * 0.84, 360);
	const [translateX] = useState(() => new Animated.Value(-drawerWidth));

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

	return (
		<Modal
			animationType="fade"
			onDismiss={onDismissed}
			onRequestClose={onClose}
			presentationStyle="overFullScreen"
			statusBarTranslucent
			testID={testID}
			transparent
			visible={isOpen}
		>
			<SafeAreaProvider>
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
						{children}
					</Animated.View>
				</View>
			</SafeAreaProvider>
		</Modal>
	);
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
}));
