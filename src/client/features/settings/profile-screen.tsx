import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { ScreenScaffold } from "@/client/app-shell/screen-scaffold";
import { AppButton } from "@/client/ui/app-button";
import {
	InitialsAvatar,
	SurfaceCard,
	SurfaceRow,
	SurfaceSection,
} from "@/client/ui/settings-surface";
import {
	type SettingsActions,
	type SettingsState,
	useSettings,
} from "./use-settings";

export default function ProfileScreen() {
	const router = useRouter();
	const { state, actions } = useSettings();

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
			onBack={() => router.back()}
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
					<InitialsAvatar label={displayName} size="large" />
					<View style={styles.heroText}>
						<Text style={styles.heroName}>{displayName}</Text>
						{state.user.email ? (
							<Text style={styles.heroEmail}>{state.user.email}</Text>
						) : null}
					</View>
				</View>

				<SurfaceSection
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
						<SurfaceCard>
							<SurfaceRow
								divider
								label="First Name"
								value={state.user.firstName ?? "Not set"}
							/>
							<SurfaceRow
								label="Last Name"
								value={state.user.lastName ?? "Not set"}
							/>
						</SurfaceCard>
					)}
				</SurfaceSection>

				<SurfaceSection title="User">
					<SurfaceCard>
						<SurfaceRow
							detail="Managed by your sign-in provider"
							label="Email"
							value={state.user.email ?? "Unavailable"}
						/>
					</SurfaceCard>
				</SurfaceSection>

				<SurfaceSection title="Session">
					<SurfaceCard>
						<SurfaceRow
							disclosure={false}
							label="Sign Out"
							onPress={() => {
								void actions.signOut();
							}}
							symbol="rectangle.portrait.and.arrow.right"
							tone="destructive"
						/>
					</SurfaceCard>
				</SurfaceSection>
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
		<SurfaceCard>
			<View style={styles.form}>
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
					<AppButton
						disabled={state.userUpdateInFlight}
						label={state.userUpdateInFlight ? "Saving" : "Save"}
						onPress={() => {
							void saveUserName();
						}}
						variant="primary"
					/>
					<AppButton
						disabled={state.userUpdateInFlight}
						label="Cancel"
						onPress={onCancel}
					/>
				</View>
			</View>
		</SurfaceCard>
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
		color: theme.colors.text,
		textAlign: "center",
	},
	heroEmail: {
		...theme.typography.body,
		color: theme.colors.textMuted,
		textAlign: "center",
	},
	form: {
		gap: theme.spacing(3),
		padding: theme.spacing(4),
	},
	field: {
		gap: theme.spacing(1),
	},
	fieldLabel: {
		...theme.typography.captionStrong,
		color: theme.colors.textMuted,
		textTransform: "uppercase",
	},
	input: {
		minHeight: theme.spacing(12),
		paddingHorizontal: theme.spacing(3),
		borderWidth: theme.borders.hairline,
		borderColor: theme.colors.inputBorder,
		borderRadius: theme.radii.control,
		backgroundColor: theme.colors.glassTint,
		color: theme.colors.text,
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
}));
