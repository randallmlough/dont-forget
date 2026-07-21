import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { ScreenScaffold } from "@/client/app-shell/screen-scaffold";
import { Avatar, AvatarFallback } from "@/client/ui/avatar";
import { Button } from "@/client/ui/button";
import { Card, CardContent } from "@/client/ui/card";
import {
	Item,
	ItemActions,
	ItemActionsLabel,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemMedia,
	ItemPressable,
	ItemSeparator,
	ItemTitle,
} from "@/client/ui/item";
import { ScreenSection } from "@/client/ui/screen-section";
import {
	type SettingsActions,
	type SettingsState,
	useSettings,
} from "./use-settings";

export default function ProfileScreen() {
	const router = useRouter();
	const { state, actions } = useSettings();
	const returnToSettings = () => {
		if (router.canGoBack()) {
			router.back();
			return;
		}
		router.replace("/settings");
	};

	async function signOutFromProfile() {
		router.replace("/");
		try {
			await actions.signOut();
		} catch {
			// The Authenticated App Session provider owns recovery if Clerk sign-out
			// fails after local cleanup. Profile has already returned the User Home.
		}
	}

	return (
		<ProfileScreenView
			actions={{ ...actions, signOut: signOutFromProfile }}
			onBack={returnToSettings}
			state={state}
		/>
	);
}

export function ProfileScreenView({
	actions,
	onBack,
	state,
}: {
	actions: SettingsActions;
	onBack: () => void;
	state: SettingsState;
}) {
	const [editing, setEditing] = useState(false);
	const displayName =
		state.user.displayName ?? state.user.email ?? "Don't Forget User";

	return (
		<ScreenScaffold
			label="Settings"
			navigation={{ kind: "back", onPress: onBack }}
			title="Profile"
		>
			<ScrollView
				contentContainerStyle={styles.content}
				contentInsetAdjustmentBehavior="automatic"
				keyboardShouldPersistTaps="handled"
			>
				<View style={styles.hero}>
					<Avatar accessibilityLabel={displayName} size="xl">
						<AvatarFallback name={displayName} />
					</Avatar>
					<View style={styles.heroText}>
						<Text style={styles.heroName}>{displayName}</Text>
						{state.user.email ? (
							<Text style={styles.heroEmail}>{state.user.email}</Text>
						) : null}
					</View>
				</View>

				<ScreenSection
					action={
						editing
							? undefined
							: { label: "Edit", onPress: () => setEditing(true) }
					}
					title="Personal Information"
				>
					{editing ? (
						<UserNameForm
							actions={actions}
							onCancel={() => setEditing(false)}
							onSaved={() => setEditing(false)}
							state={state}
						/>
					) : (
						<ItemGroup variant="outline">
							<ProfileDetailItem
								title="First Name"
								value={state.user.firstName ?? "Not set"}
							/>
							<ItemSeparator />
							<ProfileDetailItem
								title="Last Name"
								value={state.user.lastName ?? "Not set"}
							/>
						</ItemGroup>
					)}
				</ScreenSection>

				<ScreenSection title="User">
					<ItemGroup variant="outline">
						<Item size="sm">
							<ItemContent>
								<ItemTitle>Email</ItemTitle>
								<ItemDescription>
									Managed by your sign-in provider
								</ItemDescription>
							</ItemContent>
							<ItemActions>
								<ItemActionsLabel>
									{state.user.email ?? "Unavailable"}
								</ItemActionsLabel>
							</ItemActions>
						</Item>
					</ItemGroup>
				</ScreenSection>

				<ScreenSection title="Session">
					<ItemGroup variant="outline">
						<SignOutItem
							onPress={() => {
								void actions.signOut();
							}}
						/>
					</ItemGroup>
				</ScreenSection>
			</ScrollView>
		</ScreenScaffold>
	);
}

function UserNameForm({
	actions,
	onCancel,
	onSaved,
	state,
}: {
	actions: SettingsActions;
	onCancel: () => void;
	onSaved: () => void;
	state: SettingsState;
}) {
	const [firstNameDraft, setFirstNameDraft] = useState<string | null>(null);
	const [lastNameDraft, setLastNameDraft] = useState<string | null>(null);
	const [validationMessage, setValidationMessage] = useState<string | null>(
		null,
	);
	const firstName = firstNameDraft ?? state.user.firstName ?? "";
	const lastName = lastNameDraft ?? state.user.lastName ?? "";

	async function saveUserName() {
		const nextFirstName = emptyToNull(firstName);
		const nextLastName = emptyToNull(lastName);
		if (!nextFirstName && !nextLastName) {
			setValidationMessage("Provide a first or last name.");
			return;
		}
		setValidationMessage(null);
		const saved = await actions.updateUserName({
			firstName: nextFirstName,
			lastName: nextLastName,
		});
		if (saved) onSaved();
	}

	return (
		<Card>
			<CardContent style={styles.form}>
				<View style={styles.field}>
					<Text style={styles.fieldLabel}>First Name</Text>
					<TextInput
						accessibilityLabel="First name"
						autoCapitalize="words"
						autoComplete="given-name"
						editable={!state.userUpdateInFlight}
						onChangeText={setFirstNameDraft}
						placeholder="First name"
						returnKeyType="next"
						style={styles.input}
						value={firstName}
					/>
				</View>
				<View style={styles.field}>
					<Text style={styles.fieldLabel}>Last Name</Text>
					<TextInput
						accessibilityLabel="Last name"
						autoCapitalize="words"
						autoComplete="family-name"
						editable={!state.userUpdateInFlight}
						onChangeText={setLastNameDraft}
						placeholder="Last name"
						returnKeyType="done"
						style={styles.input}
						value={lastName}
					/>
				</View>
				{validationMessage ? (
					<Text style={styles.formError}>{validationMessage}</Text>
				) : null}
				{state.userError ? (
					<Text style={styles.formError}>{state.userError}</Text>
				) : null}
				{state.userNotice ? (
					<Text style={styles.formNotice}>{state.userNotice}</Text>
				) : null}
				<View style={styles.formActions}>
					<Button
						disabled={state.userUpdateInFlight}
						onPress={() => {
							void saveUserName();
						}}
					>
						{state.userUpdateInFlight ? "Saving" : "Save"}
					</Button>
					<Button
						disabled={state.userUpdateInFlight}
						onPress={onCancel}
						variant="outline"
					>
						Cancel
					</Button>
				</View>
			</CardContent>
		</Card>
	);
}

function ProfileDetailItem({ title, value }: { title: string; value: string }) {
	return (
		<Item size="sm">
			<ItemContent>
				<ItemTitle>{title}</ItemTitle>
			</ItemContent>
			<ItemActions>
				<ItemActionsLabel>{value}</ItemActionsLabel>
			</ItemActions>
		</Item>
	);
}

function SignOutItem({ onPress }: { onPress: () => void }) {
	const { theme } = useUnistyles();
	return (
		<ItemPressable accessibilityLabel="Sign Out" onPress={onPress} size="sm">
			<ItemMedia variant="icon">
				<SymbolView
					accessibilityElementsHidden
					accessible={false}
					name="rectangle.portrait.and.arrow.right"
					size={theme.spacing(4)}
					tintColor={theme.colors.destructive}
					weight="medium"
				/>
			</ItemMedia>
			<ItemContent>
				<ItemTitle style={styles.destructiveTitle}>Sign Out</ItemTitle>
			</ItemContent>
		</ItemPressable>
	);
}

function emptyToNull(value: string): string | null {
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

const styles = StyleSheet.create((theme) => ({
	content: {
		paddingHorizontal: theme.spacing(5),
		paddingBottom: theme.spacing(12),
		gap: theme.spacing(6),
	},
	hero: {
		alignItems: "center",
		gap: theme.spacing(4),
		paddingVertical: theme.spacing(2),
	},
	heroText: {
		alignItems: "center",
		gap: theme.spacing(1),
	},
	heroName: {
		...theme.typography.title,
		fontFamily: theme.fontFamilies.serif,
		color: theme.colors.foreground,
		textAlign: "center",
	},
	heroEmail: {
		...theme.typography.body,
		color: theme.colors.mutedForeground,
		textAlign: "center",
	},
	form: {
		gap: theme.spacing(3),
		padding: theme.spacing(4),
		paddingTop: theme.spacing(4),
	},
	field: {
		gap: theme.spacing(1),
	},
	fieldLabel: {
		...theme.typography.captionStrong,
		color: theme.colors.mutedForeground,
		textTransform: "uppercase",
	},
	input: {
		minHeight: theme.spacing(12),
		paddingHorizontal: theme.spacing(3),
		borderWidth: theme.borders.hairline,
		borderColor: theme.colors.input,
		borderRadius: theme.radii.xl,
		backgroundColor: theme.colors.glassTint,
		color: theme.colors.foreground,
		...theme.typography.body,
	},
	formActions: {
		flexDirection: "row",
		gap: theme.spacing(2),
	},
	formError: {
		...theme.typography.callout,
		color: theme.colors.destructive,
	},
	formNotice: {
		...theme.typography.callout,
		color: theme.colors.primary,
	},
	destructiveTitle: {
		color: theme.colors.destructive,
	},
}));
