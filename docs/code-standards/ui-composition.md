# UI Composition

Use this standard for native-feeling UI composition details that cross normal React component boundaries, especially when React Native content is hosted inside native Expo UI containers.

## Bottom Sheets

- **Must** treat native bottom sheets as native container boundaries, not just React Native `View` trees.
- **Must** verify every bottom sheet in each supported detent, including half-height and full-height states, before approving visual changes.
- **Must** ensure the sheet's visible background fills the native sheet container at every detent.
- **Must** use the app-owned bottom sheet primitive in `components/ui/bottom-sheet.tsx`.
- **Avoid** relying only on an inner React Native `View` with `flex: 1` or `backgroundColor` to fill a native bottom sheet. In half-height detents, the React Native hosted view can measure to its content height while the native sheet remains taller, exposing the dimmed backdrop or an unpainted area near the bottom.

For `@expo/ui/swift-ui` bottom sheets with React Native content, use the shared primitive:

```tsx
import { BottomSheet } from "@/components/ui/bottom-sheet";

<BottomSheet isPresented={isPresented} onIsPresentedChange={setIsPresented}>
	<View style={styles.sheet}>{children}</View>
</BottomSheet>
```

The primitive applies `containerRelativeFrame` so the SwiftUI sheet content occupies the sheet container, and `background` so the native-sized frame is painted. The inner React Native view may still use `flex: 1` and theme colors for its own layout, but it is not the only background source.

Before finishing bottom-sheet work:

- Test the medium detent.
- Test the large detent.
- Test every mode rendered inside the sheet, such as switcher, create, rename, and delete states.
- Check the bottom rounded area of the sheet for exposed dimmed backdrop or mismatched background.
