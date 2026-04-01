import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { readXMP, updateXMP, validateXMP, type XMPEditData } from './xmp-sidecar-adapter';

const FIXTURES_DIR = path.join(__dirname, '../../test/fixtures/xmp');
const TEMP_TEST_FILE = path.join(FIXTURES_DIR, 'test-temp.xmp');

describe('XMP Sidecar Adapter', () => {
  afterEach(async () => {
    // Clean up temp files
    try {
      await fs.unlink(TEMP_TEST_FILE);
    } catch {
      // Ignore if doesn't exist
    }
  });

  describe('readXMP', () => {
    it('should read Lightroom XMP sample and extract mapped fields', async () => {
      const filePath = path.join(FIXTURES_DIR, 'lightroom-sample.xmp');
      const result = await readXMP(filePath);

      expect(result.data.exposure).toBe(0.50);
      expect(result.data.contrast).toBe(25);
      expect(result.data.temperature).toBe(5500);
      expect(result.data.tint).toBe(10);
      expect(result.data.saturation).toBe(0);
      expect(result.data.vibrance).toBe(15);
      expect(result.hasRedbulbData).toBe(false);
    });

    it('should handle Darktable XMP (v1: read-only, no crs: mapping)', async () => {
      const filePath = path.join(FIXTURES_DIR, 'darktable-sample.xmp');
      const result = await readXMP(filePath);

      // Darktable v1 contract: READ-ONLY, no crs: field mapping
      expect(result.data.exposure).toBeUndefined();
      expect(result.data.contrast).toBeUndefined();
      expect(result.data.temperature).toBeUndefined();
      expect(result.hasRedbulbData).toBe(false);
    });
  });

  describe('updateXMP', () => {
    it('should update existing fields and preserve unknown tags (round-trip)', async () => {
      // Copy sample file to temp location
      const sourcePath = path.join(FIXTURES_DIR, 'lightroom-sample.xmp');
      await fs.copyFile(sourcePath, TEMP_TEST_FILE);

      // Read original content for comparison
      const originalContent = await fs.readFile(TEMP_TEST_FILE, 'utf-8');
      const originalLines = originalContent.split('\n').length;

      // Update values
      const editData: Partial<XMPEditData> = {
        exposure: 1.25,
        contrast: -10,
        temperature: 6500,
        tint: -5,
        saturation: 20,
        vibrance: 30,
      };

      await updateXMP(TEMP_TEST_FILE, editData, 'test-node-graph-base64');

      // Read back and verify
      const result = await readXMP(TEMP_TEST_FILE);
      expect(result.data.exposure).toBe(1.25);
      expect(result.data.contrast).toBe(-10);
      expect(result.data.temperature).toBe(6500);
      expect(result.data.tint).toBe(-5);
      expect(result.data.saturation).toBe(20);
      expect(result.data.vibrance).toBe(30);
      expect(result.redbulbNodeGraph).toBe('test-node-graph-base64');

      // Verify unknown fields preserved (semantic, not byte-for-byte document)
      const updatedContent = await fs.readFile(TEMP_TEST_FILE, 'utf-8');
      const updatedLines = updatedContent.split('\n').length;

      // Line count should be similar (within ±5 for namespace/attribute additions)
      expect(Math.abs(updatedLines - originalLines)).toBeLessThan(5);

      // Check that unknown Lightroom fields still exist
      expect(updatedContent).toContain('crs:Highlights2012');
      expect(updatedContent).toContain('crs:Shadows2012');
      expect(updatedContent).toContain('crs:Sharpness');
      expect(updatedContent).toContain('crs:ToneCurvePV2012');
      expect(updatedContent).toContain('xmlns:redbulb');
    });

    it('should add fields if they do not exist', async () => {
      // Copy Darktable sample (doesn't have crs: fields)
      const sourcePath = path.join(FIXTURES_DIR, 'darktable-sample.xmp');
      await fs.copyFile(sourcePath, TEMP_TEST_FILE);

      const editData: Partial<XMPEditData> = {
        exposure: 0.75,
        temperature: 5000,
      };

      await updateXMP(TEMP_TEST_FILE, editData);

      const result = await readXMP(TEMP_TEST_FILE);
      expect(result.data.exposure).toBe(0.75);
      expect(result.data.temperature).toBe(5000);

      // Verify Darktable-specific fields preserved
      const content = await fs.readFile(TEMP_TEST_FILE, 'utf-8');
      expect(content).toContain('darktable:xmp_version');
      expect(content).toContain('darktable:history');
    });

    it('should use atomic write (temp file + rename)', async () => {
      const sourcePath = path.join(FIXTURES_DIR, 'lightroom-sample.xmp');
      await fs.copyFile(sourcePath, TEMP_TEST_FILE);

      const editData: Partial<XMPEditData> = { exposure: 2.0 };

      // Verify temp file doesn't exist before
      const tempPath = `${TEMP_TEST_FILE}.tmp`;
      await expect(fs.access(tempPath)).rejects.toThrow();

      await updateXMP(TEMP_TEST_FILE, editData);

      // Verify temp file cleaned up after
      await expect(fs.access(tempPath)).rejects.toThrow();

      // Verify target file updated
      const result = await readXMP(TEMP_TEST_FILE);
      expect(result.data.exposure).toBe(2.0);
    });
  });

  describe('validateXMP', () => {
    it('should validate correct XMP structure', async () => {
      const filePath = path.join(FIXTURES_DIR, 'lightroom-sample.xmp');
      const isValid = await validateXMP(filePath);
      expect(isValid).toBe(true);
    });

    it('should reject invalid XMP structure', async () => {
      // Create corrupt file
      await fs.writeFile(TEMP_TEST_FILE, '<not-valid-xmp></not-valid-xmp>', 'utf-8');
      
      const isValid = await validateXMP(TEMP_TEST_FILE);
      expect(isValid).toBe(false);
    });

    it('should handle missing file safely', async () => {
      const isValid = await validateXMP('/does/not/exist.xmp');
      expect(isValid).toBe(false);
    });
  });

  describe('XML escaping safety', () => {
    it('should safely encode node graph with special characters', async () => {
      const sourcePath = path.join(FIXTURES_DIR, 'lightroom-sample.xmp');
      await fs.copyFile(sourcePath, TEMP_TEST_FILE);

      // Node graph with XML-unsafe characters
      const unsafeNodeGraph = 'data with "quotes" & <tags> and \'apostrophes\'';
      
      await updateXMP(TEMP_TEST_FILE, {}, unsafeNodeGraph);

      // Should read back correctly (unescaped)
      const result = await readXMP(TEMP_TEST_FILE);
      expect(result.redbulbNodeGraph).toBe(unsafeNodeGraph);

      // Verify it's properly escaped in raw XML
      const content = await fs.readFile(TEMP_TEST_FILE, 'utf-8');
      expect(content).toContain('&quot;');
      expect(content).toContain('&amp;');
      expect(content).toContain('&lt;');
      expect(content).toContain('&gt;');
    });
  });

  describe('semantic field preservation', () => {
    it('should preserve unmapped field values unchanged', async () => {
      const sourcePath = path.join(FIXTURES_DIR, 'lightroom-sample.xmp');
      await fs.copyFile(sourcePath, TEMP_TEST_FILE);

      const originalContent = await fs.readFile(TEMP_TEST_FILE, 'utf-8');
      
      // Extract a specific unmapped attribute value
      const sharpnessMatch = originalContent.match(/crs:Sharpness="([^"]+)"/);
      expect(sharpnessMatch).toBeTruthy();
      const originalSharpness = sharpnessMatch![1];

      // Update only exposure
      await updateXMP(TEMP_TEST_FILE, { exposure: 1.5 });

      const updatedContent = await fs.readFile(TEMP_TEST_FILE, 'utf-8');
      const updatedSharpnessMatch = updatedContent.match(/crs:Sharpness="([^"]+)"/);
      
      // Unmapped field value should be preserved unchanged (semantic preservation)
      expect(updatedSharpnessMatch![1]).toBe(originalSharpness);
    });
  });
});
