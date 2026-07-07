# UI Composition

Use this standard for native-feeling UI composition details that cross normal React component boundaries, especially when React Native content is hosted inside a native sheet container.

## Bottom Sheets

- **Must** use the app-owned bottom-sheet primitive in `src/client/ui/bottom-sheet.tsx`. A second ad-hoc `Modal pageSheet` forfeits the single swap point the primitive exists to provide.
- **Must** treat native bottom sheets as native container boundaries, not just React Native `View` trees: the sheet container owns the height; the hosted content lays out within it.
- **Must** give a sheet's row-list `ScrollView` `flex: 1` so it fills the bounded `pageSheet` height and scrolls within it, instead of sizing to its content.
- **Avoid** adding height or detent props to the primitive. `pageSheet` provides one bounded native height today; detents return when the primitive's internals move to `@expo/ui/community/bottom-sheet` on the Expo SDK 56 upgrade (see the primitive's doc comment for the swap recipe).

Usage:

```tsx
import { BottomSheet } from "@/client/ui/bottom-sheet";

<BottomSheet isPresented={isPresented} onIsPresentedChange={setIsPresented}>
	<View style={styles.sheet}>{children}</View>
</BottomSheet>
```

The primitive's contract: children are mounted only while presented (`isPresented: false` renders nothing), and a native swipe-down fires `onIsPresentedChange(false)`. Owner components may rely on unmount-on-close to reset per-open state — the Home switcher's mode/rows do.

Before finishing bottom-sheet work, verify on the simulator:

- Row lists scroll with more content than one sheet height (13+ Lists for the Home switcher). This is the regression that killed the abandoned `@expo/ui` RNHostView shell — it is not optional.
- Swipe-down dismisses the sheet and the owner's state resets on reopen.
- Every mode rendered inside the sheet opens and submits, such as the Home switcher's switcher, create, rename, and delete states.

Detent checks (medium and large heights, backdrop painting at each detent) are suspended while the primitive sits on `Modal pageSheet`; they become applicable again with the SDK 56 swap.
