import type { Meta, StoryObj } from "@storybook/react-native";
import { type SFSymbol, SymbolView } from "expo-symbols";
import type { ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";
import { ScopedTheme, StyleSheet, useUnistyles } from "react-native-unistyles";

import { Badge } from "./badge";
import { Button } from "./button";
import {
	Item,
	ItemActions,
	ItemActionsLabel,
	ItemContent,
	ItemDescription,
	ItemFooter,
	ItemGroup,
	ItemHeader,
	ItemMedia,
	ItemSeparator,
	type ItemSize,
	ItemTitle,
	type ItemVariant,
} from "./item";
import { InitialsAvatar } from "./settings-surface";

const variants = ["default", "outline", "muted"] satisfies ItemVariant[];
const sizes = ["default", "sm", "xs"] satisfies ItemSize[];

const meta = {
	title: "UI/Item",
	component: Item,
	args: {
		size: "default",
		variant: "outline",
	},
	argTypes: {
		size: { control: "select", options: sizes },
		variant: { control: "select", options: variants },
	},
} satisfies Meta<typeof Item>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
	render: (args) => (
		<View style={styles.playground}>
			<Item {...args}>
				<ItemContent>
					<ItemTitle>Groceries</ItemTitle>
					<ItemDescription>
						8 Items remaining in this shared List.
					</ItemDescription>
				</ItemContent>
			</Item>
		</View>
	),
};

export const LightTheme: Story = {
	render: () => <ItemGallery themeName="light" />,
};

export const DarkTheme: Story = {
	render: () => <ItemGallery themeName="dark" />,
};

function ItemGallery({ themeName }: { themeName: "light" | "dark" }) {
	return (
		<ScopedTheme name={themeName}>
			<ScrollView contentContainerStyle={styles.canvas} style={styles.screen}>
				<StorySection title="Basic">
					<Item variant="outline">
						<ItemContent>
							<ItemTitle>Basic Item</ItemTitle>
							<ItemDescription>
								A simple Item with a title, description, and action.
							</ItemDescription>
						</ItemContent>
						<ItemActions>
							<Button onPress={noop} size="sm" variant="outline">
								Action
							</Button>
						</ItemActions>
					</Item>

					<Button
						accessibilityLabel="Open profile verification"
						onPress={noop}
						style={styles.itemLink}
						variant="link"
					>
						<Item size="sm" variant="outline">
							<ItemMedia>
								<ItemSymbol name="checkmark.seal.fill" />
							</ItemMedia>
							<ItemContent>
								<ItemTitle>Your profile has been verified.</ItemTitle>
							</ItemContent>
							<ItemActions>
								<ItemSymbol muted name="chevron.right" />
							</ItemActions>
						</Item>
					</Button>
				</StorySection>

				<StorySection title="Variants">
					{variants.map((variant) => (
						<Item key={variant} variant={variant}>
							<ItemContent>
								<ItemTitle>{variantLabel(variant)}</ItemTitle>
								<ItemDescription>
									The {variant} visual treatment for Item content.
								</ItemDescription>
							</ItemContent>
						</Item>
					))}
				</StorySection>

				<StorySection title="Sizes">
					{sizes.map((size) => (
						<Item key={size} size={size} variant="outline">
							<ItemMedia variant="icon">
								<ItemSymbol name="basket" />
							</ItemMedia>
							<ItemContent>
								<ItemTitle>{sizeLabel(size)}</ItemTitle>
								{size === "xs" ? null : (
									<ItemDescription>
										Consistent spacing for the {size} size.
									</ItemDescription>
								)}
							</ItemContent>
						</Item>
					))}
				</StorySection>

				<StorySection title="Media">
					<Item variant="outline">
						<ItemMedia variant="icon">
							<ItemSymbol name="tray" />
						</ItemMedia>
						<ItemContent>
							<ItemTitle>Icon</ItemTitle>
							<ItemDescription>
								Use the icon variant for a framed symbol.
							</ItemDescription>
						</ItemContent>
					</Item>

					<Item variant="outline">
						<ItemMedia>
							<InitialsAvatar label="Avery Chen" />
						</ItemMedia>
						<ItemContent>
							<ItemTitle>Avery Chen</ItemTitle>
							<ItemDescription>Owner of Avery Household.</ItemDescription>
						</ItemContent>
					</Item>

					<Item variant="outline">
						<ItemMedia variant="image">
							<View style={styles.imagePlaceholder}>
								<Text style={styles.imagePlaceholderLabel}>DF</Text>
							</View>
						</ItemMedia>
						<ItemContent>
							<ItemTitle>Image</ItemTitle>
							<ItemDescription>
								The image variant clips media to a consistent frame.
							</ItemDescription>
						</ItemContent>
					</Item>
				</StorySection>

				<StorySection title="Group">
					<ItemGroup style={styles.group}>
						<GroupItem
							description="Items shared with your Household."
							icon="basket"
							title="Groceries"
						/>
						<ItemSeparator />
						<GroupItem
							description="Everything needed for the weekend."
							icon="house"
							title="Lake House"
						/>
						<ItemSeparator />
						<GroupItem
							description="Supplies and recurring essentials."
							icon="shippingbox"
							title="Studio"
						/>
					</ItemGroup>
				</StorySection>

				<StorySection title="Group as links">
					<ItemGroup style={styles.group}>
						<GroupItemLink
							description="Customize your appearance."
							icon="paintbrush"
							title="Apperance"
							currentValue="Dark"
						/>
						<ItemSeparator />
						<GroupItemLink
							description="Communications and notifications."
							icon="bell"
							title="Notifications"
							currentValue="disabled"
						/>
						<ItemSeparator />
						<GroupItemLink
							description="Your personal information."
							icon="person"
							title="Name"
							currentValue="John Doe"
						/>
					</ItemGroup>
				</StorySection>

				<StorySection title="Header and footer">
					<Item variant="outline">
						<ItemHeader>
							<Badge variant="secondary">Household</Badge>
							<Text style={styles.metadata}>Updated today</Text>
						</ItemHeader>
						<ItemContent>
							<ItemTitle>Shared Lists</ItemTitle>
							<ItemDescription>
								Everyone in Avery Household can collaborate on these Lists.
							</ItemDescription>
						</ItemContent>
						<ItemFooter>
							<Text style={styles.metadata}>4 Members</Text>
							<Button onPress={noop} size="sm" variant="outline">
								Open
							</Button>
						</ItemFooter>
					</Item>
				</StorySection>
			</ScrollView>
		</ScopedTheme>
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

function GroupItem({
	description,
	icon,
	title,
}: {
	description: string;
	icon: SFSymbol;
	title: string;
}) {
	return (
		<Item size="sm">
			<ItemMedia variant="icon">
				<ItemSymbol name={icon} />
			</ItemMedia>
			<ItemContent>
				<ItemTitle>{title}</ItemTitle>
				<ItemDescription>{description}</ItemDescription>
			</ItemContent>
		</Item>
	);
}

function GroupItemLink({
	description,
	icon,
	title,
	currentValue,
}: {
	description: string;
	icon: SFSymbol;
	title: string;
	currentValue: string;
}) {
	return (
		<Button
			accessibilityLabel="Open setting"
			onPress={noop}
			style={styles.itemLink}
			variant="link"
		>
			<Item size="sm">
				<ItemMedia variant="icon">
					<ItemSymbol name={icon} />
				</ItemMedia>
				<ItemContent>
					<ItemTitle>{title}</ItemTitle>
					<ItemDescription>{description}</ItemDescription>
				</ItemContent>
				<ItemActions>
					<ItemActionsLabel>{currentValue}</ItemActionsLabel>
					<ItemSymbol muted name="chevron.right" />
				</ItemActions>
			</Item>
		</Button>
	);
}

function ItemSymbol({
	muted = false,
	name,
}: {
	muted?: boolean;
	name: SFSymbol;
}) {
	const { theme } = useUnistyles();

	return (
		<SymbolView
			accessibilityElementsHidden
			accessible={false}
			name={name}
			size={theme.spacing(4)}
			tintColor={muted ? theme.colors.mutedForeground : theme.colors.foreground}
			weight="medium"
		/>
	);
}

function variantLabel(variant: ItemVariant): string {
	return variant.charAt(0).toUpperCase() + variant.slice(1);
}

function sizeLabel(size: ItemSize): string {
	if (size === "default") return "Default";
	return size.toUpperCase();
}

function noop() {}

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
		justifyContent: "center",
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
	itemLink: {
		width: "100%",
		flexDirection: "column",
		alignItems: "stretch",
		paddingHorizontal: 0,
	},
	imagePlaceholder: {
		width: "100%",
		height: "100%",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: theme.colors.primary,
	},
	imagePlaceholderLabel: {
		...theme.typography.captionStrong,
		color: theme.colors.primaryForeground,
	},
	group: {
		borderWidth: theme.borders.thin,
		borderColor: theme.colors.border,
		borderRadius: theme.radii.md,
		overflow: "hidden",
		backgroundColor: theme.colors.card,
	},
	metadata: {
		...theme.typography.caption,
		color: theme.colors.mutedForeground,
	},
}));
