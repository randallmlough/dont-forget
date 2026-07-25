import { pageIndexAtX } from "./home-list-toolbar";

// The toolbar module reaches native navigation and native gesture recognition
// through `expo-router` and `react-native-gesture-handler`, neither of which
// loads under Jest. The page-control geometry under test here touches neither,
// so stubs are all that is needed to make the module importable. The rendered
// page control is covered against the real screen in `home-screen.test.tsx`.
// Justification per docs/code-standards/testing.md:7.
jest.mock("expo-router", () => ({ Stack: {} }));
jest.mock("react-native-gesture-handler", () =>
	jest.requireActual("@/test/mocks/gesture-handler"),
);

describe("pageIndexAtX", () => {
	it("reads one List per dot slot across the control", () => {
		expect(pageIndexAtX(10, 3)).toBe(0);
		expect(pageIndexAtX(30, 3)).toBe(1);
		expect(pageIndexAtX(46, 3)).toBe(2);
	});

	it("switches Lists at the boundary between two dot slots", () => {
		expect(pageIndexAtX(23, 3)).toBe(0);
		expect(pageIndexAtX(24, 3)).toBe(1);
	});

	it("parks a drag that runs off either end on the end List", () => {
		expect(pageIndexAtX(-120, 3)).toBe(0);
		expect(pageIndexAtX(0, 3)).toBe(0);
		expect(pageIndexAtX(120, 3)).toBe(2);
	});

	it("keeps a single List in range", () => {
		expect(pageIndexAtX(40, 1)).toBe(0);
	});
});
