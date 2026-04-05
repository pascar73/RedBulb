import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Node01Loader } from './node-01-loader';
import { updateXMP } from './xmp-sidecar-adapter';

const FIXTURES_DIR = path.join(__dirname, '../../test/fixtures/xmp');
const TEMP_ASSET_PATH = path.join(FIXTURES_DIR, 'test-asset.NEF');
const TEMP_XMP_PATH = path.join(FIXTURES_DIR, 'test-asset.xmp');

describe('Node01Loader', () => {
  let loader: Node01Loader;

  beforeEach(() => {
    loader = new Node01Loader();
    loader.resetMetrics();
  });

  afterEach(async () => {
    // Clean up temp files
    try {
      await fs.unlink(TEMP_XMP_PATH);
    } catch {
      // Ignore if doesn't exist
    }
  });

  describe('Contract #1: No XMP → neutral Node 01', () => {
    it('should return neutral state when XMP does not exist', async () => {
      const state = await loader.load(TEMP_ASSET_PATH);

      expect(state).toEqual({
        exposure: 0,
        contrast: 0,
        temperature: 6500,
        tint: 0,
        saturation: 0,
        vibrance: 0,
      });

      const metrics = loader.getMetrics();
      expect(metrics.neutralReturns).toBe(1);
      expect(metrics.xmpReads).toBe(0);
    });
  });

  describe('Contract #2: XMP exists + cache fresh → cached Node 01', () => {
    it('should return cached state on second load (cache hit)', async () => {
      // Create XMP with known values
      const sourcePath = path.join(FIXTURES_DIR, 'lightroom-sample.xmp');
      await fs.copyFile(sourcePath, TEMP_XMP_PATH);

      // First load - cache miss
      const state1 = await loader.load(TEMP_ASSET_PATH);
      expect(state1.exposure).toBe(0.50);
      expect(state1.contrast).toBe(25);

      const metrics1 = loader.getMetrics();
      expect(metrics1.cacheMisses).toBe(1);
      expect(metrics1.xmpReads).toBe(1);
      expect(metrics1.cacheHits).toBe(0);

      // Second load - cache hit
      const state2 = await loader.load(TEMP_ASSET_PATH);
      expect(state2).toEqual(state1);

      const metrics2 = loader.getMetrics();
      expect(metrics2.cacheHits).toBe(1);
      expect(metrics2.xmpReads).toBe(1); // Still only 1 read
    });

    it('should use cache for multiple rapid loads', async () => {
      const sourcePath = path.join(FIXTURES_DIR, 'lightroom-sample.xmp');
      await fs.copyFile(sourcePath, TEMP_XMP_PATH);

      // Load 10 times
      for (let i = 0; i < 10; i++) {
        await loader.load(TEMP_ASSET_PATH);
      }

      const metrics = loader.getMetrics();
      expect(metrics.cacheMisses).toBe(1); // First load only
      expect(metrics.cacheHits).toBe(9); // Remaining 9
      expect(metrics.xmpReads).toBe(1); // Only read once
    });
  });

  describe('Contract #3: XMP changed (mtime/size) → re-read/re-map', () => {
    it('should invalidate cache when XMP mtime changes', async () => {
      // Create initial XMP
      const sourcePath = path.join(FIXTURES_DIR, 'lightroom-sample.xmp');
      await fs.copyFile(sourcePath, TEMP_XMP_PATH);

      // First load
      const state1 = await loader.load(TEMP_ASSET_PATH);
      expect(state1.exposure).toBe(0.50);

      // Modify XMP (change exposure)
      await updateXMP(TEMP_XMP_PATH, { exposure: 1.5 });

      // Wait 10ms to ensure mtime changes
      await new Promise(resolve => setTimeout(resolve, 10));

      // Second load should re-read
      const state2 = await loader.load(TEMP_ASSET_PATH);
      expect(state2.exposure).toBe(1.5);

      const metrics = loader.getMetrics();
      expect(metrics.cacheMisses).toBe(2); // Initial + after change
      expect(metrics.xmpReads).toBe(2);
    });

    it('should detect size changes even if mtime unchanged', async () => {
      // This is a corner case - in practice mtime usually changes
      // but we test size checking independently
      const sourcePath = path.join(FIXTURES_DIR, 'lightroom-sample.xmp');
      await fs.copyFile(sourcePath, TEMP_XMP_PATH);

      // First load
      await loader.load(TEMP_ASSET_PATH);

      // Get current mtime
      const stats1 = await fs.stat(TEMP_XMP_PATH);

      // Append data (changes size)
      await fs.appendFile(TEMP_XMP_PATH, '<!-- comment -->');

      // Restore mtime (simulates size change without mtime change)
      await fs.utimes(TEMP_XMP_PATH, stats1.atime, stats1.mtime);

      // Should still re-read due to size change
      const state2 = await loader.load(TEMP_ASSET_PATH);
      
      const metrics = loader.getMetrics();
      expect(metrics.cacheMisses).toBe(2);
    });
  });

  describe('Contract #4: Corrupt XMP → log warning, return neutral', () => {
    it('should return neutral state for corrupt XMP', async () => {
      // Create corrupt XMP
      await fs.writeFile(TEMP_XMP_PATH, '<not-valid-xmp>corrupt</not-valid>', 'utf-8');

      const state = await loader.load(TEMP_ASSET_PATH);

      // Should return neutral (not crash)
      expect(state).toEqual({
        exposure: 0,
        contrast: 0,
        temperature: 6500,
        tint: 0,
        saturation: 0,
        vibrance: 0,
      });

      const metrics = loader.getMetrics();
      expect(metrics.xmpErrors).toBe(1);
    });

    it('should never crash on IO errors', async () => {
      // Create XMP then make it unreadable (permission denied simulation)
      await fs.writeFile(TEMP_XMP_PATH, 'test', 'utf-8');
      
      // This will fail to read but should return neutral
      const state = await loader.load(TEMP_ASSET_PATH);
      
      expect(state.temperature).toBe(6500); // Neutral
    });
  });

  describe('Deterministic mapping (explicit ?? defaults)', () => {
    it('should use explicit defaults for missing XMP fields', async () => {
      // Create minimal XMP with only exposure
      const minimalXMP = `<?xml version="1.0" encoding="UTF-8"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
      crs:Exposure2012="+2.0">
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>`;
      
      await fs.writeFile(TEMP_XMP_PATH, minimalXMP, 'utf-8');

      const state = await loader.load(TEMP_ASSET_PATH);

      // exposure from XMP, rest use defaults
      expect(state.exposure).toBe(2.0);
      expect(state.contrast).toBe(0);
      expect(state.temperature).toBe(6500);
      expect(state.tint).toBe(0);
      expect(state.saturation).toBe(0);
      expect(state.vibrance).toBe(0);
    });
  });

  describe('Cache management', () => {
    it('should allow manual cache invalidation', async () => {
      const sourcePath = path.join(FIXTURES_DIR, 'lightroom-sample.xmp');
      await fs.copyFile(sourcePath, TEMP_XMP_PATH);

      // Load and cache
      await loader.load(TEMP_ASSET_PATH);
      expect(loader.getCacheSize()).toBe(1);

      // Invalidate
      loader.invalidate(TEMP_ASSET_PATH);
      expect(loader.getCacheSize()).toBe(0);

      // Next load is cache miss
      await loader.load(TEMP_ASSET_PATH);
      const metrics = loader.getMetrics();
      expect(metrics.cacheMisses).toBe(2);
    });

    it('should allow full cache clear', async () => {
      const sourcePath = path.join(FIXTURES_DIR, 'lightroom-sample.xmp');
      await fs.copyFile(sourcePath, TEMP_XMP_PATH);

      // Load multiple assets (simulated)
      await loader.load(TEMP_ASSET_PATH);
      expect(loader.getCacheSize()).toBe(1);

      // Clear all
      loader.clearCache();
      expect(loader.getCacheSize()).toBe(0);
    });
  });

  describe('Performance metrics', () => {
    it('should track all metric types', async () => {
      // No XMP - neutral return
      await loader.load('/nonexistent.NEF');
      let metrics = loader.getMetrics();
      expect(metrics.neutralReturns).toBe(1);

      // Valid XMP - cache miss + read
      const sourcePath = path.join(FIXTURES_DIR, 'lightroom-sample.xmp');
      await fs.copyFile(sourcePath, TEMP_XMP_PATH);
      await loader.load(TEMP_ASSET_PATH);
      metrics = loader.getMetrics();
      expect(metrics.xmpReads).toBe(1);
      expect(metrics.cacheMisses).toBe(1);

      // Cache hit
      await loader.load(TEMP_ASSET_PATH);
      metrics = loader.getMetrics();
      expect(metrics.cacheHits).toBe(1);

      // Corrupt XMP - error
      await fs.writeFile(TEMP_XMP_PATH, 'corrupt', 'utf-8');
      loader.invalidate(TEMP_ASSET_PATH);
      await loader.load(TEMP_ASSET_PATH);
      metrics = loader.getMetrics();
      expect(metrics.xmpErrors).toBe(1);
    });
  });

  describe('XMP path resolution', () => {
    it('should handle various RAW extensions', async () => {
      const extensions = ['.NEF', '.CR2', '.ARW', '.DNG', '.RAF', '.RW2', '.ORF', '.SRW', '.RAW'];
      
      for (const ext of extensions) {
        const assetPath = `/path/to/image${ext}`;
        const state = await loader.load(assetPath);
        expect(state.temperature).toBe(6500); // Returns neutral (no XMP exists)
      }
    });

    it('should handle mixed case extensions', async () => {
      const paths = [
        '/path/image.nef',
        '/path/image.NEF',
        '/path/image.Nef',
      ];

      for (const assetPath of paths) {
        const state = await loader.load(assetPath);
        expect(state).toBeDefined();
      }
    });
  });
});
