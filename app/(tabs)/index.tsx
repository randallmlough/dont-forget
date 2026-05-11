import { useAuth, useUser } from "@clerk/clerk-expo";
import { useMemo } from "react";

import { type ActiveListInitialState } from "@/components/active-list";
import { HomeScreen } from "@/components/home/home-screen";
import { reset, track } from "@/lib/analytics";

export default function HomeRoute() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const currentMemberName =
    user?.fullName ?? user?.firstName ?? user?.primaryEmailAddress?.emailAddress ?? "Member";
  const householdName = user?.firstName ?? "Untitled";

  const initialList = useMemo<ActiveListInitialState>(
    () => ({
      householdName,
      listName: "Groceries",
      items: [],
    }),
    [householdName],
  );

  function onSignOut() {
    track("user_signed_out", {});
    reset();
    void signOut();
  }

  return (
    <HomeScreen
      currentMemberName={currentMemberName}
      initialList={initialList}
      onSignOut={onSignOut}
    />
  );
}
