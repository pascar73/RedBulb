/**
 * nem-core-adapter.ts — Temporary adapter for web client ↔ @redbulb/nem-core
 * 
 * Web client now uses flat DevelopState structure (matching @redbulb/nem-core)
 * This adapter provides auto-migration for backward compatibility and minimal
 * transformation for format differences.
 * 
 * @deprecated TEMPORARY - Remove after full migration confirmed (target: Phase 3 Day 4)
 * @see ADAPTER-REMOVAL-TICKET.md
 * @see ADAPTER-TOUCHPOINTS.md
 */

import type { DevelopState as WebDevelopState, DevelopStateV1 } from './components/asset-viewer/editor/node-types';
import type { DevelopState as CoreDevelopState } from '@redbulb/nem-core';
import { autoMigrateDevelopState, isDevelopStateV1 } from './migration/migrate-develop-state';

/**
 * Convert web client DevelopState to NEM core format
 * Auto-migrates V1 nested format to flat if needed
 * 
 * @deprecated TEMPORARY - Remove after Phase 3 migration
 */
export function webToCore(web: WebDevelopState | DevelopStateV1): CoreDevelopState {
  // Auto-migrate V1 nested format to flat
  const flat = isDevelopStateV1(web) ? autoMigrateDevelopState(web) : web;
  
  return {
    // 13 top-level scalars
    exposure: flat.exposure,
    contrast: flat.contrast,
    highlights: flat.highlights,
    shadows: flat.shadows,
    whites: flat.whites,
    blacks: flat.blacks,
    temperature: flat.temperature,
    tint: flat.tint,
    saturation: flat.saturation,
    vibrance: flat.vibrance,
    hue: flat.hue ?? 0,
    clarity: flat.clarity,
    dehaze: flat.dehaze,
    
    // Optional groups
    details: flat.details,
    effects: flat.effects,
    
    // Curves and color wheels
    curves: flat.curves,
    curveEndpoints: flat.curveEndpoints,
    colorWheels: flat.colorWheels,
    hsl: flat.hsl,
    
    // Tone mapper
    toneMapper: flat.toneMapper,
  };
}

/**
 * Convert NEM core DevelopState to web client format
 * Both are now flat, so this is mostly pass-through
 * 
 * @deprecated TEMPORARY - Remove after Phase 3 migration
 */
export function coreToWeb(core: CoreDevelopState): WebDevelopState {
  return {
    // 13 top-level scalars
    exposure: core.exposure,
    contrast: core.contrast,
    highlights: core.highlights,
    shadows: core.shadows,
    whites: core.whites,
    blacks: core.blacks,
    temperature: core.temperature,
    tint: core.tint,
    saturation: core.saturation,
    vibrance: core.vibrance,
    hue: core.hue ?? 0,
    clarity: core.clarity,
    dehaze: core.dehaze,
    
    // Optional groups
    details: core.details,
    effects: core.effects,
    
    // Curves and color wheels
    curves: core.curves,
    curveEndpoints: core.curveEndpoints,
    colorWheels: core.colorWheels,
    hsl: core.hsl,
    
    // Tone mapper
    toneMapper: core.toneMapper,
  };
}
