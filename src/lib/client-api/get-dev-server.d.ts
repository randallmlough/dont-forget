// React Native ships this dev-tooling module without TypeScript types.
declare module "react-native/Libraries/Core/Devtools/getDevServer" {
	export type DevServerInfo = {
		url: string;
		fullBundleUrl: string | null;
		bundleLoadedFromServer: boolean;
	};

	export default function getDevServer(): DevServerInfo;
}
