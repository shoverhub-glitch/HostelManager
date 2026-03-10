import AsyncStorage from '@react-native-async-storage/async-storage';

const ACCESS_TOKEN_KEY = '@hostel_manager:access_token';
const REFRESH_TOKEN_KEY = '@hostel_manager:refresh_token';
const TOKEN_EXPIRY_KEY = '@hostel_manager:token_expiry';

export const tokenStorage = {
  async setAccessToken(token: string): Promise<void> {
    try {
      await AsyncStorage.setItem(ACCESS_TOKEN_KEY, token);
    } catch (error) {
      throw error;
    }
  },

  async getAccessToken(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
    } catch (error) {
      return null;
    }
  },

  async setRefreshToken(token: string): Promise<void> {
    try {
      await AsyncStorage.setItem(REFRESH_TOKEN_KEY, token);
    } catch (error) {
      throw error;
    }
  },

  async getRefreshToken(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(REFRESH_TOKEN_KEY);
    } catch (error) {
      return null;
    }
  },

  async setTokenExpiry(expiresAt: number): Promise<void> {
    try {
      await AsyncStorage.setItem(TOKEN_EXPIRY_KEY, expiresAt.toString());
    } catch (error) {
      throw error;
    }
  },

  async getTokenExpiry(): Promise<number | null> {
    try {
      const expiry = await AsyncStorage.getItem(TOKEN_EXPIRY_KEY);
      return expiry ? parseInt(expiry, 10) : null;
    } catch (error) {
      return null;
    }
  },

  async clearTokens(): Promise<void> {
    try {
      await Promise.all([
        AsyncStorage.removeItem(ACCESS_TOKEN_KEY),
        AsyncStorage.removeItem(REFRESH_TOKEN_KEY),
        AsyncStorage.removeItem(TOKEN_EXPIRY_KEY),
      ]);
    } catch (error) {
      throw error;
    }
  },

  async isTokenValid(): Promise<boolean> {
    try {
      const expiry = await this.getTokenExpiry();
      if (!expiry) return false;
      return Date.now() < expiry;
    } catch (error) {
      return false;
    }
  },
};
