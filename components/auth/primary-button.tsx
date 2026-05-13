import { ActivityIndicator, Pressable, Text } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export function PrimaryButton({
  label,
  onPress,
  loading = false,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
}) {
  const { theme } = useUnistyles();

  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [styles.button, (pressed || loading) && styles.pressed]}>
      {loading ? (
        <ActivityIndicator color={theme.colors.inverseText} />
      ) : (
        <Text style={styles.label}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  button: {
    height: 52,
    borderRadius: theme.radii.control,
    borderCurve: "continuous",
    backgroundColor: theme.colors.authPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    color: theme.colors.inverseText,
    fontSize: 17,
    fontWeight: "600",
  },
}));
