import { fireEvent, render, screen } from "@testing-library/react-native";

import { type ActiveListDataAdapter, type ActiveListInitialState } from "@/components/active-list";
import { HomeScreenView } from "@/screens/home/home-screen";

describe("HomeScreenView", () => {
  it("shows bootstrap loading and retryable error states", () => {
    const retry = jest.fn();

    const { rerender } = render(
      <HomeScreenView currentMemberName="Avery Chen" content={{ status: "loading" }} />,
    );
    expect(screen.getByText("Preparing your Household")).toBeTruthy();

    rerender(
      <HomeScreenView
        currentMemberName="Avery Chen"
        content={{ status: "error", message: "Unable to prepare your Household. Please try again." }}
        onRetry={retry}
      />,
    );

    fireEvent.press(screen.getByText("Try again"));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("renders durable Active List data after bootstrap succeeds", () => {
    const initialList: ActiveListInitialState = {
      householdName: "Avery",
      listName: "Groceries",
      items: [{ id: "itm_milk", name: "Milk", checked: true, checkedByMemberName: "Avery Chen" }],
    };

    render(
      <HomeScreenView
        currentMemberName="Avery Chen"
        content={{
          status: "ready",
          bootstrap: {
            user: {
              id: "usr_avery",
              clerkUserId: "clerk_avery",
              email: "avery@example.com",
              firstName: "Avery",
              lastName: "Chen",
              displayName: "Avery Chen",
            },
            activeHousehold: { id: "hh_avery", name: "Avery" },
            activeMember: { id: "mbr_avery", userId: "usr_avery", role: "owner", displayName: "Avery Chen" },
            activeList: { id: "lst_default_groceries", name: "Groceries" },
            members: [
              { membershipId: "mbr_avery", userId: "usr_avery", role: "owner", displayName: "Avery Chen" },
            ],
            householdDatabase: {
              url: "libsql://example.turso.io",
              authToken: "token",
              expiresAt: 1,
            },
          },
          initialList,
          adapter: noopAdapter(initialList),
        }}
      />,
    );

    expect(screen.getByText("Avery")).toBeTruthy();
    expect(screen.getByText("Groceries")).toBeTruthy();
    expect(screen.getByText("Milk")).toBeTruthy();
    expect(screen.getByText("Checked by Avery Chen")).toBeTruthy();
  });
});

function noopAdapter(initialList: ActiveListInitialState): ActiveListDataAdapter {
  return {
    async load() {
      return initialList;
    },
    async addItem(name) {
      return { id: "itm_new", name, checked: false, checkedByMemberName: null };
    },
    async setItemChecked() {},
    async close() {},
  };
}
