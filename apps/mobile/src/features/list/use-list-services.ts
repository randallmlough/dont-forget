import { useMemo } from "react";
import { useLogger } from "@mobile/lib/logger";
import { appProductDatabase } from "@mobile/session/powersync-app-database";
import {
	type CurrentListSelectionStore,
	createCurrentListSelectionStore,
} from "./current-selection";
import { createListService, type ListService } from "./list-service";

export type ListServices = {
	lists: ListService;
	currentListSelection: CurrentListSelectionStore;
};

export function useListServices(input: {
	householdId: string;
	userId: string;
}): ListServices {
	const logger = useLogger();

	return useMemo(() => {
		const householdLogger = logger.with({ household_id: input.householdId });
		return {
			lists: createListService({
				householdId: input.householdId,
				userId: input.userId,
				store: appProductDatabase,
				logger: householdLogger,
			}),
			currentListSelection: createCurrentListSelectionStore(),
		};
	}, [input.householdId, input.userId, logger]);
}
