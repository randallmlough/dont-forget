import { buildAppEntryHref } from "./deep-link";

describe("buildAppEntryHref", () => {
	it.each([
		{
			name: "an Invitation path without a query",
			input: {
				scheme: "dontforget-test",
				path: "/invitations/accept",
				search: "",
			},
			expected: "dontforget-test://invitations/accept",
		},
		{
			name: "an Invitation path with an opaque encoded query",
			input: {
				scheme: "dontforget-staging",
				path: "/invitations/accept",
				search: "?token=a%2Fb%2Bc%3D&next=%252F",
			},
			expected:
				"dontforget-staging://invitations/accept?token=a%2Fb%2Bc%3D&next=%252F",
		},
		{
			name: "a Household Join Code path with an opaque encoded query",
			input: {
				scheme: "dontforget-local",
				path: "/households/join",
				search: "?code=A%2BB%2525&source=sms",
			},
			expected: "dontforget-local://households/join?code=A%2BB%2525&source=sms",
		},
		{
			name: "a production scheme",
			input: {
				scheme: "dontforget",
				path: "/households/join",
				search: "",
			},
			expected: "dontforget://households/join",
		},
	] as const)("composes $name", ({ input, expected }) => {
		expect(buildAppEntryHref(input)).toBe(expected);
	});
});
