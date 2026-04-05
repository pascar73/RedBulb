/**
 * thumbnail-change-detector.ts — Thumbnail regeneration change detection
 * 
 * Week 2 Task #4: Only regenerate thumbnails when XMP/state actually changed
 * 
 * Strategy: Track XMP file mtime to detect changes
 */

import fs from 'node:fs/promises';
import crypto from 'node:crypto';

interface ChangeDetectionResult {
  changed: boolean;
  reason?: string;
  currentMtime?: number;
  cachedMtime?: number;
}

/**
 * In-memory cache of XMP mtimes (asset ID -> mtime)
 * In production, this could be Redis or DB field
 */
const xmpMtimeCache = new Map<string, number>();

/**
 * Get XMP file path from asset path
 */
function getXMPPath(assetPath: string): string {
  return assetPath.replace(/\.(nef|cr2|arw|dng|raf|rw2|orf|srw|raw)$/i, '.xmp');
}

/**
 * Check if XMP file changed since last thumbnail generation
 * 
 * @param assetId - Asset ID
 * @param assetPath - Path to RAW asset file
 * @returns Detection result with change status
 */
export async function detectXMPChange(
  assetId: string,
  assetPath: string,
): Promise<ChangeDetectionResult> {
  const xmpPath = getXMPPath(assetPath);

  try {
    // Check if XMP exists
    const stats = await fs.stat(xmpPath);
    const currentMtime = stats.mtimeMs;

    // Get cached mtime
    const cachedMtime = xmpMtimeCache.get(assetId);

    if (!cachedMtime) {
      // First generation or cache miss
      return {
        changed: true,
        reason: 'No cached XMP mtime (first generation)',
        currentMtime,
      };
    }

    if (currentMtime !== cachedMtime) {
      // XMP modified
      return {
        changed: true,
        reason: 'XMP file modified',
        currentMtime,
        cachedMtime,
      };
    }

    // No change
    return {
      changed: false,
      currentMtime,
      cachedMtime,
    };
  } catch (error) {
    // XMP doesn't exist (neutral state)
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      const cachedMtime = xmpMtimeCache.get(assetId);
      
      if (cachedMtime) {
        // XMP was deleted
        return {
          changed: true,
          reason: 'XMP file deleted (reset to neutral)',
        };
      }

      // No XMP, never had one
      return {
        changed: false,
        reason: 'No XMP file (neutral state, unchanged)',
      };
    }

    // Other error - assume changed to be safe
    return {
      changed: true,
      reason: `XMP stat error: ${(error as Error).message}`,
    };
  }
}

/**
 * Mark XMP as processed (update cache with current mtime)
 * Call this after successful thumbnail generation
 * 
 * @param assetId - Asset ID
 * @param assetPath - Path to RAW asset file
 */
export async function markXMPProcessed(assetId: string, assetPath: string): Promise<void> {
  const xmpPath = getXMPPath(assetPath);

  try {
    const stats = await fs.stat(xmpPath);
    xmpMtimeCache.set(assetId, stats.mtimeMs);
  } catch (error) {
    // XMP doesn't exist - clear cache entry
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      xmpMtimeCache.delete(assetId);
    }
  }
}

/**
 * Clear cache entry for asset (useful for testing or manual invalidation)
 */
export function invalidateCache(assetId: string): void {
  xmpMtimeCache.delete(assetId);
}

/**
 * Get cache size (for monitoring)
 */
export function getCacheSize(): number {
  return xmpMtimeCache.size;
}

/**
 * Clear entire cache
 */
export function clearCache(): void {
  xmpMtimeCache.clear();
}

/**
 * Hash a develop state for change detection
 * Alternative to mtime-based detection (more precise)
 */
export function hashDevelopState(state: Record<string, unknown>): string {
  const stateJson = JSON.stringify(state, Object.keys(state).sort());
  return crypto.createHash('sha256').update(stateJson).digest('hex');
}
