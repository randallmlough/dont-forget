import { useMemo } from "react";
import { useLogger } from "@/client/lib/logger";
import { appProductDatabase } from "@/client/session/powersync-app-database";
import { createItemService, type ItemService } from "./item-service";
import { createListService, type ListService } from "./list-service";

export type ProductServices = {
	lists: ListService;
	items: ItemService;
};

export function useProductServices(input: {
	householdId: string;
	userId: string;
}): ProductServices {
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
			items: createItemService({
				householdId: input.householdId,
				store: appProductDatabase,
				logger: householdLogger,
			}),
		};
	}, [input.householdId, input.userId, logger]);
}
