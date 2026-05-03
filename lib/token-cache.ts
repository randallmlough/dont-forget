import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

type TokenCache = {
  getToken: (key: string) => Promise<string | undefined | null>;
  saveToken: (key: string, value: string) => Promise<void>;
};

export const tokenCache: TokenCache = {
  async getToken(key) {
    if (Platform.OS === "web") return null;
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      await SecureStore.deleteItemAsync(key);
      return null;
    }
  },
  async saveToken(key, value) {
    if (Platform.OS === "web") return;
    await SecureStore.setItemAsync(key, value);
  },
};
