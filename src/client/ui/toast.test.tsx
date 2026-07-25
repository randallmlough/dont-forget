import { act, render, screen } from "@testing-library/react-native";

import { type Toast, Toaster, toast, toastsReducer } from "./toast";

// The safe-area insets come from a native module that is unavailable in Jest.
jest.mock("react-native-safe-area-context", () => ({
	useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

function createToast(id: string, overrides?: Partial<Toast>): Toast {
	return { id, title: `Toast ${id}`, open: true, ...overrides };
}

describe("toastsReducer", () => {
	it("keeps only the newest toasts when more than the limit are shown", () => {
		const state = ["1", "2", "3", "4"].reduce(
			(current, id) =>
				toastsReducer(current, {
					type: "toastShown",
					toast: createToast(id),
				}),
			{ toasts: [] as readonly Toast[] },
		);

		expect(state.toasts.map((item) => item.id)).toEqual(["4", "3", "2"]);
	});

	it("leaves every toast open when dismissing an id that is not on screen", () => {
		const shown = toastsReducer(
			{ toasts: [] },
			{ type: "toastShown", toast: createToast("1") },
		);

		const dismissed = toastsReducer(shown, {
			type: "toastDismissed",
			toastId: "does-not-exist",
		});

		expect(dismissed.toasts).toEqual([createToast("1")]);
	});

	it("closes every toast when dismissing without an id", () => {
		const state = toastsReducer(
			{ toasts: [createToast("1"), createToast("2")] },
			{ type: "toastDismissed" },
		);

		expect(state.toasts.map((item) => item.open)).toEqual([false, false]);
	});

	it("removes only the requested toast", () => {
		const state = toastsReducer(
			{ toasts: [createToast("1"), createToast("2")] },
			{ type: "toastRemoved", toastId: "1" },
		);

		expect(state.toasts.map((item) => item.id)).toEqual(["2"]);
	});
});

describe("Toaster", () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(async () => {
		// Drain the module-level store so the next test starts with no toasts.
		await act(() => {
			toast.dismiss();
			jest.runOnlyPendingTimers();
		});
		jest.useRealTimers();
	});

	it("renders only the newest toasts once the limit is exceeded", async () => {
		await render(<Toaster />);

		await act(() => {
			toast.success("Milk added");
			toast.success("Eggs added");
			toast.success("Bread added");
			toast.success("Coffee added");
		});

		expect(screen.getByText("Coffee added")).toBeTruthy();
		expect(screen.getByText("Bread added")).toBeTruthy();
		expect(screen.getByText("Eggs added")).toBeTruthy();
		expect(screen.queryByText("Milk added")).toBeNull();
	});

	it("auto-closes after its duration and reports the auto close", async () => {
		const onAutoClose = jest.fn();
		await render(<Toaster />);

		await act(() => {
			toast("Milk added", { duration: 1000, onAutoClose });
		});
		expect(screen.getByText("Milk added")).toBeTruthy();

		await act(() => {
			jest.advanceTimersByTime(1000);
		});
		expect(onAutoClose).toHaveBeenCalledTimes(1);

		// The card stays mounted while it fades out, then leaves the store.
		expect(screen.getByText("Milk added")).toBeTruthy();
		await act(() => {
			jest.runOnlyPendingTimers();
		});
		expect(screen.queryByText("Milk added")).toBeNull();
	});

	it("keeps a toast on screen when its duration is infinite", async () => {
		await render(<Toaster />);

		await act(() => {
			toast("Syncing Groceries", { duration: Number.POSITIVE_INFINITY });
		});

		await act(() => {
			jest.advanceTimersByTime(60_000);
		});

		expect(screen.getByText("Syncing Groceries")).toBeTruthy();
	});

	it("ignores a dismiss for an id that is not on screen", async () => {
		const onDismiss = jest.fn();
		await render(<Toaster />);

		await act(() => {
			toast("Milk added", {
				duration: Number.POSITIVE_INFINITY,
				onDismiss,
			});
		});

		await act(() => {
			toast.dismiss("does-not-exist");
			jest.runOnlyPendingTimers();
		});

		expect(onDismiss).not.toHaveBeenCalled();
		expect(screen.getByText("Milk added")).toBeTruthy();
	});

	it("dismisses every toast once, and does not report a second dismiss", async () => {
		const onDismiss = jest.fn();
		await render(<Toaster />);

		await act(() => {
			toast("Milk added", {
				duration: Number.POSITIVE_INFINITY,
				onDismiss,
			});
			toast("Eggs added", {
				duration: Number.POSITIVE_INFINITY,
				onDismiss,
			});
		});

		await act(() => {
			toast.dismiss();
			toast.dismiss();
		});
		expect(onDismiss).toHaveBeenCalledTimes(2);

		await act(() => {
			jest.runOnlyPendingTimers();
		});
		expect(screen.queryByText("Milk added")).toBeNull();
		expect(screen.queryByText("Eggs added")).toBeNull();
	});
});
