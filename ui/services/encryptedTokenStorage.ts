import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const ACCESS_TOKEN_KEY = '@hostel_manager:access_token';
const REFRESH_TOKEN_KEY = '@hostel_manager:refresh_token';
const TOKEN_EXPIRY_KEY = '@hostel_manager:token_expiry';
const DEVICE_ID_KEY = '@hostel_manager:device_id_token';
const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainService: 'hostel_manager_auth',
};

const USE_SECURE_STORE = Platform.OS !== 'web';

async function secureSetItem(key: string, value: string): Promise<void> {
  if (USE_SECURE_STORE) {
    try {
      await SecureStore.setItemAsync(key, value, SECURE_STORE_OPTIONS);
      return;
    } catch {
      // Fallback to AsyncStorage when secure storage is unavailable.
    }
  }
  await AsyncStorage.setItem(key, value);
}

async function secureGetItem(key: string): Promise<string | null> {
  if (USE_SECURE_STORE) {
    try {
      const secureValue = await SecureStore.getItemAsync(key, SECURE_STORE_OPTIONS);
      if (secureValue !== null) {
        return secureValue;
      }
    } catch {
      // Fall through to legacy fallback.
    }
  }

  // Legacy fallback and migration from AsyncStorage.
  const legacyValue = await AsyncStorage.getItem(key);
  if (legacyValue !== null) {
    await secureSetItem(key, legacyValue);
    await AsyncStorage.removeItem(key);
  }
  return legacyValue;
}

async function secureRemoveItem(key: string): Promise<void> {
  if (USE_SECURE_STORE) {
    try {
      await SecureStore.deleteItemAsync(key, SECURE_STORE_OPTIONS);
    } catch {
      // Continue to AsyncStorage cleanup.
    }
  }
  await AsyncStorage.removeItem(key);
}

export const encryptedTokenStorage = {
  /**
   * Store access token securely
   */
  async setAccessToken(token: string): Promise<void> {
    try {
      await secureSetItem(ACCESS_TOKEN_KEY, token);
    } catch (error) {
      console.error('Failed to store access token:', error);
      throw error;
    }
  },

  /**
   * Retrieve access token
   */
  async getAccessToken(): Promise<string | null> {
    try {
      return await secureGetItem(ACCESS_TOKEN_KEY);
    } catch (error) {
      console.error('Failed to retrieve access token:', error);
      return null;
    }
  },

  /**
   * Store refresh token securely
   * CRITICAL: This token grants long-term access. Must be encrypted in production.
   */
  async setRefreshToken(token: string): Promise<void> {
    try {
      await secureSetItem(REFRESH_TOKEN_KEY, token);
    } catch (error) {
      console.error('Failed to store refresh token:', error);
      throw error;
    }
  },

  /**
   * Retrieve refresh token
   */
  async getRefreshToken(): Promise<string | null> {
    try {
      return await secureGetItem(REFRESH_TOKEN_KEY);
    } catch (error) {
      console.error('Failed to retrieve refresh token:', error);
      return null;
    }
  },

  /**
   * Store token expiry timestamp
   */
  async setTokenExpiry(expiresAt: number): Promise<void> {
    try {
      await secureSetItem(TOKEN_EXPIRY_KEY, expiresAt.toString());
    } catch (error) {
      console.error('Failed to store token expiry:', error);
      throw error;
    }
  },

  /**
   * Retrieve token expiry timestamp
   */
  async getTokenExpiry(): Promise<number | null> {
    try {
      const expiry = await secureGetItem(TOKEN_EXPIRY_KEY);
      return expiry ? parseInt(expiry, 10) : null;
    } catch (error) {
      console.error('Failed to retrieve token expiry:', error);
      return null;
    }
  },

  /**
   * Store device ID associated with current tokens
   * Used to prevent token usage on unauthorized devices
   */
  async setDeviceIdForTokens(deviceId: string): Promise<void> {
    try {
      await secureSetItem(DEVICE_ID_KEY, deviceId);
    } catch (error) {
      console.error('Failed to store device ID:', error);
      throw error;
    }
  },

  /**
   * Retrieve device ID associated with tokens
   */
  async getDeviceIdForTokens(): Promise<string | null> {
    try {
      return await secureGetItem(DEVICE_ID_KEY);
    } catch (error) {
      console.error('Failed to retrieve device ID:', error);
      return null;
    }
  },

  /**
   * Clear all tokens immediately
   * Called on logout or when tokens are compromised
   */
  async clearTokens(): Promise<void> {
    try {
      await Promise.all([
        secureRemoveItem(ACCESS_TOKEN_KEY),
        secureRemoveItem(REFRESH_TOKEN_KEY),
        secureRemoveItem(TOKEN_EXPIRY_KEY),
        secureRemoveItem(DEVICE_ID_KEY),
      ]);
    } catch (error) {
      console.error('Failed to clear tokens:', error);
      throw error;
    }
  },

  /**
   * Check if token is still valid (not expired)
   */
  async isTokenValid(): Promise<boolean> {
    try {
      const expiry = await this.getTokenExpiry();
      if (!expiry) return false;
      // Add 10-second buffer to account for clock skew
      return Date.now() < (expiry - 10000);
    } catch (error) {
      return false;
    }
  },

  /**
   * Check if token is close to expiry (for proactive refresh)
   * Returns true if token expires in less than 5 minutes
   */
  async isTokenNearExpiry(): Promise<boolean> {
    try {
      const expiry = await this.getTokenExpiry();
      if (!expiry) return true;
      const timeUntilExpiry = expiry - Date.now();
      return timeUntilExpiry < 5 * 60 * 1000; // 5 minutes
    } catch (error) {
      return true;
    }
  },

  /**
   * Get time remaining until token expiry (in milliseconds)
   */
  async getTimeUntilExpiry(): Promise<number> {
    try {
      const expiry = await this.getTokenExpiry();
      if (!expiry) return 0;
      return Math.max(0, expiry - Date.now());
    } catch (error) {
      return 0;
    }
  },
};
