import {
  clearAdminAccessToken,
  getAdminAccessToken,
  getAdminSecurityKey,
  setAdminAccessToken,
} from './auth';
import type { AuthenticatedAdmin, ListResult, OverviewStats, PaginationMeta, ResourceKey } from './types';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1').replace(/\/+$/, '');
const ADMIN_SECURITY_HEADER = import.meta.env.VITE_ADMIN_SECURITY_HEADER || 'X-Admin-Secret';

const DEFAULT_META: PaginationMeta = {
  total: 0,
  page: 1,
  pageSize: 25,
  hasMore: false,
};

function toQueryString(query: Record<string, string | number | boolean | undefined>): string {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && `${value}`.length > 0) {
      params.append(key, String(value));
    }
  });
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  requiresAuth: boolean = true
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const token = getAdminAccessToken();
  if (requiresAuth && token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const securityKey = getAdminSecurityKey();
  if (securityKey) {
    headers[ADMIN_SECURITY_HEADER] = securityKey;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      clearAdminAccessToken();
    }
    const detail = payload?.detail || payload?.message || `Request failed (${response.status})`;
    throw new Error(detail);
  }

  return payload as T;
}

function normalizeListResponse(raw: any): ListResult {
  if (Array.isArray(raw)) {
    return {
      rows: raw,
      meta: {
        ...DEFAULT_META,
        total: raw.length,
      },
    };
  }

  if (raw?.data && Array.isArray(raw.data)) {
    return {
      rows: raw.data,
      meta: {
        ...DEFAULT_META,
        ...(raw.meta || {}),
        total: raw.meta?.total ?? raw.total ?? raw.data.length,
      },
    };
  }

  if (raw?.data && Array.isArray(raw.data?.subscriptions)) {
    const rows = raw.data.subscriptions;
    return {
      rows,
      meta: {
        ...DEFAULT_META,
        total: raw.data.count ?? rows.length,
      },
    };
  }

  return {
    rows: [],
    meta: DEFAULT_META,
  };
}

export async function loginAdmin(email: string, password: string): Promise<void> {
  const payload = await request<any>('POST', '/auth/login', { email, password }, false);
  const accessToken = payload?.data?.tokens?.accessToken;
  if (!accessToken) {
    throw new Error('Login response did not include an access token');
  }
  setAdminAccessToken(accessToken);
}

export async function fetchAdminMe(): Promise<AuthenticatedAdmin> {
  const payload = await request<any>('GET', '/admin/me');
  return payload?.data;
}

export async function fetchOverview(): Promise<OverviewStats> {
  const payload = await request<any>('GET', '/admin/overview');
  return payload?.data;
}

export async function listResource(
  resource: ResourceKey,
  params: { page: number; pageSize: number; search?: string }
): Promise<ListResult> {
  const query = toQueryString({
    page: params.page,
    page_size: params.pageSize,
    search: params.search,
  });
  const payload = await request<any>('GET', `/admin/${resource}${query}`);
  return normalizeListResponse(payload);
}

export async function updateResource(resource: ResourceKey, id: string, patch: Record<string, unknown>): Promise<void> {
  await request('PATCH', `/admin/${resource}/${encodeURIComponent(id)}`, patch);
}

export async function listPlans(params: { activeOnly?: boolean }): Promise<ListResult> {
  const query = toQueryString({ active_only: params.activeOnly });
  const payload = await request<any>('GET', `/admin/plans${query}`);
  return normalizeListResponse(payload);
}

export async function updatePlan(planName: string, patch: Record<string, unknown>): Promise<void> {
  await request('PATCH', `/admin/plans/${encodeURIComponent(planName)}`, patch);
}

export async function createPlan(payload: Record<string, unknown>): Promise<void> {
  await request('POST', '/admin/plans', payload);
}

export async function listCoupons(params: { activeOnly?: boolean }): Promise<ListResult> {
  const query = toQueryString({ is_active: params.activeOnly });
  const payload = await request<any>('GET', `/coupons/admin/list${query}`);
  return normalizeListResponse(payload);
}

export async function updateCoupon(code: string, patch: Record<string, unknown>): Promise<void> {
  await request('PATCH', `/coupons/admin/${encodeURIComponent(code)}`, patch);
}

export async function createCoupon(payload: Record<string, unknown>): Promise<void> {
  await request('POST', '/coupons/admin/create', payload);
}

export async function listBackups(params: { page: number; pageSize: number }): Promise<{ rows: any[]; meta: any }> {
  const query = toQueryString({
    page: params.page,
    pageSize: params.pageSize,
  });
  return request('GET', `/admin/backups${query}`);
}

export async function triggerBackup(): Promise<void> {
  await request('POST', '/admin/backups/trigger');
}

export async function deleteBackup(id: string): Promise<void> {
  await request('DELETE', `/admin/backups/${id}`);
}

export async function downloadStoredBackup(id: string): Promise<Blob> {
  const token = getAdminAccessToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const securityKey = getAdminSecurityKey();
  if (securityKey) {
    headers[ADMIN_SECURITY_HEADER] = securityKey;
  }

  const response = await fetch(`${API_BASE_URL}/admin/backups/${id}/download`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const detail = payload?.detail || payload?.message || `Download failed (${response.status})`;
    throw new Error(detail);
  }

  return response.blob();
}
