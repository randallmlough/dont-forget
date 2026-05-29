import type { PropsWithChildren } from "react";
import { View } from "react-native";
import { activeListStyles as styles } from "./styles";

export function ActiveListScreen({ children }: PropsWithChildren) {
	return <View style={styles.screen}>{children}</View>;
}
