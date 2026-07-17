import {
	createContext,
	type PropsWithChildren,
	useContext,
	useMemo,
} from "react";

type NavigationDrawerContextValue = {
	open: () => void;
};

const NavigationDrawerContext = createContext<NavigationDrawerContextValue | null>(
	null,
);

export function NavigationDrawerProvider({
	open,
	children,
}: PropsWithChildren<NavigationDrawerContextValue>) {
	const value = useMemo(() => ({ open }), [open]);
	return (
		<NavigationDrawerContext.Provider value={value}>
			{children}
		</NavigationDrawerContext.Provider>
	);
}

export function useNavigationDrawer(): NavigationDrawerContextValue {
	const value = useContext(NavigationDrawerContext);
	if (!value) {
		throw new Error("useNavigationDrawer requires NavigationDrawerProvider");
	}
	return value;
}
