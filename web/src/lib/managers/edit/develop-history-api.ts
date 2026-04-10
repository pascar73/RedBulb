/**
 * Develop History API client — talks to /api/assets/:id/develop-history
 * Direct fetch calls (not auto-generated SDK) since this is a RedBulb extension.
 * 
 * Uses shared API base resolution (getRedBulbApiBase) for consistent routing.
 */

import { redBulbFetch, getRedBulbApiBase } from '$lib/utils/redbulb-api';

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

/** List all versions for an asset (summary — no state blob) */
export function listVersions(assetId: string): Promise<DevelopHistoryList> {
  return redBulbFetch<DevelopHistoryList>(`/assets/${assetId}/develop-history`);
}

/** Get current version with full state */
export function getCurrentVersion(assetId: string): Promise<DevelopHistoryVersion | null> {
  return redBulbFetch<DevelopHistoryVersion | null>(`/assets/${assetId}/develop-history/current`);
}

/** Get a specific version with full state */
export function getVersion(assetId: string, version: number): Promise<DevelopHistoryVersion> {
  return redBulbFetch<DevelopHistoryVersion>(`/assets/${assetId}/develop-history/${version}`);
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
  return redBulbFetch<DevelopHistoryVersion>(`/assets/${assetId}/develop-history`, {
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
  return redBulbFetch<DevelopHistoryVersion>(
    `/assets/${assetId}/develop-history/${version}/restore`,
    {
      method: 'POST',
      body: JSON.stringify({ label }),
    },
  );
}

/** Update a version's label */
export function updateLabel(assetId: string, version: number, label: string): Promise<void> {
  return redBulbFetch<void>(`/assets/${assetId}/develop-history/${version}/label`, {
    method: 'PUT',
    body: JSON.stringify({ label }),
  });
}

/** Delete a non-current version */
export function deleteVersion(assetId: string, version: number): Promise<void> {
  return redBulbFetch<void>(`/assets/${assetId}/develop-history/${version}`, {
    method: 'DELETE',
  });
}

/** Get thumbnail URL for a version */
export function getThumbnailUrl(assetId: string, version: number): string {
  return `${getRedBulbApiBase()}/assets/${assetId}/develop-history/${version}/thumbnail`;
}
