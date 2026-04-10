/**
 * thumbnail-change-detector.spec.ts — Unit tests for thumbnail change detection
 * 
 * Week 2 Task #4: Test XMP change detection logic
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  detectXMPChange,
  markXMPProcessed,
  invalidateCache,
  clearCache,
  getCacheSize,
  hashDevelopState,
} from './thumbnail-change-detector';

describe('ThumbnailChangeDetector', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'thumb-change-'));
    clearCache();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    clearCache();
  });

  describe('detectXMPChange', () => {
    it('should detect change on first generation (no cache)', async () => {
      const assetPath = path.join(tempDir, 'image.NEF');
      const xmpPath = path.join(tempDir, 'image.xmp');

      await fs.writeFile(assetPath, 'fake RAW');
      await fs.writeFile(xmpPath, 'fake XMP');

      const result = await detectXMPChange('asset-1', assetPath);

      expect(result.changed).toBe(true);
      expect(result.reason).toContain('No cached XMP mtime');
      expect(result.currentMtime).toBeDefined();
    });

    it('should not detect change when XMP unchanged', async () => {
      const assetPath = path.join(tempDir, 'image.NEF');
      const xmpPath = path.join(tempDir, 'image.xmp');

      await fs.writeFile(assetPath, 'fake RAW');
      await fs.writeFile(xmpPath, 'fake XMP');

      // First detection (cache miss)
      const result1 = await detectXMPChange('asset-1', assetPath);
      expect(result1.changed).toBe(true);

      // Mark as processed
      await markXMPProcessed('asset-1', assetPath);

      // Second detection (cache hit, no change)
      const result2 = await detectXMPChange('asset-1', assetPath);
      expect(result2.changed).toBe(false);
      expect(result2.currentMtime).toBe(result2.cachedMtime);
    });

    it('should detect change when XMP modified', async () => {
      const assetPath = path.join(tempDir, 'image.NEF');
      const xmpPath = path.join(tempDir, 'image.xmp');

      await fs.writeFile(assetPath, 'fake RAW');
      await fs.writeFile(xmpPath, 'fake XMP v1');

      // Initial generation
      await detectXMPChange('asset-1', assetPath);
      await markXMPProcessed('asset-1', assetPath);

      // Modify XMP
      await new Promise((resolve) => setTimeout(resolve, 10)); // Ensure mtime changes
      await fs.writeFile(xmpPath, 'fake XMP v2 - modified');

      // Should detect change
      const result = await detectXMPChange('asset-1', assetPath);
      expect(result.changed).toBe(true);
      expect(result.reason).toContain('XMP file modified');
      expect(result.currentMtime).not.toBe(result.cachedMtime);
    });

    it('should detect change when XMP deleted', async () => {
      const assetPath = path.join(tempDir, 'image.NEF');
      const xmpPath = path.join(tempDir, 'image.xmp');

      await fs.writeFile(assetPath, 'fake RAW');
      await fs.writeFile(xmpPath, 'fake XMP');

      // Initial generation
      await detectXMPChange('asset-1', assetPath);
      await markXMPProcessed('asset-1', assetPath);

      // Delete XMP
      await fs.unlink(xmpPath);

      // Should detect change (XMP deleted = reset to neutral)
      const result = await detectXMPChange('asset-1', assetPath);
      expect(result.changed).toBe(true);
      expect(result.reason).toContain('XMP file deleted');
    });

    it('should not detect change when XMP never existed', async () => {
      const assetPath = path.join(tempDir, 'image.NEF');
      await fs.writeFile(assetPath, 'fake RAW');
      // No XMP file created

      // First check (no XMP, no cache)
      const result1 = await detectXMPChange('asset-1', assetPath);
      expect(result1.changed).toBe(false);
      expect(result1.reason).toContain('No XMP file (neutral state, unchanged)');

      // Mark as processed (nothing to cache)
      await markXMPProcessed('asset-1', assetPath);

      // Second check (still no XMP, still no change)
      const result2 = await detectXMPChange('asset-1', assetPath);
      expect(result2.changed).toBe(false);
    });

    it('should handle multiple assets independently', async () => {
      const asset1Path = path.join(tempDir, 'image1.NEF');
      const asset2Path = path.join(tempDir, 'image2.NEF');
      const xmp1Path = path.join(tempDir, 'image1.xmp');
      const xmp2Path = path.join(tempDir, 'image2.xmp');

      await fs.writeFile(asset1Path, 'fake RAW 1');
      await fs.writeFile(asset2Path, 'fake RAW 2');
      await fs.writeFile(xmp1Path, 'fake XMP 1');
      await fs.writeFile(xmp2Path, 'fake XMP 2');

      // Process asset 1
      await detectXMPChange('asset-1', asset1Path);
      await markXMPProcessed('asset-1', asset1Path);

      // Asset 1 unchanged
      const result1 = await detectXMPChange('asset-1', asset1Path);
      expect(result1.changed).toBe(false);

      // Asset 2 never processed (should detect change)
      const result2 = await detectXMPChange('asset-2', asset2Path);
      expect(result2.changed).toBe(true);
    });
  });

  describe('markXMPProcessed', () => {
    it('should cache XMP mtime after processing', async () => {
      const assetPath = path.join(tempDir, 'image.NEF');
      const xmpPath = path.join(tempDir, 'image.xmp');

      await fs.writeFile(assetPath, 'fake RAW');
      await fs.writeFile(xmpPath, 'fake XMP');

      expect(getCacheSize()).toBe(0);

      await markXMPProcessed('asset-1', assetPath);

      expect(getCacheSize()).toBe(1);

      // Verify cache prevents change detection
      const result = await detectXMPChange('asset-1', assetPath);
      expect(result.changed).toBe(false);
    });

    it('should clear cache entry when XMP deleted', async () => {
      const assetPath = path.join(tempDir, 'image.NEF');
      const xmpPath = path.join(tempDir, 'image.xmp');

      await fs.writeFile(assetPath, 'fake RAW');
      await fs.writeFile(xmpPath, 'fake XMP');

      await markXMPProcessed('asset-1', assetPath);
      expect(getCacheSize()).toBe(1);

      // Delete XMP
      await fs.unlink(xmpPath);

      // Mark as processed again (should clear cache)
      await markXMPProcessed('asset-1', assetPath);
      expect(getCacheSize()).toBe(0);
    });
  });

  describe('cache management', () => {
    it('should invalidate single cache entry', async () => {
      const assetPath = path.join(tempDir, 'image.NEF');
      const xmpPath = path.join(tempDir, 'image.xmp');

      await fs.writeFile(assetPath, 'fake RAW');
      await fs.writeFile(xmpPath, 'fake XMP');

      await markXMPProcessed('asset-1', assetPath);
      expect(getCacheSize()).toBe(1);

      invalidateCache('asset-1');
      expect(getCacheSize()).toBe(0);

      // Should now detect as changed (cache miss)
      const result = await detectXMPChange('asset-1', assetPath);
      expect(result.changed).toBe(true);
    });

    it('should clear all cache entries', async () => {
      const asset1Path = path.join(tempDir, 'image1.NEF');
      const asset2Path = path.join(tempDir, 'image2.NEF');
      const xmp1Path = path.join(tempDir, 'image1.xmp');
      const xmp2Path = path.join(tempDir, 'image2.xmp');

      await fs.writeFile(asset1Path, 'fake RAW 1');
      await fs.writeFile(asset2Path, 'fake RAW 2');
      await fs.writeFile(xmp1Path, 'fake XMP 1');
      await fs.writeFile(xmp2Path, 'fake XMP 2');

      await markXMPProcessed('asset-1', asset1Path);
      await markXMPProcessed('asset-2', asset2Path);
      expect(getCacheSize()).toBe(2);

      clearCache();
      expect(getCacheSize()).toBe(0);
    });
  });

  describe('hashDevelopState', () => {
    it('should produce consistent hash for same state', () => {
      const state = { exposure: 1.0, contrast: 20, temperature: 5500 };

      const hash1 = hashDevelopState(state);
      const hash2 = hashDevelopState(state);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hash for different state', () => {
      const state1 = { exposure: 1.0, contrast: 20 };
      const state2 = { exposure: 1.5, contrast: 20 };

      const hash1 = hashDevelopState(state1);
      const hash2 = hashDevelopState(state2);

      expect(hash1).not.toBe(hash2);
    });

    it('should be order-independent (sorted keys)', () => {
      const state1 = { exposure: 1.0, contrast: 20, temperature: 5500 };
      const state2 = { temperature: 5500, contrast: 20, exposure: 1.0 };

      const hash1 = hashDevelopState(state1);
      const hash2 = hashDevelopState(state2);

      expect(hash1).toBe(hash2);
    });

    it('should handle nested objects', () => {
      const state = {
        exposure: 1.0,
        curves: {
          master: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
        },
      };

      const hash = hashDevelopState(state);
      expect(hash).toBeTruthy();
      expect(hash).toHaveLength(64); // SHA-256 hex
    });
  });
});
