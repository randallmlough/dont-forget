import { render } from "@testing-library/react-native";

import { Skelton } from "./skelton";

it("renders a hidden loading placeholder with caller-owned dimensions", async () => {
	const result = await render(
		<Skelton style={{ height: 24, width: 160 }} testID="skelton" />,
	);

	const skelton = result.getByTestId("skelton", {
		includeHiddenElements: true,
	});
	expect(skelton).toHaveStyle({ height: 24, width: 160 });
	expect(skelton.props.accessibilityElementsHidden).toBe(true);
	expect(skelton.props.accessible).toBe(false);
});
