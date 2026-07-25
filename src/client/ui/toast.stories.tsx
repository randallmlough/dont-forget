import type { Meta, StoryObj } from "@storybook/react-native";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { ScopedTheme, StyleSheet } from "react-native-unistyles";

import { Button } from "./button";
import { Toaster, toast } from "./toast";

const meta = {
	title: "UI/Toast",
	component: Toaster,
} satisfies Meta<typeof Toaster>;

export default meta;

type Story = StoryObj<typeof meta>;

export const LightTheme: Story = {
	render: () => <ToastGallery themeName="light" />,
};

export const DarkTheme: Story = {
	render: () => <ToastGallery themeName="dark" />,
};

function ToastGallery({ themeName }: { themeName: "light" | "dark" }) {
	return (
		<ScopedTheme name={themeName}>
			<View style={styles.canvas}>
				<StorySection title="Types">
					<Button onPress={() => toast("Milk added to Groceries")} size="sm">
						Default
					</Button>
					<Button
						onPress={() => toast.success("Milk added to Groceries")}
						size="sm"
					>
						Success
					</Button>
					<Button
						onPress={() => toast.error("Could not add Milk")}
						size="sm"
						variant="destructive"
					>
						Error
					</Button>
					<Button
						onPress={() => toast.info("Jordan joined the Household")}
						size="sm"
						variant="secondary"
					>
						Info
					</Button>
					<Button
						onPress={() => toast.warning("Working offline")}
						size="sm"
						variant="secondary"
					>
						Warning
					</Button>
					<Button
						onPress={() =>
							toast("Syncing Groceries…", {
								type: "loading",
								duration: Number.POSITIVE_INFINITY,
							})
						}
						size="sm"
						variant="outline"
					>
						Loading
					</Button>
				</StorySection>

				<StorySection title="Content">
					<Button
						onPress={() =>
							toast.success("Groceries updated", {
								description: "Avery checked off 3 Items a moment ago.",
							})
						}
						size="sm"
					>
						With description
					</Button>
					<Button
						onPress={() =>
							toast("Milk removed from Groceries", {
								action: { label: "Undo", onPress: noop },
							})
						}
						size="sm"
					>
						With action
					</Button>
					<Button
						onPress={() =>
							toast.error("Invitation could not be sent", {
								description:
									"Jordan's invitation to the Wilson Household will retry once you are back online.",
								action: { label: "Retry", onPress: noop },
								duration: Number.POSITIVE_INFINITY,
							})
						}
						size="sm"
						variant="destructive"
					>
						Long, sticky
					</Button>
				</StorySection>

				<StorySection title="Stack">
					<Button onPress={showStack} size="sm" variant="outline">
						Raise 4 (3 stay)
					</Button>
					<Button
						onPress={() => toast.dismiss()}
						size="sm"
						variant="destructive"
					>
						Dismiss all
					</Button>
				</StorySection>

				<Toaster />
			</View>
		</ScopedTheme>
	);
}

function showStack() {
	toast.success("Milk added to Groceries");
	toast.success("Eggs added to Groceries");
	toast.success("Bread added to Groceries");
	toast.success("Coffee added to Groceries");
}

function StorySection({
	children,
	title,
}: {
	children: ReactNode;
	title: string;
}) {
	return (
		<View style={styles.section}>
			<Text style={styles.sectionTitle}>{title}</Text>
			<View style={styles.row}>{children}</View>
		</View>
	);
}

function noop() {}

const styles = StyleSheet.create((theme) => ({
	canvas: {
		flex: 1,
		gap: theme.spacing(6),
		padding: theme.spacing(6),
		backgroundColor: theme.colors.background,
	},
	section: {
		gap: theme.spacing(3),
	},
	sectionTitle: {
		...theme.typography.headline,
		color: theme.colors.foreground,
	},
	row: {
		flexDirection: "row",
		flexWrap: "wrap",
		alignItems: "center",
		gap: theme.spacing(3),
	},
}));
