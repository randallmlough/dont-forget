import { useRouter } from "expo-router";
import { useEffect } from "react";
import { useAuthenticatedAppSession } from "@/components/session";

export function useSessionReloadRedirect() {
	const { reloadSession } = useAuthenticatedAppSession();
	const router = useRouter();

	useEffect(() => {
		reloadSession();
		router.replace("/");
	}, [reloadSession, router]);
}
