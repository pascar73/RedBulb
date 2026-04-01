/**
 * XMP Sidecar Adapter
 * 
 * Targeted adapter for reading/writing XMP sidecar files.
 * Preserves unknown tags by using surgical string replacements
 * instead of full XML parse/rebuild.
 * 
 * Supports:
 * - Adobe Lightroom (crs: namespace)
 * - Darktable (darktable: namespace)
 * - RedBulb custom namespace
 */

import fs from 'node:fs/promises';
import path from 'node:path';

export interface XMPEditData {
  exposure: number;      // -5.0 to +5.0
  contrast: number;      // -100 to +100
  temperature: number;   // 2000 to 50000
  tint: number;          // -150 to +150
  saturation: number;    // -100 to +100
  vibrance: number;      // -100 to +100
}

export interface XMPReadResult {
  data: Partial<XMPEditData>;
  hasRedbulbData: boolean;
  redbulbNodeGraph?: string;
}

const CRS_NAMESPACE = 'xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"';
const REDBULB_NAMESPACE = 'xmlns:redbulb="http://redbulb.io/xmp/1.0/"';

/**
 * Read XMP file and extract mapped fields
 */
export async function readXMP(filePath: string): Promise<XMPReadResult> {
  const content = await fs.readFile(filePath, 'utf-8');
  
  const result: XMPReadResult = {
    data: {},
    hasRedbulbData: content.includes('xmlns:redbulb'),
  };

  // Extract crs: namespace values
  const exposureMatch = content.match(/crs:Exposure2012="([^"]+)"/);
  if (exposureMatch) {
    result.data.exposure = parseFloat(exposureMatch[1]);
  }

  const contrastMatch = content.match(/crs:Contrast2012="([^"]+)"/);
  if (contrastMatch) {
    result.data.contrast = parseFloat(contrastMatch[1]);
  }

  const tempMatch = content.match(/crs:Temperature="([^"]+)"/);
  if (tempMatch) {
    result.data.temperature = parseFloat(tempMatch[1]);
  }

  const tintMatch = content.match(/crs:Tint="([^"]+)"/);
  if (tintMatch) {
    result.data.tint = parseFloat(tintMatch[1]);
  }

  const saturationMatch = content.match(/crs:Saturation="([^"]+)"/);
  if (saturationMatch) {
    result.data.saturation = parseFloat(saturationMatch[1]);
  }

  const vibranceMatch = content.match(/crs:Vibrance="([^"]+)"/);
  if (vibranceMatch) {
    result.data.vibrance = parseFloat(vibranceMatch[1]);
  }

  // Extract RedBulb node graph if present
  const nodeGraphMatch = content.match(/redbulb:nodeGraph="([^"]+)"/);
  if (nodeGraphMatch) {
    result.redbulbNodeGraph = nodeGraphMatch[1];
  }

  return result;
}

/**
 * Update XMP file with new values
 * Uses surgical string replacement to preserve unknown tags
 */
export async function updateXMP(
  filePath: string,
  editData: Partial<XMPEditData>,
  nodeGraph?: string
): Promise<void> {
  let content = await fs.readFile(filePath, 'utf-8');

  // Ensure RedBulb namespace exists
  if (!content.includes('xmlns:redbulb')) {
    // Add namespace to first rdf:Description tag
    content = content.replace(
      /(<rdf:Description[^>]*)/,
      `$1\n      ${REDBULB_NAMESPACE}`
    );
  }

  // Update or add mapped fields
  if (editData.exposure !== undefined) {
    content = updateOrAddAttribute(content, 'crs:Exposure2012', editData.exposure.toString());
  }

  if (editData.contrast !== undefined) {
    content = updateOrAddAttribute(content, 'crs:Contrast2012', editData.contrast.toString());
  }

  if (editData.temperature !== undefined) {
    content = updateOrAddAttribute(content, 'crs:Temperature', editData.temperature.toString());
  }

  if (editData.tint !== undefined) {
    content = updateOrAddAttribute(content, 'crs:Tint', editData.tint.toString());
  }

  if (editData.saturation !== undefined) {
    content = updateOrAddAttribute(content, 'crs:Saturation', editData.saturation.toString());
  }

  if (editData.vibrance !== undefined) {
    content = updateOrAddAttribute(content, 'crs:Vibrance', editData.vibrance.toString());
  }

  // Update RedBulb node graph
  if (nodeGraph !== undefined) {
    content = updateOrAddAttribute(content, 'redbulb:nodeGraph', nodeGraph);
  }

  // Atomic write: temp file + rename
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, content, 'utf-8');
  await fs.rename(tempPath, filePath);
}

/**
 * Update existing attribute or add new one
 * Preserves original formatting and position
 */
function updateOrAddAttribute(content: string, attrName: string, value: string): string {
  const pattern = new RegExp(`${attrName}="[^"]*"`);
  
  if (pattern.test(content)) {
    // Update existing attribute
    return content.replace(pattern, `${attrName}="${value}"`);
  } else {
    // Add new attribute after first rdf:Description tag
    return content.replace(
      /(<rdf:Description[^>]*)/,
      `$1\n      ${attrName}="${value}"`
    );
  }
}

/**
 * Validate XMP file structure (basic check)
 */
export async function validateXMP(filePath: string): Promise<boolean> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    
    // Basic structure checks
    return (
      content.includes('<?xml') &&
      content.includes('<x:xmpmeta') &&
      content.includes('<rdf:RDF') &&
      content.includes('</rdf:RDF>') &&
      content.includes('</x:xmpmeta>')
    );
  } catch {
    return false;
  }
}
