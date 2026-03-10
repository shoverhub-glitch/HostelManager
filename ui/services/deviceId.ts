import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateSecureRandomString } from '@/utils/crypto';
import * as Device from 'expo-device';

const DEVICE_ID_KEY = '@hostel_manager:device_id';
const DEVICE_NAME_KEY = '@hostel_manager:device_name';

/**
 * Device ID service for identifying unique devices
 * Used for session tracking and multi-device management
 */
export const deviceIdService = {
  /**
   * Generate or retrieve existing device ID
   * Device ID is persistent across app restarts
   */
  async getOrCreateDeviceId(): Promise<string> {
    try {
      // Try to get existing device ID
      let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
      
      if (!deviceId) {
        // Generate new device ID if doesn't exist
        // Format: hostel-<timestamp>-<random>-<model>
        const timestamp = Date.now().toString(36);
        const random = generateSecureRandomString(12);
        const model = (Device.modelName || 'unknown').replace(/\s+/g, '-').toLowerCase();
        
        deviceId = `hostel-${timestamp}-${random}-${model}`;
        await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
      }
      
      return deviceId;
    } catch (error) {
      console.error('Failed to get/create device ID:', error);
      // Fallback: generate temporary device ID
      return `hostel-temp-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    }
  },

  /**
   * Get device name (friendly name for display)
   */
  async getDeviceName(): Promise<string> {
    try {
      let deviceName = await AsyncStorage.getItem(DEVICE_NAME_KEY);
      
      if (!deviceName) {
        // Generate default device name
        const model = Device.modelName || 'Device';
        const brand = Device.brand || 'Unknown';
        deviceName = `${brand} ${model}`;
        
        await AsyncStorage.setItem(DEVICE_NAME_KEY, deviceName);
      }
      
      return deviceName;
    } catch (error) {
      return 'Unknown Device';
    }
  },

  /**
   * Set custom device name
   */
  async setDeviceName(name: string): Promise<void> {
    try {
      await AsyncStorage.setItem(DEVICE_NAME_KEY, name);
    } catch (error) {
      console.error('Failed to set device name:', error);
    }
  },

  /**
   * Clear device ID (on logout or factory reset)
   */
  async clearDeviceId(): Promise<void> {
    try {
      await Promise.all([
        AsyncStorage.removeItem(DEVICE_ID_KEY),
        AsyncStorage.removeItem(DEVICE_NAME_KEY),
      ]);
    } catch (error) {
      console.error('Failed to clear device ID:', error);
    }
  },
};
