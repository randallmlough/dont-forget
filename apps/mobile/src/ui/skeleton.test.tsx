import { render } from "@testing-library/react-native";

import { Skeleton } from "./skeleton";

it("renders a hidden loading placeholder with caller-owned dimensions", async () => {
	const result = await render(
		<Skeleton style={{ height: 24, width: 160 }} testID="skeleton" />,
	);

	const skeleton = result.getByTestId("skeleton", {
		includeHiddenElements: true,
	});
	expect(skeleton).toHaveStyle({ height: 24, width: 160 });
	expect(skeleton.props.accessibilityElementsHidden).toBe(true);
	expect(skeleton.props.accessible).toBe(false);
});
