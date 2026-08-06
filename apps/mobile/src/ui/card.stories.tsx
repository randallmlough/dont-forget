import type { Meta, StoryObj } from "@storybook/react-native";
import { Text, View } from "react-native";
import { ScopedTheme, StyleSheet } from "react-native-unistyles";

import { Button } from "./button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "./card";

const meta = {
	title: "UI/Card",
	component: Card,
} satisfies Meta<typeof Card>;

export default meta;

type Story = StoryObj<typeof meta>;

export const LightTheme: Story = {
	render: () => <CardGallery themeName="light" />,
};

export const DarkTheme: Story = {
	render: () => <CardGallery themeName="dark" />,
};

function CardGallery({ themeName }: { themeName: "light" | "dark" }) {
	return (
		<ScopedTheme name={themeName}>
			<View style={styles.canvas}>
				<Text style={styles.sectionTitle}>Complete</Text>
				<Card style={styles.card}>
					<CardHeader>
						<CardTitle>Household summary</CardTitle>
						<CardDescription>
							Everyone in Golden Pantry can collaborate on these Lists.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Text style={styles.body}>4 Lists · 18 Items remaining</Text>
					</CardContent>
					<CardFooter style={styles.actions}>
						<Button onPress={noop} size="sm">
							Open Lists
						</Button>
						<Button onPress={noop} size="sm" variant="outline">
							Manage
						</Button>
					</CardFooter>
				</Card>

				<Text style={styles.sectionTitle}>Content only</Text>
				<Card style={styles.card}>
					<CardContent style={styles.contentOnly}>
						<Text style={styles.body}>
							Changes sync automatically with every Member in this Household.
						</Text>
					</CardContent>
				</Card>
			</View>
		</ScopedTheme>
	);
}

function noop() {}

const styles = StyleSheet.create((theme) => ({
	canvas: {
		flex: 1,
		gap: theme.spacing(3),
		padding: theme.spacing(6),
		backgroundColor: theme.colors.background,
	},
	sectionTitle: {
		...theme.typography.headline,
		color: theme.colors.foreground,
	},
	card: {
		alignSelf: "stretch",
	},
	body: {
		...theme.typography.body,
		color: theme.colors.cardForeground,
	},
	actions: {
		gap: theme.spacing(2),
	},
	contentOnly: {
		paddingTop: theme.spacing(6),
	},
}));
