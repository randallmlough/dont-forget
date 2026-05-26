import { Stack } from "expo-router";

import { ActiveHouseholdProvider } from "@/components/active-household";

export default function AppLayout() {
	return (
		<ActiveHouseholdProvider>
			<Stack screenOptions={{ headerShown: false }} />
		</ActiveHouseholdProvider>
	);
}
