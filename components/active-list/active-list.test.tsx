import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { ActiveList, type ActiveListInitialState } from "@/components/active-list";

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
    fireEvent.press(screen.getByText("Add"));

    const milk = await screen.findByRole("checkbox", { name: "Milk" });
    expect(milk.props.accessibilityState).toEqual({ checked: false });
    expect(screen.getByText("0 of 1 Items checked")).toBeTruthy();
    expect(screen.queryByText("This List is empty.")).toBeNull();
    expect(input.props.value).toBe("");

    fireEvent.press(milk);

    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: "Milk" }).props.accessibilityState).toEqual({
        checked: true,
      });
    });
    expect(screen.getByText("1 of 1 Items checked")).toBeTruthy();
    expect(screen.getByText("Checked by Avery Chen")).toBeTruthy();
  });
});

function renderActiveList(initialState: ActiveListInitialState) {
  return render(
    <ActiveList.Provider initialState={initialState} currentMemberName="Avery Chen">
      <ActiveList.Screen>
        <ActiveList.Header />
        <ActiveList.Items />
        <ActiveList.AddItemForm />
      </ActiveList.Screen>
    </ActiveList.Provider>,
  );
}
