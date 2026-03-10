type CacheEntry<T> = {
  data: T;
  timestamp: number;
};

const cache = new Map<string, CacheEntry<unknown>>();

export const cacheKeys = {
  properties: () => 'properties:list',
  dashboard: (propertyId: string) => `dashboard:${propertyId}`,
  tenants: (propertyId: string, page: number, search: string, status: string) =>
    `tenants:${propertyId}:${page}:${search}:${status}`,
  payments: (propertyId: string, monthStr?: string) => `payments:${propertyId}:${monthStr ?? 'current'}`,
  paymentDetail: (paymentId: string) => `payment-detail:${paymentId}`,
  rooms: (propertyId: string) => `rooms:${propertyId}`,
  roomBeds: (propertyId: string, roomId: string) => `room-beds:${propertyId}:${roomId}`,
  subscription: () => 'subscription:summary',
  manageBeds: (propertyId: string, roomId: string) => `manage-beds:${propertyId}:${roomId}`,
  tenantDetail: (tenantId: string) => `tenant-detail:${tenantId}`,
};

export function setScreenCache<T>(key: string, data: T): void {
  cache.set(key, {
    data,
    timestamp: Date.now(),
  });
}

export function getScreenCache<T>(key: string, staleTimeMs: number): T | null {
  const entry = cache.get(key);
  if (!entry) return null;

  const isFresh = Date.now() - entry.timestamp <= staleTimeMs;
  if (!isFresh) {
    cache.delete(key);
    return null;
  }

  return entry.data as T;
}

export function clearScreenCache(prefix?: string): void {
  if (!prefix) {
    cache.clear();
    return;
  }

  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}
