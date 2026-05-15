import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { type ActiveListDataAdapter, type ActiveListInitialState } from "@/components/active-list";
import { createRemoteActiveListAdapter } from "@/lib/app/active-list-adapter";
import { bootstrapWithClerk } from "@/lib/app/bootstrap-client";
import { clerkMocks, setMockAuthCallbacksUnstable, setMockAuthState, setMockUserState } from "@/lib/test/mocks/clerk";
import HomeScreen, { HomeScreenView } from "@/screens/home/home-screen";

jest.mock("@/lib/app/bootstrap-client", () => ({
  bootstrapWithClerk: jest.fn(),
}));

jest.mock("@/lib/app/active-list-adapter", () => ({
  createRemoteActiveListAdapter: jest.fn(),
}));

beforeEach(() => {
  jest.mocked(bootstrapWithClerk).mockReset();
  jest.mocked(createRemoteActiveListAdapter).mockReset();
});

describe("HomeScreen", () => {
  it("does not restart bootstrap when auth callbacks are not referentially stable", async () => {
    const initialList = initialListFixture();
    jest.mocked(bootstrapWithClerk).mockResolvedValue(bootstrapFixture());
    jest.mocked(createRemoteActiveListAdapter).mockReturnValue(noopAdapter(initialList));
    clerkMocks.getToken.mockResolvedValue("session-token");
    setMockAuthState({ isSignedIn: true });
    setMockAuthCallbacksUnstable(true);
    setMockUserState({
      user: {
        fullName: "Avery Chen",
        firstName: "Avery",
        primaryEmailAddress: { emailAddress: "avery@example.com" },
      },
    });

    render(<HomeScreen />);

    await waitFor(() => expect(screen.getByText("Milk")).toBeTruthy());
    expect(bootstrapWithClerk).toHaveBeenCalledTimes(1);
    expect(createRemoteActiveListAdapter).toHaveBeenCalledTimes(1);
  });
});

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
    const initialList = initialListFixture();

    render(
      <HomeScreenView
        currentMemberName="Avery Chen"
        content={{
          status: "ready",
          bootstrap: {
            ...bootstrapFixture(),
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

function bootstrapFixture() {
  return {
    user: {
      id: "usr_avery",
      clerkUserId: "clerk_avery",
      email: "avery@example.com",
      firstName: "Avery",
      lastName: "Chen",
      displayName: "Avery Chen",
    },
    activeHousehold: { id: "hh_avery", name: "Avery" },
    activeMember: { id: "mbr_avery", userId: "usr_avery", role: "owner" as const, displayName: "Avery Chen" },
    activeList: { id: "lst_default_groceries", name: "Groceries" },
    members: [
      { membershipId: "mbr_avery", userId: "usr_avery", role: "owner" as const, displayName: "Avery Chen" },
    ],
    householdDatabase: {
      url: "libsql://example.turso.io",
      authToken: "token",
      expiresAt: 1,
    },
  };
}

function initialListFixture(): ActiveListInitialState {
  return {
    householdName: "Avery",
    listName: "Groceries",
    items: [{ id: "itm_milk", name: "Milk", checked: true, checkedByMemberName: "Avery Chen" }],
  };
}

function noopAdapter(initialList: ActiveListInitialState): ActiveListDataAdapter & { close: () => Promise<void> } {
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
