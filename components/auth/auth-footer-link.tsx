import { Link, type Href } from "expo-router";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export function AuthFooterLink({
  prompt,
  label,
  href,
}: {
  prompt: string;
  label: string;
  href: Href;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.text}>{prompt} </Text>
      <Link href={href} replace style={styles.link}>
        {label}
      </Link>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: theme.spacing(4),
  },
  text: {
    color: theme.colors.textMuted,
    fontSize: 15,
  },
  link: {
    color: theme.colors.link,
    fontSize: 15,
    fontWeight: "600",
  },
}));
