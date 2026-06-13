import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import {
	type OnboardingActions,
	type OnboardingState,
	useOnboarding,
} from "./use-onboarding";

export default function OnboardingScreen() {
	const { state, actions } = useOnboarding();
	return <OnboardingScreenView state={state} actions={actions} />;
}

export function OnboardingScreenView({
	state,
	actions,
}: {
	state: OnboardingState;
	actions: OnboardingActions;
}) {
	const StepContent = state.currentStep.render;

	return (
		<SafeAreaView edges={["top", "bottom"]} style={styles.root}>
			<View style={styles.header}>
				<View style={styles.headerTextGroup}>
					<Text style={styles.headerLabel}>Onboarding</Text>
					<Text style={styles.headerTitle}>Set up your Household</Text>
				</View>
				<Pressable
					accessibilityRole="button"
					onPress={actions.skip}
					style={({ pressed }) => [
						styles.secondaryButton,
						pressed ? styles.buttonPressed : undefined,
					]}
				>
					<Text style={styles.secondaryButtonLabel}>Skip</Text>
				</Pressable>
			</View>

			<View style={styles.content}>
				<Text style={styles.stepCount}>
					Step {state.currentStepIndex + 1} of {state.steps.length}
				</Text>
				<Text style={styles.title}>{state.currentStep.title}</Text>
				<Text style={styles.body}>{state.currentStep.body}</Text>
				{StepContent ? <StepContent /> : null}
			</View>

			<View style={styles.footer}>
				<View
					accessibilityLabel={`Onboarding step ${state.currentStepIndex + 1} of ${state.steps.length}`}
					style={styles.dots}
				>
					{state.steps.map((step, index) => (
						<View
							key={step.key}
							style={[
								styles.dot,
								index === state.currentStepIndex ? styles.dotActive : undefined,
							]}
						/>
					))}
				</View>
				<View style={styles.actions}>
					<Pressable
						accessibilityRole="button"
						accessibilityState={{ disabled: state.isFirstStep }}
						disabled={state.isFirstStep}
						onPress={actions.back}
						style={({ pressed }) => [
							styles.secondaryButton,
							state.isFirstStep ? styles.buttonDisabled : undefined,
							pressed ? styles.buttonPressed : undefined,
						]}
					>
						<Text style={styles.secondaryButtonLabel}>Back</Text>
					</Pressable>
					<Pressable
						accessibilityRole="button"
						onPress={state.isLastStep ? actions.finish : actions.next}
						style={({ pressed }) => [
							styles.primaryButton,
							pressed ? styles.buttonPressed : undefined,
						]}
					>
						<Text style={styles.primaryButtonLabel}>
							{state.isLastStep ? "Done" : "Next"}
						</Text>
					</Pressable>
				</View>
			</View>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create((theme) => ({
	root: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
	header: {
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
	headerTextGroup: {
		flex: 1,
		minWidth: 0,
	},
	headerLabel: {
		...theme.typography.captionStrong,
		color: theme.colors.textMuted,
	},
	headerTitle: {
		...theme.typography.headline,
		color: theme.colors.text,
	},
	content: {
		flex: 1,
		justifyContent: "center",
		paddingHorizontal: theme.spacing(6),
		gap: theme.spacing(3),
	},
	stepCount: {
		...theme.typography.captionStrong,
		color: theme.colors.textMuted,
		textTransform: "uppercase",
	},
	title: {
		...theme.typography.largeTitle,
		color: theme.colors.text,
	},
	body: {
		...theme.typography.body,
		color: theme.colors.textMuted,
		lineHeight: theme.spacing(6),
	},
	footer: {
		gap: theme.spacing(4),
		paddingHorizontal: theme.spacing(5),
		paddingTop: theme.spacing(3),
		paddingBottom: theme.spacing(4),
		backgroundColor: theme.colors.surface,
		borderTopWidth: theme.borders.hairline,
		borderTopColor: theme.colors.border,
	},
	dots: {
		flexDirection: "row",
		justifyContent: "center",
		gap: theme.spacing(2),
	},
	dot: {
		width: theme.spacing(2),
		height: theme.spacing(2),
		borderRadius: theme.spacing(1),
		backgroundColor: theme.colors.border,
	},
	dotActive: {
		backgroundColor: theme.colors.primary,
	},
	actions: {
		flexDirection: "row",
		justifyContent: "space-between",
		gap: theme.spacing(3),
	},
	primaryButton: {
		flex: 1,
		minHeight: theme.spacing(12),
		alignItems: "center",
		justifyContent: "center",
		borderRadius: theme.radii.control,
		borderCurve: "continuous",
		backgroundColor: theme.colors.primary,
	},
	primaryButtonLabel: {
		...theme.typography.controlLabel,
		color: theme.colors.inverseText,
	},
	secondaryButton: {
		minHeight: theme.spacing(11),
		paddingHorizontal: theme.spacing(4),
		alignItems: "center",
		justifyContent: "center",
		borderRadius: theme.radii.control,
		borderCurve: "continuous",
		borderWidth: theme.borders.thin,
		borderColor: theme.colors.border,
		backgroundColor: theme.colors.surface,
	},
	secondaryButtonLabel: {
		...theme.typography.callout,
		color: theme.colors.text,
		fontWeight: theme.fontWeights.bold,
	},
	buttonPressed: {
		opacity: theme.opacities.pressed,
	},
	buttonDisabled: {
		opacity: theme.opacities.disabled,
	},
}));
