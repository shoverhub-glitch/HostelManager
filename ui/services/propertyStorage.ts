import AsyncStorage from '@react-native-async-storage/async-storage';

const SELECTED_PROPERTY_KEY = '@hostel_manager:selected_property_id';

export const propertyStorage = {
  async setSelectedPropertyId(propertyId: string): Promise<void> {
    try {
      await AsyncStorage.setItem(SELECTED_PROPERTY_KEY, propertyId);
    } catch (error) {
      console.error('Error storing selected property id:', error);
    }
  },

  async getSelectedPropertyId(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(SELECTED_PROPERTY_KEY);
    } catch (error) {
      console.error('Error reading selected property id:', error);
      return null;
    }
  },

  async clearSelectedPropertyId(): Promise<void> {
    try {
      await AsyncStorage.removeItem(SELECTED_PROPERTY_KEY);
    } catch (error) {
      console.error('Error clearing selected property id:', error);
    }
  },
};
