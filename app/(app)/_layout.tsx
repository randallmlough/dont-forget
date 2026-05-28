import { Stack } from "expo-router";

import { AuthenticatedAppSessionProvider } from "@/components/session";

export default function AppLayout() {
	return (
		<AuthenticatedAppSessionProvider>
			<Stack screenOptions={{ headerShown: false }} />
		</AuthenticatedAppSessionProvider>
	);
}
