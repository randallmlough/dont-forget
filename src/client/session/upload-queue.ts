import { db } from "@/client/session/powersync";

export type UploadQueueStats = {
	count: number;
};

export type UploadQueueState = {
	connected: boolean;
	uploadError: boolean;
};

export type UploadQueueMonitor = {
	getUploadQueueStats: () => Promise<UploadQueueStats>;
	getUploadQueueState: () => UploadQueueState;
	subscribe: (onChange: () => void) => () => void;
};

export const uploadQueueMonitor: UploadQueueMonitor = {
	getUploadQueueStats,
	getUploadQueueState,
	subscribe: subscribeUploadQueueChanges,
};

export async function getUploadQueueStats(): Promise<UploadQueueStats> {
	const stats = await db.getUploadQueueStats(false);
	return { count: stats.count };
}

export function getUploadQueueState(): UploadQueueState {
	const status = db.currentStatus;
	return {
		connected: status.connected,
		uploadError: Boolean(status.dataFlowStatus.uploadError),
	};
}

export function subscribeUploadQueueChanges(onChange: () => void): () => void {
	return db.registerListener({ statusChanged: onChange });
}
