# UI Composition

Use this standard for native-feeling UI composition details that cross normal React component boundaries, especially when React Native content is hosted inside a native sheet container.

## Bottom Sheets

- **Must** use the app-owned bottom-sheet primitive in `src/client/ui/bottom-sheet.tsx`. A second ad-hoc sheet forfeits the single swap point the primitive provides.
- **Must** treat Expo UI bottom sheets as native container boundaries, not just React Native `View` trees: Expo UI owns presentation and height while `RNHostView` hosts app-owned content.
- **Must** keep `RNHostView` inside the app-owned primitive. Feature code supplies React Native content without depending on Expo UI's host bridge.
- **Must** give a sheet's row-list `ScrollView` `flex: 1` and `nestedScrollEnabled` so it fills a bounded snap point and scrolls before the sheet itself expands or dismisses.
- **Should** omit `snapPoints` for short content that should fit itself.
- **Should** use `"half"`, `"full"`, or both for standard sheets. Fixed and fractional snap points are available for intentional iOS-only layouts.

Usage:

```tsx
import { BottomSheet } from "@/client/ui/bottom-sheet";

<BottomSheet
	isPresented={isPresented}
	onIsPresentedChange={setIsPresented}
	snapPoints={["half", "full"]}
	title="Choose a List"
>
	<ScrollView nestedScrollEnabled style={styles.sheetList}>
		{children}
	</ScrollView>
</BottomSheet>
```

The primitive's contract: the native container stays mounted and receives controlled presentation changes. Its latest children remain mounted through a dismissal animation, then unmount when the native dismissal fires `onIsPresentedChange(false)`. Owner components may rely on unmount-after-close to reset per-open state.

On iPad, React Native Storybook renders its desktop sidebar beside the story preview inside one application window. Expo UI presents the native sheet over that window, so the sheet remains centered over the full window and may overlap the Storybook sidebar. This is Storybook host behavior, not production sheet positioning; do not compensate for it in the primitive.

Before finishing bottom-sheet work, verify on the simulator:

- Row lists scroll with more content than the smallest snap point can show.
- The sheet moves between every configured snap point.
- Swipe-down dismisses the sheet and the owner's state resets on reopen.
- Headers remain visible while content scrolls, with and without a header action.
- Every mode rendered inside the sheet opens and submits.
