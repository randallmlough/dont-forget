import { PowerSyncContext } from "@powersync/react";
import type { ReactNode } from "react";

import { db } from "./powersync";

export type PowerSyncProviderProps = {
	children: ReactNode;
};

export function PowerSyncProvider({ children }: PowerSyncProviderProps) {
	return (
		<PowerSyncContext.Provider value={db}>{children}</PowerSyncContext.Provider>
	);
}
