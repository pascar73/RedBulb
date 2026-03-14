/**
 * Uniform Buffer Helper for RapidRAW Adjustments
 * 
 * Packs develop parameters into a correctly-aligned Float32Array
 * matching the WGSL struct layout.
 * 
 * For MVP: simplified 7-parameter struct with 16-byte alignment
 * Future: full GlobalAdjustments struct with curves, HSL, color grading, etc.
 */

export interface DevelopParams {
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  brightness: number;
}

/**
 * Pack develop parameters into GPU uniform buffer format
 * 
 * Struct layout (simplified MVP):
 * - exposure: f32 (offset 0)
 * - contrast: f32 (offset 4)
 * - highlights: f32 (offset 8)
 * - shadows: f32 (offset 12)
 * - whites: f32 (offset 16)
 * - blacks: f32 (offset 20)
 * - brightness: f32 (offset 24)
 * - _pad: f32 (offset 28) - ensures 16-byte alignment
 */
export function packUniformBuffer(params: DevelopParams): Float32Array {
  return new Float32Array([
    params.exposure,
    params.contrast,
    params.highlights,
    params.shadows,
    params.whites,
    params.blacks,
    params.brightness,
    0.0  // padding for 16-byte alignment
  ]);
}

/**
 * Get default/neutral adjustment values
 */
export function getDefaultParams(): DevelopParams {
  return {
    exposure: 0.0,
    contrast: 0.0,
    highlights: 0.0,
    shadows: 0.0,
    whites: 0.0,
    blacks: 0.0,
    brightness: 0.0
  };
}

/**
 * Future: Full GlobalAdjustments struct packer
 * 
 * This would handle:
 * - All ~40+ adjustment parameters
 * - Curve arrays (16 points × 4 channels, identity/passthrough)
 * - HSL array (8 entries, all zeros)
 * - Color grading structs (shadows, midtones, highlights)
 * - Color calibration
 * - Proper padding for mat3x3 and other complex types
 * 
 * Total size: ~1KB+ with all padding
 */
export function packFullUniformBuffer(params: DevelopParams): Float32Array {
  // TODO: Implement full struct when integrating shader-full.wgsl
  // For now, delegate to simplified version
  return packUniformBuffer(params);
}
