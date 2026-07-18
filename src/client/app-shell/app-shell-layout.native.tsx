import { Stack } from "expo-router";
import { useCallback, useState } from "react";
import { NavigationDrawer } from "./navigation-drawer";
import { NavigationDrawerProvider } from "./navigation-drawer-context";

export function AppShellLayout() {
	const [drawerState, setDrawerState] = useState<
		"closed" | "open" | "dismissing"
	>("closed");
	const open = useCallback(() => setDrawerState("open"), []);

	return (
		<NavigationDrawerProvider open={open}>
			<Stack screenOptions={{ headerShown: false }} />
			{drawerState === "closed" ? null : (
				<NavigationDrawer
					isOpen={drawerState === "open"}
					onClose={() => setDrawerState("dismissing")}
					onDismissed={() => setDrawerState("closed")}
				/>
			)}
		</NavigationDrawerProvider>
	);
}
