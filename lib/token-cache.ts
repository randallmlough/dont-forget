import type { TokenCache } from "@clerk/clerk-expo";
import * as SecureStore from "expo-secure-store";

import { logger } from "./logger";

const isWeb = process.env.EXPO_OS === "web";

export const tokenCache: TokenCache = {
  async getToken(key) {
    if (isWeb) return null;
    try {
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      logger.warn("token cache read failed", { key, error });
      return null;
    }
  },
  async saveToken(key, value) {
    if (isWeb) return;
    await SecureStore.setItemAsync(key, value);
  },
};
