import { useMemo } from "react";
import { useLogger } from "@/client/lib/logger";
import { appProductDatabase } from "@/client/session/powersync-app-database";
import { createItemService, type ItemService } from "./item-service";

export type UseItemServiceInput = {
	householdId: string;
};

export function useItemService(input: UseItemServiceInput): ItemService {
	const logger = useLogger();

	return useMemo(
		() =>
			createItemService({
				householdId: input.householdId,
				store: appProductDatabase,
				logger: logger.with({ household_id: input.householdId }),
			}),
		[input.householdId, logger],
	);
}
