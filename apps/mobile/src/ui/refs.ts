import type { Ref } from "react";

/** Forwards a commit-time node to the consumer's callback or object ref. */
export function forwardRefValue<Node>(
	ref: Ref<Node> | undefined,
	node: Node | null,
) {
	if (typeof ref === "function") ref(node);
	else if (ref) ref.current = node;
}
