import { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { encryptedTokenStorage } from '@/services/encryptedTokenStorage';
import { deviceIdService } from '@/services/deviceId';
import { authService } from '@/services/apiClient';
import type { Owner } from '@/services/apiTypes';
import { clearScreenCache } from '@/services/screenCache';
import { propertyStorage } from '@/services/propertyStorage';

interface AuthContextType {
  user: Owner | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (user: Owner) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Auto-refresh token 5 minutes before expiry
const TOKEN_REFRESH_BUFFER = 5 * 60 * 1000;
// Minimum 10 seconds between refresh attempts to prevent hammering the server
const MIN_REFRESH_INTERVAL = 10 * 1000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Owner | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true); // Start as true to prevent race condition during auth restore
  const appStateRef = useRef<AppStateStatus>('active');
  const tokenRefreshTimerRef = useRef<NodeJS.Timeout | number | null>(null);

  // Initialize auth on app startup
  useEffect(() => {
    initializeAuth();
  }, []);

  // Handle app state changes (foreground/background)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [isAuthenticated]);

  // Set up periodic token refresh
  useEffect(() => {
    if (isAuthenticated) {
      scheduleTokenRefresh();
    }
    return () => {
      if (tokenRefreshTimerRef.current) {
        clearTimeout(tokenRefreshTimerRef.current);
      }
    };
  }, [isAuthenticated]);

  const initializeAuth = async () => {
    try {
      // Get or create device ID
      const deviceId = await deviceIdService.getOrCreateDeviceId();
      
      const token = await encryptedTokenStorage.getAccessToken();
      const refreshToken = await encryptedTokenStorage.getRefreshToken();
      const isValid = await encryptedTokenStorage.isTokenValid();

      if (!token || !refreshToken) {
        setIsAuthenticated(false);
        setUser(null);
        setLoading(false);
        return;
      }

      // Optimistically set authenticated if we have tokens to avoid UI flicker
      if (isValid) {
        setIsAuthenticated(true);
        setLoading(false);
        
        // Fetch user data in background
        try {
          const response = await authService.getCurrentUser();
          setUser(response.data);
          // Schedule the next refresh now that we're authenticated
          scheduleTokenRefresh();
        } catch (error: any) {
          if (error?.code === 'UNAUTHORIZED' || error?.details?.status === 401) {
            // Token invalid on server, clear it
            await encryptedTokenStorage.clearTokens();
            setIsAuthenticated(false);
            setUser(null);
          } else if (error?.code === 'NETWORK_ERROR') {
            // Network error - stay logged in, we have tokens
            // Schedule refresh for when network is available
            scheduleTokenRefresh();
          } else {
            // Other error - stay logged in
            scheduleTokenRefresh();
          }
        }
      } else if (refreshToken) {
        // Token expired but we have refresh token, try to refresh
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          setIsAuthenticated(true);
          setLoading(false);
          
          try {
            const response = await authService.getCurrentUser();
            setUser(response.data);
            scheduleTokenRefresh();
          } catch (error: any) {
            // Refresh succeeded but couldn't get user - stay logged in
            scheduleTokenRefresh();
          }
        } else {
          await encryptedTokenStorage.clearTokens();
          setIsAuthenticated(false);
          setUser(null);
          setLoading(false);
        }
      } else {
        await encryptedTokenStorage.clearTokens();
        setIsAuthenticated(false);
        setUser(null);
        setLoading(false);
      }
    } catch (error) {
      // On unexpected errors, check if we have tokens
      const token = await encryptedTokenStorage.getAccessToken();
      if (token) {
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
        setUser(null);
      }
      setLoading(false);
    }
  };

  const refreshAccessToken = async (): Promise<boolean> => {
    try {
      const refreshToken = await encryptedTokenStorage.getRefreshToken();
      if (!refreshToken) {
        return false;
      }

      // Use the API client's refreshAccessToken function directly
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          await encryptedTokenStorage.clearTokens();
          setIsAuthenticated(false);
          setUser(null);
        }
        return false;
      }

      const responseData = await response.json();
      const data = responseData?.data;

      if (data?.tokens?.accessToken && data?.tokens?.refreshToken && data?.tokens?.expiresAt) {
        // Update tokens with token rotation (new refresh token on each refresh)
        await encryptedTokenStorage.setAccessToken(data.tokens.accessToken);
        await encryptedTokenStorage.setRefreshToken(data.tokens.refreshToken);
        await encryptedTokenStorage.setTokenExpiry(data.tokens.expiresAt);

        // Update user data if provided (in case user properties changed on server)
        if (data.user) {
          setUser(data.user);
        }

        return true;
      }

      return false;
    } catch (error: any) {
      // Don't logout on network error - user might be offline
      return false;
    }
  };

  const scheduleTokenRefresh = async () => {
    try {
      const expiry = await encryptedTokenStorage.getTokenExpiry();
      if (!expiry) return;

      const timeUntilExpiry = expiry - Date.now();
      
      // If token is already expired, don't schedule refresh
      if (timeUntilExpiry <= 0) {
        return;
      }

      let refreshTime = Math.max(MIN_REFRESH_INTERVAL, timeUntilExpiry - TOKEN_REFRESH_BUFFER);
      
      // If refresh time is unreasonably short, use a fallback interval
      if (refreshTime < MIN_REFRESH_INTERVAL) {
        refreshTime = MIN_REFRESH_INTERVAL;
      }

      // Clear any existing timer
      if (tokenRefreshTimerRef.current) {
        clearTimeout(tokenRefreshTimerRef.current);
      }

      tokenRefreshTimerRef.current = setTimeout(async () => {
        const success = await refreshAccessToken();
        if (success) {
          scheduleTokenRefresh(); // Reschedule for next refresh
        } else {
          await encryptedTokenStorage.clearTokens();
          setIsAuthenticated(false);
          setUser(null);
        }
      }, refreshTime);
    } catch (error) {
      // Silently fail scheduling
    }
  };

  const handleAppStateChange = async (nextAppState: AppStateStatus) => {
    const prevAppState = appStateRef.current;
    appStateRef.current = nextAppState;

    // App came to foreground - check if token needs refresh
    if (prevAppState === 'background' && nextAppState === 'active') {
      if (isAuthenticated) {
        const isValid = await encryptedTokenStorage.isTokenValid();
        if (!isValid) {
          await refreshAccessToken();
          scheduleTokenRefresh();
        }
      }
    }
  };

  const login = (userData: Owner) => {
    clearScreenCache();
    setUser(userData);
    setIsAuthenticated(true);
    // Schedule token refresh now that we're authenticated
    scheduleTokenRefresh();
  };

  const logout = async () => {
    try {
      await authService.logout();
    } catch (error) {
      // Silently handle logout errors
    } finally {
      await encryptedTokenStorage.clearTokens();
      await propertyStorage.clearSelectedPropertyId();
      clearScreenCache();
      setUser(null);
      setIsAuthenticated(false);
      if (tokenRefreshTimerRef.current) {
        clearTimeout(tokenRefreshTimerRef.current);
      }
    }
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
