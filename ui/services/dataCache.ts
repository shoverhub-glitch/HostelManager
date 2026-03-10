import AsyncStorage from '@react-native-async-storage/async-storage';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

const CACHE_PREFIX = 'offline_cache:';
const DEFAULT_CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Offline data cache service using AsyncStorage
 * Automatically caches API responses for offline access
 */

export const dataCache = {
  /**
   * Save data to cache
   * @param key - Cache key
   * @param data - Data to cache
   * @param durationMs - Cache duration in milliseconds (default: 24 hours)
   */
  async set<T>(key: string, data: T, durationMs: number = DEFAULT_CACHE_DURATION_MS): Promise<void> {
    try {
      const cacheEntry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        expiresAt: Date.now() + durationMs,
      };
      await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(cacheEntry));
    } catch (error) {
      console.warn(`Failed to cache data for key "${key}":`, error);
    }
  },

  /**
   * Get data from cache if it exists and hasn't expired
   * @param key - Cache key
   * @returns Cached data or null if not found or expired
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const cached = await AsyncStorage.getItem(CACHE_PREFIX + key);
      if (!cached) return null;

      const cacheEntry: CacheEntry<T> = JSON.parse(cached);

      // Check if cache has expired
      if (Date.now() > cacheEntry.expiresAt) {
        await AsyncStorage.removeItem(CACHE_PREFIX + key);
        return null;
      }

      return cacheEntry.data;
    } catch (error) {
      console.warn(`Failed to retrieve cache for key "${key}":`, error);
      return null;
    }
  },

  /**
   * Get full cache entry metadata (used for stale/fresh strategies)
   */
  async getEntry<T>(key: string): Promise<CacheEntry<T> | null> {
    try {
      const cached = await AsyncStorage.getItem(CACHE_PREFIX + key);
      if (!cached) return null;

      const cacheEntry: CacheEntry<T> = JSON.parse(cached);

      // Check if cache has expired
      if (Date.now() > cacheEntry.expiresAt) {
        await AsyncStorage.removeItem(CACHE_PREFIX + key);
        return null;
      }

      return cacheEntry;
    } catch (error) {
      console.warn(`Failed to retrieve cache entry for key "${key}":`, error);
      return null;
    }
  },

  /**
   * Remove specific cache entry
   */
  async remove(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(CACHE_PREFIX + key);
    } catch (error) {
      console.warn(`Failed to remove cache for key "${key}":`, error);
    }
  },

  /**
   * Clear all cached data
   */
  async clear(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter((key) => key.startsWith(CACHE_PREFIX));
      await AsyncStorage.multiRemove(cacheKeys);
    } catch (error) {
      console.warn('Failed to clear cache:', error);
    }
  },

  /**
   * Remove all cache entries matching a key prefix
   */
  async removeByPrefix(prefix: string): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const matchedKeys = keys.filter((key) => key.startsWith(CACHE_PREFIX + prefix));
      if (matchedKeys.length > 0) {
        await AsyncStorage.multiRemove(matchedKeys);
      }
    } catch (error) {
      console.warn(`Failed to remove cache by prefix "${prefix}":`, error);
    }
  },

  /**
   * Get cache info (for debugging)
   */
  async getInfo(): Promise<{ size: number; keys: string[] }> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter((key) => key.startsWith(CACHE_PREFIX));
      let size = 0;

      for (const key of cacheKeys) {
        const item = await AsyncStorage.getItem(key);
        if (item) size += item.length;
      }

      return {
        size,
        keys: cacheKeys.map((k) => k.replace(CACHE_PREFIX, '')),
      };
    } catch (error) {
      console.warn('Failed to get cache info:', error);
      return { size: 0, keys: [] };
    }
  },
};
