export type ResourceKey =
  | 'users'
  | 'properties'
  | 'tenants'
  | 'rooms'
  | 'payments'
  | 'subscriptions';

export interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ListResult {
  rows: Record<string, unknown>[];
  meta: PaginationMeta;
}

export interface OverviewStats {
  users: number;
  properties: number;
  tenants: number;
  rooms: number;
  payments: number;
  subscriptions: number;
}

export interface AuthenticatedAdmin {
  id: string;
  email: string;
  name?: string;
  role?: string;
  adminAccess?: boolean;
}
