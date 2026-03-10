import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Encrypted Token Storage Service
 * 
 * IMPORTANT: This currently uses AsyncStorage for compatibility.
 * For production, install and use react-native-encrypted-storage:
 * 
 * Installation:
 * npm install react-native-encrypted-storage
 * npx expo prebuild --clean
 * 
 * Then replace the imports below with:
 * import EncryptedStorage from 'react-native-encrypted-storage';
 */

const ACCESS_TOKEN_KEY = '@hostel_manager:access_token';
const REFRESH_TOKEN_KEY = '@hostel_manager:refresh_token';
const TOKEN_EXPIRY_KEY = '@hostel_manager:token_expiry';
const DEVICE_ID_KEY = '@hostel_manager:device_id_token';

/**
 * Encrypted storage wrapper
 * Currently uses AsyncStorage, should be upgraded to EncryptedStorage for production
 */
const storage = AsyncStorage; // TODO: Replace with EncryptedStorage after npm install

export const encryptedTokenStorage = {
  /**
   * Store access token securely
   */
  async setAccessToken(token: string): Promise<void> {
    try {
      await storage.setItem(ACCESS_TOKEN_KEY, token);
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
      return await storage.getItem(ACCESS_TOKEN_KEY);
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
      await storage.setItem(REFRESH_TOKEN_KEY, token);
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
      return await storage.getItem(REFRESH_TOKEN_KEY);
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
      await storage.setItem(TOKEN_EXPIRY_KEY, expiresAt.toString());
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
      const expiry = await storage.getItem(TOKEN_EXPIRY_KEY);
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
      await storage.setItem(DEVICE_ID_KEY, deviceId);
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
      return await storage.getItem(DEVICE_ID_KEY);
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
        storage.removeItem(ACCESS_TOKEN_KEY),
        storage.removeItem(REFRESH_TOKEN_KEY),
        storage.removeItem(TOKEN_EXPIRY_KEY),
        storage.removeItem(DEVICE_ID_KEY),
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

/**
 * NOTE: To upgrade to encrypted storage:
 * 
 * 1. Install dependency:
 *    npm install react-native-encrypted-storage
 *    npx expo prebuild --clean
 * 
 * 2. Replace the `storage` variable above with:
 *    import EncryptedStorage from 'react-native-encrypted-storage';
 *    const storage = EncryptedStorage;
 * 
 * 3. Update method signatures if needed (EncryptedStorage is async by default)
 * 
 * This will automatically encrypt all tokens on the device using:
 * - iOS: Keychain
 * - Android: Keystore
 */
