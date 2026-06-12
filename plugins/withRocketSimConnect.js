const {
	CodeGenerator,
	withAppDelegate,
	WarningAggregator,
} = require("expo/config-plugins");

const { mergeContents } = CodeGenerator;

const objcDefinition = `@interface RocketSimLoader : NSObject

- (void)loadRocketSimConnect;

@end

@implementation RocketSimLoader

- (void)loadRocketSimConnect {
#if DEBUG
  NSString *frameworkPath = @"/Applications/RocketSim.app/Contents/Frameworks/RocketSimConnectLinker.nocache.framework";
  NSBundle *frameworkBundle = [NSBundle bundleWithPath:frameworkPath];
  NSError *error = nil;

  if (![frameworkBundle loadAndReturnError:&error]) {
    NSLog(@"Failed to load linker framework: %@", error);
    return;
  }

  NSLog(@"RocketSim Connect successfully linked");
#endif
}

@end`;

const objcInvocation = `RocketSimLoader *loader = [[RocketSimLoader alloc] init];
  [loader loadRocketSimConnect];`;

const swiftDefinition = `class RocketSimLoader {
    func loadRocketSimConnect() {
        #if DEBUG
        let frameworkPath = "/Applications/RocketSim.app/Contents/Frameworks/RocketSimConnectLinker.nocache.framework"
        guard let frameworkBundle = Bundle(path: frameworkPath) else {
            print("Failed to find RocketSim framework")
            return
        }

        do {
            try frameworkBundle.loadAndReturnError()
            print("RocketSim Connect successfully linked")
        } catch {
            print("Failed to load linker framework: \\(error)")
        }
        #endif
    }
}`;

const swiftInvocation = `    let loader = RocketSimLoader()
    loader.loadRocketSimConnect()`;

const objcMethodMatcher =
	/-\s*\(BOOL\)\s*application:\s*\(UIApplication\s*\*\s*\)\s*\w+\s+didFinishLaunchingWithOptions:/;
const swiftDefinitionAnchor = /^@main$/m;
const swiftInvocationAnchor = /^\s*let delegate = ReactNativeDelegate\(\)/m;

function modifyObjCAppDelegate(appDelegate) {
	let contents = appDelegate;

	if (!objcMethodMatcher.test(contents)) {
		WarningAggregator.addWarningIOS(
			"withRocketSimConnect",
			"Unable to determine correct insertion point in Objective-C AppDelegate.",
		);
		return contents;
	}

	if (!contents.includes(objcDefinition)) {
		contents = mergeContents({
			src: contents,
			anchor: objcMethodMatcher,
			newSrc: objcDefinition,
			offset: -2,
			tag: "withRocketSimConnect - definition",
			comment: "//",
		}).contents;
	}

	if (!contents.includes(objcInvocation)) {
		contents = mergeContents({
			src: contents,
			anchor: objcMethodMatcher,
			newSrc: objcInvocation,
			offset: 2,
			tag: "withRocketSimConnect - didFinishLaunchingWithOptions",
			comment: "//",
		}).contents;
	}

	return contents;
}

function modifySwiftAppDelegate(appDelegate) {
	let contents = appDelegate;

	if (!swiftDefinitionAnchor.test(contents)) {
		WarningAggregator.addWarningIOS(
			"withRocketSimConnect",
			"Unable to determine correct insertion point for RocketSimLoader in Swift AppDelegate.",
		);
		return contents;
	}

	if (!swiftInvocationAnchor.test(contents)) {
		WarningAggregator.addWarningIOS(
			"withRocketSimConnect",
			"Unable to determine correct insertion point in Swift AppDelegate didFinishLaunchingWithOptions.",
		);
		return contents;
	}

	if (!contents.includes("class RocketSimLoader")) {
		contents = mergeContents({
			src: contents,
			anchor: swiftDefinitionAnchor,
			newSrc: swiftDefinition,
			offset: 0,
			tag: "withRocketSimConnect - swift definition",
			comment: "//",
		}).contents;
	}

	if (!contents.includes("loader.loadRocketSimConnect()")) {
		contents = mergeContents({
			src: contents,
			anchor: swiftInvocationAnchor,
			newSrc: swiftInvocation,
			offset: 0,
			tag: "withRocketSimConnect - swift didFinishLaunchingWithOptions",
			comment: "//",
		}).contents;
	}

	return contents;
}

const withRocketSimConnect = (config) => {
	return withAppDelegate(config, (config) => {
		if (
			config.modResults.language === "objc" ||
			config.modResults.language === "objcpp"
		) {
			config.modResults.contents = modifyObjCAppDelegate(
				config.modResults.contents,
			);
		} else if (config.modResults.language === "swift") {
			config.modResults.contents = modifySwiftAppDelegate(
				config.modResults.contents,
			);
		} else {
			WarningAggregator.addWarningIOS(
				"withRocketSimConnect",
				`Unsupported AppDelegate language: ${config.modResults.language}`,
			);
		}
		return config;
	});
};

module.exports = withRocketSimConnect;
