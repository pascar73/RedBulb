/**
 * Develop History API client — talks to /api/assets/:id/develop-history
 * Direct fetch calls (not auto-generated SDK) since this is a RedBulb extension.
 */

// The develop history API runs as a sidecar service on port 3380 in dev.
// When the Immich server is rebuilt with our endpoints, this falls back to /api.
let _base: string | null = null;
function getBase(): string {
  if (_base !== null) return _base;
  if (typeof window !== 'undefined' && window.location.port === '2284') {
    _base = `${window.location.protocol}//${window.location.hostname}:3380/api`;
  } else {
    _base = '/api';
  }
  return _base;
}

export interface DevelopHistoryVersion {
  id: string;
  assetId: string;
  userId: string;
  version: number;
  label: string;
  state: Record<string, unknown>;
  isCurrent: boolean;
  isAutoCheckpoint: boolean;
  hasThumbnail: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DevelopHistoryList {
  assetId: string;
  total: number;
  versions: DevelopHistoryVersion[];
}

async function apiRequest<T>(url: string, options?: RequestInit): Promise<T> {
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
  // Handle 204 No Content
  if (res.status === 204) return undefined as T;
  return res.json();
}

/** List all versions for an asset (summary — no state blob) */
export function listVersions(assetId: string): Promise<DevelopHistoryList> {
  return apiRequest<DevelopHistoryList>(`${getBase()}/assets/${assetId}/develop-history`);
}

/** Get current version with full state */
export function getCurrentVersion(assetId: string): Promise<DevelopHistoryVersion | null> {
  return apiRequest<DevelopHistoryVersion | null>(`${getBase()}/assets/${assetId}/develop-history/current`);
}

/** Get a specific version with full state */
export function getVersion(assetId: string, version: number): Promise<DevelopHistoryVersion> {
  return apiRequest<DevelopHistoryVersion>(`${getBase()}/assets/${assetId}/develop-history/${version}`);
}

/** Save a new version (becomes current) */
export function saveVersion(
  assetId: string,
  state: Record<string, unknown>,
  options?: {
    label?: string;
    isAutoCheckpoint?: boolean;
    thumbnailBase64?: string;
  },
): Promise<DevelopHistoryVersion> {
  return apiRequest<DevelopHistoryVersion>(`${getBase()}/assets/${assetId}/develop-history`, {
    method: 'POST',
    body: JSON.stringify({
      state,
      label: options?.label ?? '',
      isAutoCheckpoint: options?.isAutoCheckpoint ?? false,
      thumbnailBase64: options?.thumbnailBase64,
    }),
  });
}

/** Restore a previous version (creates new version from old state) */
export function restoreVersion(
  assetId: string,
  version: number,
  label?: string,
): Promise<DevelopHistoryVersion> {
  return apiRequest<DevelopHistoryVersion>(
    `${getBase()}/assets/${assetId}/develop-history/${version}/restore`,
    {
      method: 'POST',
      body: JSON.stringify({ label }),
    },
  );
}

/** Update a version's label */
export function updateLabel(assetId: string, version: number, label: string): Promise<void> {
  return apiRequest<void>(`${getBase()}/assets/${assetId}/develop-history/${version}/label`, {
    method: 'PUT',
    body: JSON.stringify({ label }),
  });
}

/** Delete a non-current version */
export function deleteVersion(assetId: string, version: number): Promise<void> {
  return apiRequest<void>(`${getBase()}/assets/${assetId}/develop-history/${version}`, {
    method: 'DELETE',
  });
}

/** Get thumbnail URL for a version */
export function getThumbnailUrl(assetId: string, version: number): string {
  return `${getBase()}/assets/${assetId}/develop-history/${version}/thumbnail`;
}
