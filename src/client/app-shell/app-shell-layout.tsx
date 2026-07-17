import { Stack } from "expo-router";
import { useCallback, useState } from "react";
import { NavigationDrawer } from "./navigation-drawer";
import { NavigationDrawerProvider } from "./navigation-drawer-context";

export function AppShellLayout() {
	const [drawerOpen, setDrawerOpen] = useState(false);
	const open = useCallback(() => setDrawerOpen(true), []);

	return (
		<NavigationDrawerProvider open={open}>
			<Stack screenOptions={{ headerShown: false }} />
			<NavigationDrawer
				isOpen={drawerOpen}
				onClose={() => setDrawerOpen(false)}
			/>
		</NavigationDrawerProvider>
	);
}
