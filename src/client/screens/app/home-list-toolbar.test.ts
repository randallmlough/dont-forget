import { pageControlGeometry, pageIndexAtX } from "./home-list-toolbar";

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

/** Weather's slot, which every List gets while the strip still fits. */
const WEATHER_SLOT_WIDTH = 16;
/** The widest strip the toolbar can host between its two buttons. */
const MAX_WIDTH = 208;
/** The most Lists that fit at Weather's proportions. */
const UNCOMPRESSED_COUNT = 12;

describe("pageIndexAtX", () => {
	it("reads one List per dot slot across the control", () => {
		expect(pageIndexAtX(10, WEATHER_SLOT_WIDTH, 3)).toBe(0);
		expect(pageIndexAtX(30, WEATHER_SLOT_WIDTH, 3)).toBe(1);
		expect(pageIndexAtX(46, WEATHER_SLOT_WIDTH, 3)).toBe(2);
	});

	it("switches Lists at the boundary between two dot slots", () => {
		expect(pageIndexAtX(23, WEATHER_SLOT_WIDTH, 3)).toBe(0);
		expect(pageIndexAtX(24, WEATHER_SLOT_WIDTH, 3)).toBe(1);
	});

	it("parks a drag that runs off either end on the end List", () => {
		expect(pageIndexAtX(-120, WEATHER_SLOT_WIDTH, 3)).toBe(0);
		expect(pageIndexAtX(0, WEATHER_SLOT_WIDTH, 3)).toBe(0);
		expect(pageIndexAtX(120, WEATHER_SLOT_WIDTH, 3)).toBe(2);
	});

	it("keeps a single List in range", () => {
		expect(pageIndexAtX(40, WEATHER_SLOT_WIDTH, 1)).toBe(0);
	});

	it("reaches every List of a compressed strip, including the last", () => {
		const { slotWidth } = pageControlGeometry(32);

		// The last List owns the slot that starts 31 slots in, so it is reachable
		// without running off the end. Reading the strip at Weather's slot width
		// instead would strand it: that same touch would land on List 12.
		expect(pageIndexAtX(8 + slotWidth * 31, slotWidth, 32)).toBe(31);
		expect(pageIndexAtX(8 + slotWidth * 31, WEATHER_SLOT_WIDTH, 32)).toBe(11);
		expect(pageIndexAtX(8, slotWidth, 32)).toBe(0);
		expect(pageIndexAtX(MAX_WIDTH, slotWidth, 32)).toBe(31);
	});

	it("still switches one List per slot once the slots compress", () => {
		const { slotWidth } = pageControlGeometry(32);

		expect(pageIndexAtX(8 + slotWidth * 31 - 1, slotWidth, 32)).toBe(30);
		expect(pageIndexAtX(8 + slotWidth * 31, slotWidth, 32)).toBe(31);
	});
});

describe("pageControlGeometry", () => {
	it("keeps Weather's proportions while the Lists fit the toolbar", () => {
		expect(pageControlGeometry(3)).toEqual({
			width: 64,
			slotWidth: WEATHER_SLOT_WIDTH,
			dotSize: 7,
		});
		expect(pageControlGeometry(UNCOMPRESSED_COUNT)).toEqual({
			width: MAX_WIDTH,
			slotWidth: WEATHER_SLOT_WIDTH,
			dotSize: 7,
		});
	});

	it("holds the strip at the width the toolbar can host at any List count", () => {
		for (const pageCount of [UNCOMPRESSED_COUNT + 1, 30, 100, 500]) {
			expect(pageControlGeometry(pageCount).width).toBe(MAX_WIDTH);
		}
	});

	it("divides the bounded strip evenly between the Lists", () => {
		const { slotWidth } = pageControlGeometry(32);

		expect(slotWidth).toBe(6);
		expect(slotWidth * 32 + 16).toBe(MAX_WIDTH);
	});

	it("shrinks the dots with their slots so they never touch", () => {
		const compressed = pageControlGeometry(20);
		const floored = pageControlGeometry(32);

		expect(compressed.dotSize).toBeCloseTo(4.2);
		expect(compressed.dotSize).toBeLessThan(compressed.slotWidth);
		// Past the point where Weather's share stops being visible the dot holds
		// its floor, which still leaves a gap between neighbours.
		expect(floored.dotSize).toBe(4);
		expect(floored.dotSize).toBeLessThan(floored.slotWidth);
	});

	it("keeps the dots inside their slots at extreme List counts", () => {
		const geometry = pageControlGeometry(500);

		expect(geometry.dotSize).toBeGreaterThan(0);
		expect(geometry.dotSize).toBeLessThanOrEqual(geometry.slotWidth);
	});
});
