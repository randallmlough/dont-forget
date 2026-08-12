import type { Meta, StoryObj } from "@storybook/react-native";
import type { ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";
import { ScopedTheme, StyleSheet } from "react-native-unistyles";

import { Avatar, AvatarFallback, AvatarImage, type AvatarSize } from "./avatar";
import {
	Item,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemMedia,
	ItemSeparator,
	ItemTitle,
} from "./item";

const sizes = ["sm", "md", "lg", "xl"] satisfies AvatarSize[];
const exampleImage = "https://github.com/shadcn.png";

const meta = {
	title: "UI/Avatar",
	component: Avatar,
	args: { size: "md" },
	argTypes: {
		size: { control: "select", options: sizes },
	},
} satisfies Meta<typeof Avatar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
	render: (args) => (
		<View style={styles.playground}>
			<Avatar accessibilityLabel="Avery Chen" {...args}>
				<AvatarImage source={exampleImage} />
				<AvatarFallback name="Avery Chen" />
			</Avatar>
		</View>
	),
};

export const LightTheme: Story = {
	render: () => <AvatarGallery themeName="light" />,
};

export const DarkTheme: Story = {
	render: () => <AvatarGallery themeName="dark" />,
};

function AvatarGallery({ themeName }: { themeName: "light" | "dark" }) {
	return (
		<ScopedTheme name={themeName}>
			<ScrollView contentContainerStyle={styles.canvas} style={styles.screen}>
				<StorySection title="Basic">
					<View style={styles.row}>
						<Avatar accessibilityLabel="Shadcn">
							<AvatarImage source={exampleImage} />
							<AvatarFallback>CN</AvatarFallback>
						</Avatar>
						<Avatar accessibilityLabel="Avery Chen">
							<AvatarFallback name="Avery Chen" />
						</Avatar>
						<Avatar accessibilityLabel="Jordan Lee">
							<AvatarFallback>JL</AvatarFallback>
						</Avatar>
					</View>
				</StorySection>

				<StorySection title="Sizes">
					<View style={styles.row}>
						{sizes.map((size) => (
							<Avatar
								accessibilityLabel={`${size} Avatar`}
								key={size}
								size={size}
							>
								<AvatarFallback name="Avery Chen" />
							</Avatar>
						))}
					</View>
				</StorySection>

				<StorySection title="Household Members">
					<ItemGroup variant="outline">
						<MemberItem detail="Owner · You" name="Avery Chen" />
						<ItemSeparator />
						<MemberItem detail="Member" name="Jordan Lee" />
						<ItemSeparator />
						<MemberItem detail="Member" name="Morgan Patel" />
					</ItemGroup>
				</StorySection>
			</ScrollView>
		</ScopedTheme>
	);
}

function MemberItem({ detail, name }: { detail: string; name: string }) {
	return (
		<Item size="sm">
			<ItemMedia>
				<Avatar accessibilityLabel={name}>
					<AvatarFallback name={name} />
				</Avatar>
			</ItemMedia>
			<ItemContent>
				<ItemTitle>{name}</ItemTitle>
				<ItemDescription>{detail}</ItemDescription>
			</ItemContent>
		</Item>
	);
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
			{children}
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	screen: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
	canvas: {
		gap: theme.spacing(6),
		padding: theme.spacing(6),
	},
	playground: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
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
