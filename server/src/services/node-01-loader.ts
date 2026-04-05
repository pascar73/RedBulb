/**
 * Node 01 Precedence Loader
 * 
 * Loads immutable base state (Node 01) from XMP sidecar or neutral default.
 * 
 * Architecture (Option D):
 * - Source of truth: .xmp sidecar on disk
 * - Cache: In-memory with mtime+size invalidation
 * - Fail-safe: Corrupt XMP → log warning, return neutral, never crash
 * 
 * Contract:
 * 1. No XMP → neutral Node 01
 * 2. XMP exists + cache fresh → cached Node 01
 * 3. XMP changed (mtime/size) → re-read/re-map
 * 4. Corrupt XMP → log warning, return neutral
 * 
 * Node 01 is READ-ONLY in UI (immutable base).
 */

import fs from 'node:fs/promises';
import { readXMP, validateXMP, type XMPEditData } from './xmp-sidecar-adapter.js';

export interface DevelopState {
  exposure: number;       // -5.0 to +5.0
  contrast: number;       // -100 to +100
  temperature: number;    // 2000 to 50000 (Kelvin)
  tint: number;           // -150 to +150
  saturation: number;     // -100 to +100
  vibrance: number;       // -100 to +100
}

interface CacheEntry {
  state: DevelopState;
  mtimeMs: number;
  size: number;
}

interface LoadMetrics {
  cacheHits: number;
  cacheMisses: number;
  xmpReads: number;
  xmpErrors: number;
  neutralReturns: number;
}

/**
 * Node 01 loader with in-memory cache and mtime invalidation
 */
export class Node01Loader {
  private cache = new Map<string, CacheEntry>();
  private metrics: LoadMetrics = {
    cacheHits: 0,
    cacheMisses: 0,
    xmpReads: 0,
    xmpErrors: 0,
    neutralReturns: 0,
  };

  /**
   * Load Node 01 state for an asset
   * 
   * @param assetPath - Path to RAW asset (e.g., /path/to/image.NEF)
   * @returns Immutable Node 01 DevelopState
   */
  async load(assetPath: string): Promise<DevelopState> {
    const xmpPath = this.getXMPPath(assetPath);

    try {
      // Check if XMP exists
      const stats = await fs.stat(xmpPath);
      const cacheKey = assetPath;

      // Check cache freshness (mtime + size)
      const cached = this.cache.get(cacheKey);
      if (cached && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size) {
        this.metrics.cacheHits++;
        return cached.state;
      }

      // Cache miss or stale - validate and read XMP
      this.metrics.cacheMisses++;

      // Validate XMP structure before reading
      const isValid = await validateXMP(xmpPath);
      if (!isValid) {
        // XMP exists but is corrupt - log warning, return neutral
        this.metrics.xmpErrors++;
        console.warn(`[Node01Loader] Invalid XMP structure for ${assetPath}`);
        return this.getNeutralNode01();
      }

      this.metrics.xmpReads++;

      try {
        const xmpData = await readXMP(xmpPath);
        const state = this.mapXMPToNode01(xmpData.data);

        // Update cache
        this.cache.set(cacheKey, {
          state,
          mtimeMs: stats.mtimeMs,
          size: stats.size,
        });

        return state;
      } catch (readError) {
        // XMP is valid but read failed - log warning, return neutral
        this.metrics.xmpErrors++;
        console.warn(`[Node01Loader] Failed to read XMP for ${assetPath}:`, readError);
        return this.getNeutralNode01();
      }
    } catch (error) {
      // XMP doesn't exist (ENOENT)
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.metrics.neutralReturns++;
        return this.getNeutralNode01();
      }
      // Other fs.stat errors - treat as missing XMP
      this.metrics.neutralReturns++;
      console.warn(`[Node01Loader] Failed to stat XMP for ${assetPath}:`, error);
      return this.getNeutralNode01();
    }
  }

  /**
   * Clear cache entry for a specific asset (useful after XMP write)
   */
  invalidate(assetPath: string): void {
    this.cache.delete(assetPath);
  }

  /**
   * Clear entire cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache size (for monitoring)
   */
  getCacheSize(): number {
    return this.cache.size;
  }

  /**
   * Get performance metrics
   */
  getMetrics(): Readonly<LoadMetrics> {
    return { ...this.metrics };
  }

  /**
   * Reset metrics (useful for testing)
   */
  resetMetrics(): void {
    this.metrics = {
      cacheHits: 0,
      cacheMisses: 0,
      xmpReads: 0,
      xmpErrors: 0,
      neutralReturns: 0,
    };
  }

  /**
   * Convert asset path to XMP sidecar path
   * Example: /path/image.NEF → /path/image.xmp
   */
  private getXMPPath(assetPath: string): string {
    return assetPath.replace(/\.(nef|cr2|arw|dng|raf|rw2|orf|srw|raw)$/i, '.xmp');
  }

  /**
   * Map XMP data to Node 01 DevelopState
   * Uses explicit defaults (??) for deterministic mapping
   */
  private mapXMPToNode01(xmpData: Partial<XMPEditData>): DevelopState {
    return {
      exposure: xmpData.exposure ?? 0,
      contrast: xmpData.contrast ?? 0,
      temperature: xmpData.temperature ?? 6500, // Daylight
      tint: xmpData.tint ?? 0,
      saturation: xmpData.saturation ?? 0,
      vibrance: xmpData.vibrance ?? 0,
    };
  }

  /**
   * Get neutral Node 01 state (all adjustments at zero)
   */
  private getNeutralNode01(): DevelopState {
    return {
      exposure: 0,
      contrast: 0,
      temperature: 6500, // Daylight neutral
      tint: 0,
      saturation: 0,
      vibrance: 0,
    };
  }
}

// Singleton instance for app-wide use
export const node01Loader = new Node01Loader();
