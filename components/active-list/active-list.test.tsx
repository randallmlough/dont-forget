import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { ActiveList, type ActiveListDataAdapter, type ActiveListInitialState } from "@/components/active-list";

const emptyList: ActiveListInitialState = {
  householdName: "Avery",
  listName: "Groceries",
  items: [],
};

describe("ActiveList", () => {
  it("adds and checks an Item for the current Member", async () => {
    renderActiveList(emptyList);

    expect(screen.getByText("Avery")).toBeTruthy();
    expect(screen.getByText("Groceries")).toBeTruthy();
    expect(screen.getByText("No Items yet")).toBeTruthy();
    expect(screen.getByText("This List is empty.")).toBeTruthy();

    const input = screen.getByPlaceholderText("Add an Item");
    fireEvent.changeText(input, " Milk ");
    await act(async () => {
      fireEvent.press(screen.getByText("Add"));
    });

    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: "Milk" }).props.accessibilityState).toEqual({
        checked: false,
      });
    });
    expect(screen.getByText("0 of 1 Items checked")).toBeTruthy();
    expect(screen.queryByText("This List is empty.")).toBeNull();
    expect(input.props.value).toBe("");

    await act(async () => {
      fireEvent.press(screen.getByRole("checkbox", { name: "Milk" }));
    });

    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: "Milk" }).props.accessibilityState).toEqual({
        checked: true,
      });
    });
    expect(screen.getByText("1 of 1 Items checked")).toBeTruthy();
    expect(screen.getByText("Checked by Avery Chen")).toBeTruthy();
  });

  it("shows pending and failed sync without discarding local Item changes", async () => {
    const sync = deferred<{ changed: boolean }>();
    renderActiveList(emptyList, memoryAdapter(emptyList, { sync: () => sync.promise }));

    fireEvent.changeText(screen.getByPlaceholderText("Add an Item"), "Milk");
    await act(async () => {
      fireEvent.press(screen.getByText("Add"));
    });

    await waitFor(() => expect(screen.getByText("Pending sync")).toBeTruthy());

    await act(async () => {
      sync.reject(new Error("offline"));
    });

    await waitFor(() => expect(screen.getByText("Sync failed - changes saved locally")).toBeTruthy());
    expect(screen.getByRole("checkbox", { name: "Milk" })).toBeTruthy();
  });

  it("shows offline sync state when sync is not authorized", () => {
    renderActiveList(emptyList, memoryAdapter(emptyList, { syncAuthorized: false }));

    expect(screen.getByText("Offline - changes saved locally")).toBeTruthy();
  });

  it("pulls remote changes before refreshing the List view", async () => {
    const adapter = memoryAdapter(emptyList);
    const pull = jest.spyOn(adapter, "pull");

    renderActiveList(emptyList, adapter);

    await act(async () => {
      fireEvent.press(screen.getByText("Refresh"));
    });

    await waitFor(() => expect(screen.getByText("Synced")).toBeTruthy());
    expect(await screen.findByText("Remote Apples")).toBeTruthy();
    expect(pull).toHaveBeenCalledTimes(1);
  });
});

function renderActiveList(initialState: ActiveListInitialState, adapter = memoryAdapter(initialState)) {
  return render(
    <ActiveList.Provider
      initialState={initialState}
      currentMemberName="Avery Chen"
      adapter={adapter}>
      <ActiveList.Screen>
        <ActiveList.Header />
        <ActiveList.Items />
        <ActiveList.AddItemForm />
      </ActiveList.Screen>
    </ActiveList.Provider>,
  );
}

function memoryAdapter(
  initialState: ActiveListInitialState,
  overrides: Partial<ActiveListDataAdapter> = {},
): ActiveListDataAdapter {
  let state = initialState;
  let nextItem = initialState.items.length + 1;

  return {
    syncAuthorized: true,
    async load() {
      return state;
    },
    async addItem(name) {
      const item = { id: `test-item-${nextItem}`, name, checked: false, checkedByMemberName: null };
      nextItem += 1;
      state = { ...state, items: [...state.items, item] };
      return item;
    },
    async setItemChecked(itemId, checked) {
      state = {
        ...state,
        items: state.items.map((item) =>
          item.id === itemId
            ? { ...item, checked, checkedByMemberName: checked ? "Avery Chen" : null }
            : item,
        ),
      };
    },
    async pull() {
      state = {
        ...state,
        items: [
          ...state.items,
          { id: "test-item-remote", name: "Remote Apples", checked: false, checkedByMemberName: null },
        ],
      };
      return { changed: true };
    },
    async sync() {
      return { changed: false };
    },
    async close() {},
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}
