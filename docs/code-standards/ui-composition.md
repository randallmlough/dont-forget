# UI Composition

Use this standard for native-feeling UI composition details that cross normal React component boundaries, especially when React Native content is hosted inside native Expo UI containers.

## Bottom Sheets

- **Must** treat native bottom sheets as native container boundaries, not just React Native `View` trees.
- **Must** verify every bottom sheet in each supported detent, including half-height and full-height states, before approving visual changes.
- **Must** ensure the sheet's visible background fills the native sheet container at every detent.
- **Should** use native sheet modifiers to size and paint the sheet container when React Native content is hosted through `RNHostView`.
- **Avoid** relying only on an inner React Native `View` with `flex: 1` or `backgroundColor` to fill a native bottom sheet. In half-height detents, the React Native hosted view can measure to its content height while the native sheet remains taller, exposing the dimmed backdrop or an unpainted area near the bottom.

For `@expo/ui/swift-ui` bottom sheets with React Native content, apply the fill behavior at the SwiftUI modifier boundary:

```tsx
<BottomSheet isPresented={isPresented} onIsPresentedChange={setIsPresented}>
	<Group
		modifiers={[
			presentationDetents(["medium", "large"]),
			presentationDragIndicator("visible"),
			containerRelativeFrame({ axes: "vertical", alignment: "top" }),
			background(lightTheme.colors.background),
		]}
	>
		<RNHostView>
			<View style={styles.sheet}>{children}</View>
		</RNHostView>
	</Group>
</BottomSheet>
```

The important part is that `containerRelativeFrame` makes the SwiftUI sheet content occupy the sheet container, and `background` paints that native-sized frame. The inner React Native view may still use `flex: 1` and theme colors for its own layout, but it is not the only background source.

Before finishing bottom-sheet work:

- Test the medium detent.
- Test the large detent.
- Test every mode rendered inside the sheet, such as switcher, create, rename, and delete states.
- Check the bottom rounded area of the sheet for exposed dimmed backdrop or mismatched background.
