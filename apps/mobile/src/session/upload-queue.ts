import { db } from "@mobile/session/powersync";

export type UploadQueueStats = {
	count: number;
};

export type UploadQueueState = {
	connected: boolean;
	connecting: boolean;
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

async function getUploadQueueStats(): Promise<UploadQueueStats> {
	const stats = await db.getUploadQueueStats(false);
	return { count: stats.count };
}

function getUploadQueueState(): UploadQueueState {
	const status = db.currentStatus;
	return {
		connected: status.connected,
		connecting: status.connecting,
		uploadError: Boolean(status.dataFlowStatus.uploadError),
	};
}

function subscribeUploadQueueChanges(onChange: () => void): () => void {
	return db.registerListener({ statusChanged: onChange });
}
