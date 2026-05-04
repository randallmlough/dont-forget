import { StyleSheet, TextInput, type TextInputProps } from "react-native";

export function AuthTextInput(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor="#9aa0a6"
      autoCapitalize="none"
      {...props}
      style={[styles.input, props.style]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#dadce0",
    paddingHorizontal: 14,
    fontSize: 16,
    backgroundColor: "#fff",
    color: "#1f1f1f",
  },
});
