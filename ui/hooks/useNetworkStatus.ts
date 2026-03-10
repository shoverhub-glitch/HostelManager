import { useState, useEffect } from 'react';

/**
 * Track network connectivity status
 * Returns true if device is online, false if offline
 */
export function useNetworkStatus(): boolean {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Check initial connectivity
    checkConnectivity();

    // Set up periodic connectivity check (every 5 seconds when offline)
    const interval = setInterval(checkConnectivity, 5000);

    return () => clearInterval(interval);
  }, []);

  const checkConnectivity = async () => {
    try {
      // Try to fetch a lightweight resource with short timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch('https://www.google.com/favicon.ico', {
        method: 'HEAD',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      setIsOnline(true);
    } catch (error) {
      // Network is offline or unreachable
      setIsOnline(false);
    }
  };

  return isOnline;
}
