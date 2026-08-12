import { NavigationDrawerProvider } from "@mobile/app-shell/navigation-drawer-context";
import type {
	SettingsActions,
	SettingsState,
} from "@mobile/features/settings/use-settings";
import type { Meta, StoryObj } from "@storybook/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ProfileScreenView } from "../profile-screen";
import { SettingsScreenView } from "../settings-screen";
import { AppearanceScreenView } from "./appearance-screen";

const meta = {
	title: "screens/app/settings/SettingsPages",
	decorators: [
		(Story) => (
			<SafeAreaProvider
				initialMetrics={{
					frame: { x: 0, y: 0, width: 390, height: 844 },
					insets: { top: 47, left: 0, right: 0, bottom: 34 },
				}}
			>
				<NavigationDrawerProvider open={noop}>
					<Story />
				</NavigationDrawerProvider>
			</SafeAreaProvider>
		),
	],
	parameters: { noSafeArea: true },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Settings: Story = {
	render: () => (
		<SettingsScreenView actions={actionsFixture} state={stateFixture} />
	),
};

export const Appearance: Story = {
	render: () => (
		<AppearanceScreenView
			actions={actionsFixture}
			onBack={noop}
			state={stateFixture}
		/>
	),
};

export const Profile: Story = {
	render: () => (
		<ProfileScreenView
			actions={actionsFixture}
			onBack={noop}
			state={stateFixture}
		/>
	),
};

const stateFixture: SettingsState = {
	appearancePreference: "system",
	appEnv: "production",
	appVersion: "1.0.0",
	privacyPolicyUrl: "https://example.com/privacy",
	termsUrl: "https://example.com/terms",
	user: {
		id: "usr_avery",
		email: "avery@example.com",
		displayName: "Avery Chen",
		firstName: "Avery",
		lastName: "Chen",
	},
	userUpdateInFlight: false,
};

const actionsFixture: SettingsActions = {
	openPrivacyPolicy: async () => undefined,
	openTerms: async () => undefined,
	setAppearancePreference: async () => undefined,
	signOut: async () => undefined,
	updateUserName: async () => true,
};

function noop() {}
