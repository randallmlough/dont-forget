import { TextInput, type TextInputProps } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export function AuthTextInput(props: TextInputProps) {
  const { theme } = useUnistyles();

  return (
    <TextInput
      placeholderTextColor={theme.colors.textSubtle}
      autoCapitalize="none"
      {...props}
      style={[styles.input, props.style]}
    />
  );
}

const styles = StyleSheet.create((theme) => ({
  input: {
    height: 48,
    borderRadius: theme.radii.control,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.authBorder,
    paddingHorizontal: theme.spacing(3.5),
    fontSize: 16,
    backgroundColor: theme.colors.authBackground,
    color: theme.colors.textStrong,
  },
}));
