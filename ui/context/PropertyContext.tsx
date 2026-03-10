import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { propertyService } from '@/services/apiClient';
import { useAuth } from '@/context/AuthContext';
import type { Property } from '@/services/apiTypes';
import { propertyStorage } from '@/services/propertyStorage';
import { clearScreenCache, cacheKeys, getScreenCache, setScreenCache } from '@/services/screenCache';

const PROPERTIES_CACHE_STALE_MS = 60 * 1000; // 1 minute

interface PropertyContextType {
  properties: Property[];
  selectedProperty: Property | null;
  selectedPropertyId: string | null;
  loading: boolean;
  switchProperty: (propertyId: string) => void;
  refreshProperties: () => Promise<void>;
}

const PropertyContext = createContext<PropertyContextType | undefined>(undefined);

export function PropertyProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  
  // Initialize synchronously with cached data to avoid loading flicker
  const { initialProperties, initialSelectedId } = (() => {
    const cacheKey = cacheKeys.properties();
    const cachedProperties = getScreenCache<Property[]>(cacheKey, PROPERTIES_CACHE_STALE_MS);
    const propertiesData = Array.isArray(cachedProperties) ? cachedProperties : [];
    
    let selectedId: string | null = null;
    if (propertiesData.length > 0) {
      // Use first property as default on initial mount
      // Will be validated/updated from persisted storage in useEffect
      selectedId = propertiesData[0].id;
    }
    
    return { initialProperties: propertiesData, initialSelectedId: selectedId };
  })();
  
  const [properties, setProperties] = useState<Property[]>(initialProperties);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(initialSelectedId);
  const [loading, setLoading] = useState(false);
  const isFetchingPropertiesRef = useRef(false);
  const hasInitializedRef = useRef(initialProperties.length > 0);

  const selectedProperty = properties.find(p => p.id === selectedPropertyId) || null;

  const fetchProperties = useCallback(async () => {
    if (isFetchingPropertiesRef.current) {
      return;
    }

    isFetchingPropertiesRef.current = true;

    // Check cache first
    const cacheKey = cacheKeys.properties();
    const cachedProperties = getScreenCache<Property[]>(cacheKey, PROPERTIES_CACHE_STALE_MS);
    
    if (cachedProperties) {
      const propertiesData = Array.isArray(cachedProperties) ? cachedProperties : [];
      setProperties(propertiesData);
      setLoading(false);
      isFetchingPropertiesRef.current = false;

      // Still validate/set selected property
      if (propertiesData.length > 0) {
        const persistedPropertyId = await propertyStorage.getSelectedPropertyId();
        const currentSelectedIsValid = selectedPropertyId
          ? propertiesData.some((p) => p.id === selectedPropertyId)
          : false;
        const persistedIsValid = persistedPropertyId
          ? propertiesData.some((p) => p.id === persistedPropertyId)
          : false;

        const nextSelectedPropertyId = currentSelectedIsValid
          ? selectedPropertyId!
          : persistedIsValid
            ? persistedPropertyId!
            : propertiesData[0].id;

        if (nextSelectedPropertyId !== selectedPropertyId) {
          setSelectedPropertyId(nextSelectedPropertyId);
          await propertyStorage.setSelectedPropertyId(nextSelectedPropertyId);
        }
      } else {
        setSelectedPropertyId(null);
        await propertyStorage.clearSelectedPropertyId();
      }
      return;
    }

    try {
      setLoading(true);
      const response = await propertyService.getProperties();
      const propertiesData = Array.isArray(response?.data) ? response.data : [];
      setProperties(propertiesData);
      
      // Cache the properties
      setScreenCache(cacheKey, propertiesData);

      if (propertiesData.length === 0) {
        setSelectedPropertyId(null);
        await propertyStorage.clearSelectedPropertyId();
        return;
      }

      const persistedPropertyId = await propertyStorage.getSelectedPropertyId();
      const currentSelectedIsValid = selectedPropertyId
        ? propertiesData.some((p) => p.id === selectedPropertyId)
        : false;
      const persistedIsValid = persistedPropertyId
        ? propertiesData.some((p) => p.id === persistedPropertyId)
        : false;

      const nextSelectedPropertyId = currentSelectedIsValid
        ? selectedPropertyId!
        : persistedIsValid
          ? persistedPropertyId!
          : propertiesData[0].id;

      setSelectedPropertyId(nextSelectedPropertyId);
      await propertyStorage.setSelectedPropertyId(nextSelectedPropertyId);
      // Removed prefetching - screens will lazy-load on focus
    } catch (error) {
      setProperties([]);
      setSelectedPropertyId(null);
      await propertyStorage.clearSelectedPropertyId();
    } finally {
      setLoading(false);
      isFetchingPropertiesRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      // If we have cached properties, just validate selectedPropertyId
      if (hasInitializedRef.current) {
        propertyStorage.getSelectedPropertyId().then((persistedPropertyId) => {
          if (persistedPropertyId && properties.some(p => p.id === persistedPropertyId)) {
            setSelectedPropertyId(persistedPropertyId);
            propertyStorage.setSelectedPropertyId(persistedPropertyId).catch(() => {});
          } else {
            // Current selectedPropertyId is already set correctly, just save it
            if (selectedPropertyId) {
              propertyStorage.setSelectedPropertyId(selectedPropertyId).catch(() => {});
            }
          }
        });
        hasInitializedRef.current = false; // Only do this once
      } else {
        fetchProperties();
      }
    } else {
      setProperties([]);
      setSelectedPropertyId(null);
      clearScreenCache();
      propertyStorage.clearSelectedPropertyId().catch(() => {
        // ignore storage errors
      });
      setLoading(false);
      hasInitializedRef.current = false;
    }
  }, [isAuthenticated, fetchProperties]);

  const switchProperty = (propertyId: string) => {
    if (properties.find(p => p.id === propertyId)) {
      setSelectedPropertyId(propertyId);
      propertyStorage.setSelectedPropertyId(propertyId).catch(() => {
        // ignore storage errors
      });
      clearScreenCache(); // Clear cache when switching properties
    }
  };

  const refreshProperties = async () => {
    // Clear only properties cache to avoid forcing unrelated screens to refetch
    clearScreenCache(cacheKeys.properties());
    isFetchingPropertiesRef.current = false;
    await fetchProperties();
  };

  return (
    <PropertyContext.Provider
      value={{
        properties,
        selectedProperty,
        selectedPropertyId,
        loading,
        switchProperty,
        refreshProperties,
      }}>
      {children}
    </PropertyContext.Provider>
  );
}

export function useProperty() {
  const context = useContext(PropertyContext);
  if (context === undefined) {
    throw new Error('useProperty must be used within a PropertyProvider');
  }
  return context;
}
