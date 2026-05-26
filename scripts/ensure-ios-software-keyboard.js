#!/usr/bin/env node
const { execFileSync } = require("node:child_process");

if (process.platform !== "darwin") {
	process.exit(0);
}

try {
	execFileSync(
		"defaults",
		[
			"write",
			"com.apple.iphonesimulator",
			"ConnectHardwareKeyboard",
			"-bool",
			"false",
		],
		{ stdio: "pipe" },
	);
	console.log("iOS Simulator software keyboard enabled for text input focus.");
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	console.error(
		`Could not update iOS Simulator keyboard preference; aborting iOS launch. ${message}`,
	);
	process.exit(1);
}
