import { type ComponentRef, forwardRef, useEffect } from "react";
import type { StyleProp, View, ViewProps, ViewStyle } from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withTiming,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";

export type SkeltonProps = Omit<ViewProps, "style"> & {
	style?: StyleProp<ViewStyle>;
};

type SkeltonRef = ComponentRef<typeof View>;

const PULSE_OPACITY = 0.5;
const PULSE_HALF_CYCLE_MS = 1000;

export const Skelton = forwardRef<SkeltonRef, SkeltonProps>(function Skelton(
	{ style, ...viewProps },
	ref,
) {
	const opacity = useSharedValue(1);

	useEffect(() => {
		opacity.set(
			withRepeat(
				withTiming(PULSE_OPACITY, { duration: PULSE_HALF_CYCLE_MS }),
				-1,
				true,
			),
		);
	}, [opacity]);

	const animatedStyle = useAnimatedStyle(() => ({
		opacity: opacity.get(),
	}));

	return (
		<Animated.View
			{...viewProps}
			accessibilityElementsHidden
			accessible={false}
			ref={ref}
			style={[styles.skelton, style, animatedStyle]}
		/>
	);
});

const styles = StyleSheet.create((theme) => ({
	skelton: {
		borderRadius: theme.radii.md,
		backgroundColor: theme.colors.muted,
	},
}));
