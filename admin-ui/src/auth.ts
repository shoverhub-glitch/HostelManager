const ADMIN_ACCESS_TOKEN_KEY = 'hm_admin_access_token';
const ADMIN_SECURITY_KEY = 'hm_admin_security_key';

export function getAdminAccessToken(): string | null {
  return localStorage.getItem(ADMIN_ACCESS_TOKEN_KEY);
}

export function setAdminAccessToken(token: string): void {
  localStorage.setItem(ADMIN_ACCESS_TOKEN_KEY, token);
}

export function clearAdminAccessToken(): void {
  localStorage.removeItem(ADMIN_ACCESS_TOKEN_KEY);
}

export function getAdminSecurityKey(): string | null {
  return sessionStorage.getItem(ADMIN_SECURITY_KEY);
}

export function setAdminSecurityKey(key: string): void {
  sessionStorage.setItem(ADMIN_SECURITY_KEY, key);
}

export function clearAdminSecurityKey(): void {
  sessionStorage.removeItem(ADMIN_SECURITY_KEY);
}
