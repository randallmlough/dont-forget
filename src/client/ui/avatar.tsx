import { Image, type ImageProps, type ImageStyle } from "expo-image";
import {
	type ComponentRef,
	createContext,
	type Dispatch,
	forwardRef,
	type ReactNode,
	type SetStateAction,
	useContext,
	useEffect,
	useState,
} from "react";
import {
	type StyleProp,
	Text,
	type TextStyle,
	View,
	type ViewProps,
	type ViewStyle,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";

type AvatarStatus = "idle" | "loading" | "loaded" | "error";

export type AvatarSize = "sm" | "md" | "lg" | "xl";

export type AvatarProps = Omit<ViewProps, "style"> & {
	size?: AvatarSize;
	style?: StyleProp<ViewStyle>;
};

export type AvatarImageProps = Omit<ImageProps, "style"> & {
	style?: StyleProp<ImageStyle>;
};

export type AvatarFallbackProps = Omit<ViewProps, "children" | "style"> & {
	children?: ReactNode;
	delayMs?: number;
	name?: string;
	style?: StyleProp<ViewStyle>;
	textStyle?: StyleProp<TextStyle>;
};

type AvatarContextValue = {
	setStatus: Dispatch<SetStateAction<AvatarStatus>>;
	size: AvatarSize;
	status: AvatarStatus;
};

const defaultSize: AvatarSize = "md";
const AvatarContext = createContext<AvatarContextValue | null>(null);

type AvatarRef = ComponentRef<typeof View>;
type AvatarImageRef = ComponentRef<typeof Image>;

export const Avatar = forwardRef<AvatarRef, AvatarProps>(function Avatar(
	{ children, size = defaultSize, style, ...viewProps },
	ref,
) {
	const [status, setStatus] = useState<AvatarStatus>("idle");
	rootStyles.useVariants({ size });

	return (
		<AvatarContext value={{ setStatus, size, status }}>
			<View ref={ref} style={[rootStyles.root, style]} {...viewProps}>
				{children}
			</View>
		</AvatarContext>
	);
});

export const AvatarImage = forwardRef<AvatarImageRef, AvatarImageProps>(
	function AvatarImage(
		{
			contentFit = "cover",
			onError,
			onLoad,
			onLoadStart,
			source,
			style,
			...imageProps
		},
		ref,
	) {
		const context = useContext(AvatarContext);
		const status = context?.status ?? "loaded";
		const setStatus = context?.setStatus;
		imageStyles.useVariants({ visible: status === "loaded" });

		useEffect(() => {
			if (!setStatus) return;
			setStatus(source ? "loading" : "idle");
		}, [setStatus, source]);

		const handleLoadStart: NonNullable<ImageProps["onLoadStart"]> = () => {
			setStatus?.("loading");
			onLoadStart?.();
		};
		const handleLoad: NonNullable<ImageProps["onLoad"]> = (event) => {
			setStatus?.("loaded");
			onLoad?.(event);
		};
		const handleError: NonNullable<ImageProps["onError"]> = (event) => {
			setStatus?.("error");
			onError?.(event);
		};

		return (
			<Image
				contentFit={contentFit}
				onError={handleError}
				onLoad={handleLoad}
				onLoadStart={handleLoadStart}
				ref={ref}
				source={source}
				style={[imageStyles.image, style]}
				{...imageProps}
			/>
		);
	},
);

export const AvatarFallback = forwardRef<AvatarRef, AvatarFallbackProps>(
	function AvatarFallback(
		{ children, delayMs = 0, name, style, textStyle, ...viewProps },
		ref,
	) {
		const context = useContext(AvatarContext);
		const size = context?.size ?? defaultSize;
		const status = context?.status ?? "idle";
		const [visible, setVisible] = useState(delayMs === 0);
		fallbackStyles.useVariants({ size });

		useEffect(() => {
			if (delayMs === 0) {
				setVisible(true);
				return;
			}
			setVisible(false);
			const timer = setTimeout(() => setVisible(true), delayMs);
			return () => clearTimeout(timer);
		}, [delayMs]);

		if (status === "loaded" || !visible) return null;

		const content = children ?? (name ? initials(name) : null);
		const isTextContent =
			typeof content === "string" || typeof content === "number";

		return (
			<View ref={ref} style={[fallbackStyles.fallback, style]} {...viewProps}>
				{isTextContent ? (
					<Text style={[fallbackStyles.label, textStyle]}>{content}</Text>
				) : (
					content
				)}
			</View>
		);
	},
);

function initials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
	return parts.map((part) => part[0]?.toUpperCase()).join("");
}

const rootStyles = StyleSheet.create((theme) => ({
	root: {
		position: "relative",
		alignItems: "center",
		justifyContent: "center",
		overflow: "hidden",
		borderRadius: theme.radii.full,
		backgroundColor: theme.colors.muted,
		variants: {
			size: {
				sm: {
					width: theme.spacing(8),
					height: theme.spacing(8),
				},
				md: {
					width: theme.spacing(10),
					height: theme.spacing(10),
				},
				lg: {
					width: theme.spacing(14),
					height: theme.spacing(14),
				},
				xl: {
					width: theme.spacing(28),
					height: theme.spacing(28),
				},
			},
		},
	},
}));

const imageStyles = StyleSheet.create(() => ({
	image: {
		position: "absolute",
		top: 0,
		right: 0,
		bottom: 0,
		left: 0,
		width: "100%",
		height: "100%",
		variants: {
			visible: {
				true: { opacity: 1 },
				false: { opacity: 0 },
			},
		},
	},
}));

const fallbackStyles = StyleSheet.create((theme) => ({
	fallback: {
		position: "absolute",
		top: 0,
		right: 0,
		bottom: 0,
		left: 0,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: theme.colors.muted,
	},
	label: {
		...theme.typography.callout,
		fontWeight: theme.fontWeights.semibold,
		color: theme.colors.mutedForeground,
		variants: {
			size: {
				sm: {
					...theme.typography.captionStrong,
				},
				md: {
					...theme.typography.callout,
				},
				lg: {
					...theme.typography.body,
				},
				xl: {
					fontFamily: theme.fontFamilies.serif,
					fontSize: theme.fontSizes["3xl"],
				},
			},
		},
	},
}));
