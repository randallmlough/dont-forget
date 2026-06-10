/**
 * Minimal Turso Platform API helper for operator scripts. Server services
 * have their own client under lib/services/household/server; scripts cannot
 * import server services, so this stays self-contained.
 */

export type TursoPlatformApiConfig = {
	org: string;
	platformApiToken: string;
};

export type TursoPlatformDatabase = {
	name: string;
	url: string;
};

export type TursoPlatformApi = {
	ensureDatabase: (
		name: string,
		group: string,
	) => Promise<TursoPlatformDatabase>;
	createAuthToken: (name: string, expiration: string) => Promise<string>;
	deleteDatabase: (name: string) => Promise<void>;
};

export function tursoPlatformApi(
	config: TursoPlatformApiConfig,
): TursoPlatformApi {
	const baseUrl = `https://api.turso.tech/v1/organizations/${config.org}`;

	async function request(
		path: string,
		init?: RequestInit,
		tolerateStatus: number[] = [],
	): Promise<unknown> {
		const response = await fetch(`${baseUrl}${path}`, {
			...init,
			headers: {
				Authorization: `Bearer ${config.platformApiToken}`,
				"Content-Type": "application/json",
				...init?.headers,
			},
		});
		if (!response.ok && !tolerateStatus.includes(response.status)) {
			const details = await response.text().catch(() => "");
			throw new Error(
				`Turso Platform request ${path} failed with ${response.status}${
					details ? `: ${details.slice(0, 300)}` : ""
				}`,
			);
		}
		if (!response.ok || response.status === 204) return null;
		return response.json();
	}

	return {
		async ensureDatabase(name, group) {
			await request(
				"/databases",
				{ method: "POST", body: JSON.stringify({ name, group }) },
				[409],
			);
			const payload = (await request(`/databases/${name}`)) as {
				database?: { Name?: string; Hostname?: string };
			};
			const hostname = payload.database?.Hostname;
			if (!hostname) {
				throw new Error(`Turso database ${name} response had no hostname`);
			}
			return { name, url: `libsql://${hostname}` };
		},
		async createAuthToken(name, expiration) {
			const payload = (await request(
				`/databases/${name}/auth/tokens?expiration=${expiration}&authorization=full-access`,
				{ method: "POST" },
			)) as { jwt?: string };
			if (!payload.jwt) {
				throw new Error(`Turso token response for ${name} had no jwt`);
			}
			return payload.jwt;
		},
		async deleteDatabase(name) {
			await request(`/databases/${name}`, { method: "DELETE" }, [404]);
		},
	};
}
