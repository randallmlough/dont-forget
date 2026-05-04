import { Link, type Href } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

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

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 16,
  },
  text: {
    color: "#5f6368",
    fontSize: 15,
  },
  link: {
    color: "#1a73e8",
    fontSize: 15,
    fontWeight: "600",
  },
});
