/**
 * nem-core-adapter.ts — Temporary adapter for web client ↔ @redbulb/nem-core
 * 
 * Web client uses nested DevelopState structure (basic: {}, color: {}, etc.)
 * NEM core uses flat DevelopState structure (exposure, temperature, etc.)
 * 
 * This adapter provides bidirectional conversion until type unification is complete.
 * 
 * TODO Phase 1 - Block 2: Unify web/server DevelopState types, remove this adapter
 */

import type { DevelopState as WebDevelopState } from './components/asset-viewer/editor/node-types';
import type { DevelopState as CoreDevelopState } from '@redbulb/nem-core';

/**
 * Convert web client nested DevelopState to NEM core flat structure
 */
export function webToCore(web: WebDevelopState): CoreDevelopState {
  return {
    // Basic adjustments
    exposure: web.basic.exposure,
    contrast: web.basic.contrast,
    highlights: web.basic.highlights,
    shadows: web.basic.shadows,
    whites: web.basic.whites,
    blacks: web.basic.blacks,
    
    // Color adjustments
    temperature: web.color.temperature,
    tint: web.color.tint,
    saturation: web.color.saturation,
    vibrance: web.color.vibrance,
    hue: 0, // Not in web client yet
    
    // Details
    clarity: web.details.clarity,
    dehaze: web.details.dehaze,
    
    // Curves
    curves: web.curves,
    curveEndpoints: web.curveEndpoints,
    
    // Color wheels
    colorWheels: web.colorWheels,
    
    // HSL
    hsl: web.hsl,
    
    // Effects (map web fields to core)
    effects: {
      vignette: web.effects.vignette,
      vignetteMidpoint: web.effects.vignetteMidpoint,
      vignetteRoundness: web.effects.vignetteRoundness,
      vignetteFeather: web.effects.vignetteFeather,
      vignetteHighlights: web.effects.vignetteHighlights,
      grain: web.effects.grain,
      grainSize: web.effects.grainSize,
      grainRoughness: web.effects.grainRoughness,
      fade: web.effects.fade,
    },
    
    // Details (additional fields)
    details: {
      texture: web.effects.texture, // Web stores texture in effects
      sharpness: web.details.sharpness,
      noiseReduction: web.details.noiseReduction,
      clarity: web.details.clarity,
    },
    
    // Tone mapper (pass through directly)
    toneMapper: web.toneMapper,
  };
}

/**
 * Convert NEM core flat DevelopState to web client nested structure
 */
export function coreToWeb(core: CoreDevelopState): WebDevelopState {
  return {
    version: 1,
    basic: {
      exposure: core.exposure,
      contrast: core.contrast,
      highlights: core.highlights,
      shadows: core.shadows,
      whites: core.whites,
      blacks: core.blacks,
      brightness: 0, // Not in core yet
    },
    color: {
      saturation: core.saturation,
      temperature: core.temperature,
      tint: core.tint,
      vibrance: core.vibrance,
    },
    // Web only supports 'none' | 'filmic', filter core values
    toneMapper: (core.toneMapper === 'filmic' ? 'filmic' : 'none') as 'none' | 'filmic',
    details: {
      sharpness: core.details?.sharpness || 0,
      noiseReduction: core.details?.noiseReduction || 0,
      clarity: core.clarity,
      dehaze: core.dehaze,
      caCorrection: 0, // Not in core yet
    },
    effects: {
      texture: core.details?.texture || 0, // Core stores texture in details
      vignette: core.effects?.vignette || 0,
      vignetteMidpoint: core.effects?.vignetteMidpoint || 0,
      vignetteRoundness: core.effects?.vignetteRoundness || 0,
      vignetteFeather: core.effects?.vignetteFeather || 0,
      vignetteHighlights: core.effects?.vignetteHighlights || 0,
      grain: core.effects?.grain || 0,
      grainSize: core.effects?.grainSize || 0,
      grainRoughness: core.effects?.grainRoughness || 0,
      fade: core.effects?.fade || 0,
    },
    curves: {
      master: core.curves?.master || [],
      red: core.curves?.red || [],
      green: core.curves?.green || [],
      blue: core.curves?.blue || [],
    },
    curveEndpoints: {
      master: core.curveEndpoints?.master || { black: { x: 0, y: 0 }, white: { x: 1, y: 1 } },
      red: core.curveEndpoints?.red || { black: { x: 0, y: 0 }, white: { x: 1, y: 1 } },
      green: core.curveEndpoints?.green || { black: { x: 0, y: 0 }, white: { x: 1, y: 1 } },
      blue: core.curveEndpoints?.blue || { black: { x: 0, y: 0 }, white: { x: 1, y: 1 } },
    },
    colorWheels: {
      shadows: core.colorWheels?.shadows || { hue: 0, sat: 0, lum: 0 },
      midtones: core.colorWheels?.midtones || { hue: 0, sat: 0, lum: 0 },
      highlights: core.colorWheels?.highlights || { hue: 0, sat: 0, lum: 0 },
    },
    hsl: core.hsl || {},
  };
}
