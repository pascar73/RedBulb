/**
 * Shared API base resolution for RedBulb extensions (develop history, XMP sidecar).
 * 
 * Architecture:
 * - Dev environment (port 2284): Sidecar service at :3380/api
 * - Prod environment: Immich server with custom endpoints at /api
 */

let _apiBase: string | null = null;

/**
 * Get the base URL for RedBulb API endpoints (develop history, XMP).
 * Cached after first call.
 */
export function getRedBulbApiBase(): string {
  if (_apiBase !== null) return _apiBase;
  
  if (typeof window !== 'undefined' && window.location.port === '2284') {
    // Dev: sidecar service on port 3380
    _apiBase = `${window.location.protocol}//${window.location.hostname}:3380/api`;
  } else {
    // Prod: Immich server with custom endpoints
    _apiBase = '/api';
  }
  
  return _apiBase;
}

/**
 * Fetch wrapper with RedBulb API base and JSON headers.
 */
export async function redBulbFetch<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<T> {
  const base = getRedBulbApiBase();
  const url = `${base}${endpoint}`;
  
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${text}`);
  }
  
  return res.json() as Promise<T>;
}
