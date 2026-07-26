import {
	pageControlWindow,
	pageIndexAtX,
	pageWindowStart,
} from "./home-list-toolbar";

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

/** The most dots the strip shows before it starts windowing the Lists. */
const MAX_DOTS = 10;
/** Distance to the first dot slot without chevron gutters, and with them. */
const EDGE_SLOP = 8;
const WINDOWED_INSET = 20;

describe("pageIndexAtX", () => {
	it("reads one List per dot slot across the control", () => {
		expect(pageIndexAtX(10, 0, 3, EDGE_SLOP)).toBe(0);
		expect(pageIndexAtX(30, 0, 3, EDGE_SLOP)).toBe(1);
		expect(pageIndexAtX(46, 0, 3, EDGE_SLOP)).toBe(2);
	});

	it("switches Lists at the boundary between two dot slots", () => {
		expect(pageIndexAtX(23, 0, 3, EDGE_SLOP)).toBe(0);
		expect(pageIndexAtX(24, 0, 3, EDGE_SLOP)).toBe(1);
	});

	it("parks a drag that runs off either end on the end List", () => {
		expect(pageIndexAtX(-120, 0, 3, EDGE_SLOP)).toBe(0);
		expect(pageIndexAtX(0, 0, 3, EDGE_SLOP)).toBe(0);
		expect(pageIndexAtX(120, 0, 3, EDGE_SLOP)).toBe(2);
	});

	it("keeps a single List in range", () => {
		expect(pageIndexAtX(40, 0, 1, EDGE_SLOP)).toBe(0);
	});

	it("reads the window's own Lists, not the Lists the strip starts with", () => {
		// A window over Lists 6 through 15 of a longer run: the first dot past the
		// left chevron gutter is List 6, and each slot after it is the next List.
		expect(pageIndexAtX(WINDOWED_INSET + 4, 5, MAX_DOTS, WINDOWED_INSET)).toBe(
			5,
		);
		expect(pageIndexAtX(WINDOWED_INSET + 20, 5, MAX_DOTS, WINDOWED_INSET)).toBe(
			6,
		);
		expect(
			pageIndexAtX(WINDOWED_INSET + 16 * 9, 5, MAX_DOTS, WINDOWED_INSET),
		).toBe(14);
	});

	it("clamps a windowed drag to the window it started on", () => {
		expect(pageIndexAtX(0, 5, MAX_DOTS, WINDOWED_INSET)).toBe(5);
		expect(pageIndexAtX(400, 5, MAX_DOTS, WINDOWED_INSET)).toBe(14);
	});
});

describe("pageWindowStart", () => {
	it("shows every List at once while they fit the strip", () => {
		for (const focusedIndex of [0, 4, MAX_DOTS - 1]) {
			expect(pageWindowStart(focusedIndex, MAX_DOTS)).toBe(0);
		}
	});

	it("centres the window on the focused List", () => {
		expect(pageWindowStart(5, 30)).toBe(1);
		expect(pageWindowStart(14, 30)).toBe(10);
	});

	it("holds the window inside the Lists at either end", () => {
		expect(pageWindowStart(0, 30)).toBe(0);
		expect(pageWindowStart(3, 30)).toBe(0);
		expect(pageWindowStart(26, 30)).toBe(20);
		expect(pageWindowStart(29, 30)).toBe(20);
	});
});

describe("pageControlWindow", () => {
	it("keeps Weather's proportions while every List has a dot", () => {
		expect(pageControlWindow(0, 3)).toEqual({
			start: 0,
			size: 3,
			width: 64,
			leadingInset: EDGE_SLOP,
			overflowsBefore: false,
			overflowsAfter: false,
		});
		expect(pageControlWindow(0, MAX_DOTS)).toEqual({
			start: 0,
			size: MAX_DOTS,
			width: 176,
			leadingInset: EDGE_SLOP,
			overflowsBefore: false,
			overflowsAfter: false,
		});
	});

	it("windows the Lists past the dots the strip can hold", () => {
		const pageWindow = pageControlWindow(pageWindowStart(14, 30), 30);

		expect(pageWindow.start).toBe(10);
		expect(pageWindow.size).toBe(MAX_DOTS);
		// The gutters hold the chevrons, so the dots start further in than they do
		// on a strip that shows every List.
		expect(pageWindow.leadingInset).toBe(WINDOWED_INSET);
	});

	it("holds the strip inside the width the toolbar can host", () => {
		for (const pageCount of [1, MAX_DOTS, MAX_DOTS + 1, 30, 500]) {
			expect(
				pageControlWindow(pageWindowStart(0, pageCount), pageCount).width,
			).toBeLessThanOrEqual(200);
		}
	});

	it("points a chevron at the Lists on whichever side the window leaves out", () => {
		const atStart = pageControlWindow(pageWindowStart(0, 30), 30);
		const inMiddle = pageControlWindow(pageWindowStart(14, 30), 30);
		const atEnd = pageControlWindow(pageWindowStart(29, 30), 30);
		const allVisible = pageControlWindow(pageWindowStart(2, 6), 6);

		expect([atStart.overflowsBefore, atStart.overflowsAfter]).toEqual([
			false,
			true,
		]);
		expect([inMiddle.overflowsBefore, inMiddle.overflowsAfter]).toEqual([
			true,
			true,
		]);
		expect([atEnd.overflowsBefore, atEnd.overflowsAfter]).toEqual([
			true,
			false,
		]);
		expect([allVisible.overflowsBefore, allVisible.overflowsAfter]).toEqual([
			false,
			false,
		]);
	});
});
