/**
 * DevelopState Migration Helper
 * 
 * Converts nested V1 DevelopState (basic/color/details/effects groups)
 * to flat canonical structure matching @redbulb/nem-core
 */

import type { DevelopState, DevelopStateV1 } from '../components/asset-viewer/editor/node-types';

/**
 * Migrate nested V1 DevelopState to flat canonical structure
 * 
 * Migration rules:
 * - DROP: version, brightness, caCorrection (web-only, not implemented)
 * - ADD: hue (default 0, was missing in web)
 * - MOVE: texture from effects → details
 * - FLATTEN: basic.* and color.* to top level
 * - KEEP: All other fields with direct mapping
 */
export function migrateNestedToFlat(v1: DevelopStateV1): DevelopState {
  return {
    // Tonal adjustments (from basic group)
    exposure: v1.basic.exposure,
    contrast: v1.basic.contrast,
    highlights: v1.basic.highlights,
    shadows: v1.basic.shadows,
    whites: v1.basic.whites,
    blacks: v1.basic.blacks,
    
    // Color adjustments (from color group)
    temperature: v1.color.temperature,
    tint: v1.color.tint,
    saturation: v1.color.saturation,
    vibrance: v1.color.vibrance,
    hue: 0, // Added: was missing in V1, neutral value
    
    // Detail adjustments (top-level for backward compat)
    clarity: v1.details.clarity,
    dehaze: v1.details.dehaze,
    
    // Optional details group
    details: {
      texture: v1.effects.texture, // MOVED from effects
      sharpness: v1.details.sharpness,
      noiseReduction: v1.details.noiseReduction,
      clarity: v1.details.clarity, // Duplicate for compatibility
    },
    
    // Optional effects group (texture removed)
    effects: {
      vignette: v1.effects.vignette,
      vignetteMidpoint: v1.effects.vignetteMidpoint,
      vignetteRoundness: v1.effects.vignetteRoundness,
      vignetteFeather: v1.effects.vignetteFeather,
      vignetteHighlights: v1.effects.vignetteHighlights,
      grain: v1.effects.grain,
      grainSize: v1.effects.grainSize,
      grainRoughness: v1.effects.grainRoughness,
      fade: v1.effects.fade,
    },
    
    // Curves and color wheels (unchanged structure)
    curves: v1.curves,
    curveEndpoints: v1.curveEndpoints,
    colorWheels: v1.colorWheels,
    hsl: v1.hsl,
    
    // Tone mapper (widened options)
    toneMapper: v1.toneMapper === 'filmic' ? 'filmic' : 'none',
  };
}

/**
 * Check if a state appears to be V1 (nested) format
 */
export function isDevelopStateV1(state: unknown): state is DevelopStateV1 {
  if (typeof state !== 'object' || state === null) return false;
  const s = state as Record<string, unknown>;
  return 'basic' in s && 'color' in s && 'details' in s && 'effects' in s;
}

/**
 * Auto-migrate: Detect format and convert if needed
 */
export function autoMigrateDevelopState(state: DevelopStateV1 | DevelopState): DevelopState {
  if (isDevelopStateV1(state)) {
    return migrateNestedToFlat(state);
  }
  return state as DevelopState;
}
