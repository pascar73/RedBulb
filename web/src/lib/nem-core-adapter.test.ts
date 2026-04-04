/**
 * nem-core-adapter.test.ts — Tests for web ↔ core DevelopState conversion
 */

import { describe, it, expect } from 'vitest';
import { webToCore, coreToWeb } from './nem-core-adapter';
import { createEmptyDevelopState } from './components/asset-viewer/editor/node-types';
import { createNeutralDevelopState } from '@redbulb/nem-core';

describe('nem-core-adapter', () => {
  describe('webToCore', () => {
    it('converts basic adjustments correctly', () => {
      const web = createEmptyDevelopState();
      web.basic.exposure = 1.5;
      web.basic.contrast = 20;
      web.basic.highlights = -10;
      
      const core = webToCore(web);
      
      expect(core.exposure).toBe(1.5);
      expect(core.contrast).toBe(20);
      expect(core.highlights).toBe(-10);
    });

    it('converts color adjustments correctly', () => {
      const web = createEmptyDevelopState();
      web.color.temperature = 5500;
      web.color.tint = 10;
      web.color.saturation = 15;
      web.color.vibrance = 5;
      
      const core = webToCore(web);
      
      expect(core.temperature).toBe(5500);
      expect(core.tint).toBe(10);
      expect(core.saturation).toBe(15);
      expect(core.vibrance).toBe(5);
    });

    it('converts details correctly', () => {
      const web = createEmptyDevelopState();
      web.details.clarity = 10;
      web.details.dehaze = 5;
      web.details.sharpness = 20;
      
      const core = webToCore(web);
      
      expect(core.clarity).toBe(10);
      expect(core.dehaze).toBe(5);
      expect(core.details?.sharpness).toBe(20);
    });

    it('converts texture from effects to details', () => {
      const web = createEmptyDevelopState();
      web.effects.texture = 15;
      
      const core = webToCore(web);
      
      expect(core.details?.texture).toBe(15);
    });

    it('converts effects correctly', () => {
      const web = createEmptyDevelopState();
      web.effects.vignette = 30;
      web.effects.grain = 10;
      
      const core = webToCore(web);
      
      expect(core.effects?.vignette).toBe(30);
      expect(core.effects?.grain).toBe(10);
    });
  });

  describe('coreToWeb', () => {
    it('converts basic adjustments correctly', () => {
      const core = createNeutralDevelopState();
      core.exposure = 1.5;
      core.contrast = 20;
      core.highlights = -10;
      
      const web = coreToWeb(core);
      
      expect(web.basic.exposure).toBe(1.5);
      expect(web.basic.contrast).toBe(20);
      expect(web.basic.highlights).toBe(-10);
    });

    it('converts color adjustments correctly', () => {
      const core = createNeutralDevelopState();
      core.temperature = 5500;
      core.tint = 10;
      core.saturation = 15;
      core.vibrance = 5;
      
      const web = coreToWeb(core);
      
      expect(web.color.temperature).toBe(5500);
      expect(web.color.tint).toBe(10);
      expect(web.color.saturation).toBe(15);
      expect(web.color.vibrance).toBe(5);
    });

    it('converts texture from details to effects', () => {
      const core = createNeutralDevelopState();
      core.details = { texture: 15 };
      
      const web = coreToWeb(core);
      
      expect(web.effects.texture).toBe(15);
    });

    it('provides default values for missing fields', () => {
      const core = createNeutralDevelopState();
      
      const web = coreToWeb(core);
      
      expect(web.version).toBe(1);
      expect(web.toneMapper).toBe('none');
      expect(web.curves.master).toEqual([]);
      expect(web.colorWheels.shadows).toEqual({ hue: 0, sat: 0, lum: 0 });
    });
  });

  describe('round-trip conversion', () => {
    it('preserves values through web → core → web', () => {
      const original = createEmptyDevelopState();
      original.basic.exposure = 1.5;
      original.color.temperature = 5500;
      original.details.clarity = 10;
      
      const core = webToCore(original);
      const roundTrip = coreToWeb(core);
      
      expect(roundTrip.basic.exposure).toBe(original.basic.exposure);
      expect(roundTrip.color.temperature).toBe(original.color.temperature);
      expect(roundTrip.details.clarity).toBe(original.details.clarity);
    });

    it('preserves all basic fields through round-trip', () => {
      const original = createEmptyDevelopState();
      original.basic.exposure = 2.0;
      original.basic.contrast = 30;
      original.basic.highlights = -20;
      original.basic.shadows = 15;
      original.basic.whites = 10;
      original.basic.blacks = -5;
      
      const roundTrip = coreToWeb(webToCore(original));
      
      expect(roundTrip.basic.exposure).toBe(2.0);
      expect(roundTrip.basic.contrast).toBe(30);
      expect(roundTrip.basic.highlights).toBe(-20);
      expect(roundTrip.basic.shadows).toBe(15);
      expect(roundTrip.basic.whites).toBe(10);
      expect(roundTrip.basic.blacks).toBe(-5);
    });

    it('preserves all color fields through round-trip', () => {
      const original = createEmptyDevelopState();
      original.color.temperature = 7500;
      original.color.tint = -10;
      original.color.saturation = 20;
      original.color.vibrance = 15;
      
      const roundTrip = coreToWeb(webToCore(original));
      
      expect(roundTrip.color.temperature).toBe(7500);
      expect(roundTrip.color.tint).toBe(-10);
      expect(roundTrip.color.saturation).toBe(20);
      expect(roundTrip.color.vibrance).toBe(15);
    });

    it('preserves effects through round-trip', () => {
      const original = createEmptyDevelopState();
      original.effects.vignette = 40;
      original.effects.vignetteMidpoint = 60;
      original.effects.grain = 15;
      original.effects.grainSize = 30;
      
      const roundTrip = coreToWeb(webToCore(original));
      
      expect(roundTrip.effects.vignette).toBe(40);
      expect(roundTrip.effects.vignetteMidpoint).toBe(60);
      expect(roundTrip.effects.grain).toBe(15);
      expect(roundTrip.effects.grainSize).toBe(30);
    });

    it('preserves core → web → core conversion', () => {
      const original = createNeutralDevelopState();
      original.exposure = 1.5;
      original.temperature = 5500;
      original.clarity = 10;
      original.effects = { vignette: 30, grain: 10 };
      
      const roundTrip = webToCore(coreToWeb(original));
      
      expect(roundTrip.exposure).toBe(original.exposure);
      expect(roundTrip.temperature).toBe(original.temperature);
      expect(roundTrip.clarity).toBe(original.clarity);
      expect(roundTrip.effects?.vignette).toBe(30);
      expect(roundTrip.effects?.grain).toBe(10);
    });
  });

  describe('optional fields behavior', () => {
    it('handles missing optional fields in web state', () => {
      const web = createEmptyDevelopState();
      web.basic.exposure = 1.0;
      // Web always initializes curves, colorWheels with defaults
      
      const core = webToCore(web);
      
      expect(core.exposure).toBe(1.0);
      // Web state always has curves/colorWheels (empty/neutral), so they're passed through
      expect(core.curves).toBeDefined();
      expect(core.colorWheels).toBeDefined();
    });

    it('handles missing optional fields in core state', () => {
      const core = createNeutralDevelopState();
      core.exposure = 1.0;
      // No curves, colorWheels, details, effects
      
      const web = coreToWeb(core);
      
      expect(web.basic.exposure).toBe(1.0);
      // Web always has defaults for optional groups
      expect(web.curves).toBeDefined();
      expect(web.colorWheels).toBeDefined();
    });

    it('preserves curves when present', () => {
      const web = createEmptyDevelopState();
      web.curves.master = [
        { x: 0, y: 0 },
        { x: 0.5, y: 0.6 },
        { x: 1, y: 1 },
      ];
      
      const core = webToCore(web);
      
      expect(core.curves?.master).toHaveLength(3);
      expect(core.curves?.master?.[1]).toEqual({ x: 0.5, y: 0.6 });
    });

    it('preserves curveEndpoints when present', () => {
      const web = createEmptyDevelopState();
      web.curveEndpoints.master.black = { x: 0.1, y: 0.05 };
      web.curveEndpoints.master.white = { x: 0.9, y: 0.95 };
      
      const core = webToCore(web);
      
      expect(core.curveEndpoints?.master?.black).toEqual({ x: 0.1, y: 0.05 });
      expect(core.curveEndpoints?.master?.white).toEqual({ x: 0.9, y: 0.95 });
    });

    it('preserves colorWheels when present', () => {
      const web = createEmptyDevelopState();
      web.colorWheels.shadows = { hue: 10, sat: 5, lum: -3 };
      web.colorWheels.highlights = { hue: -5, sat: 8, lum: 2 };
      
      const core = webToCore(web);
      
      expect(core.colorWheels?.shadows).toEqual({ hue: 10, sat: 5, lum: -3 });
      expect(core.colorWheels?.highlights).toEqual({ hue: -5, sat: 8, lum: 2 });
    });

    it('preserves hsl when present', () => {
      const core = createNeutralDevelopState();
      core.hsl = {
        red: { h: 10, s: 5, l: -2 },
        blue: { h: -5, s: 3, l: 1 },
      };
      
      const web = coreToWeb(core);
      
      expect(web.hsl.red).toEqual({ h: 10, s: 5, l: -2 });
      expect(web.hsl.blue).toEqual({ h: -5, s: 3, l: 1 });
    });
  });

  describe('toneMapper behavior', () => {
    it('converts toneMapper values correctly', () => {
      const web = createEmptyDevelopState();
      web.toneMapper = 'aces';
      
      const core = webToCore(web);
      
      expect(core.toneMapper).toBe('aces');
    });

    it('handles all toneMapper options', () => {
      const options: Array<'none' | 'aces' | 'reinhard' | 'filmic' | 'uncharted'> = [
        'none',
        'aces',
        'reinhard',
        'filmic',
        'uncharted',
      ];
      
      options.forEach((mapper) => {
        const web = createEmptyDevelopState();
        web.toneMapper = mapper;
        
        const core = webToCore(web);
        
        expect(core.toneMapper).toBe(mapper);
      });
    });

    it('preserves toneMapper through round-trip', () => {
      const original = createEmptyDevelopState();
      original.toneMapper = 'filmic';
      
      const roundTrip = coreToWeb(webToCore(original));
      
      expect(roundTrip.toneMapper).toBe('filmic');
    });
  });

  describe('edge numeric values', () => {
    it('handles extreme exposure values', () => {
      const web = createEmptyDevelopState();
      web.basic.exposure = -5.0; // Min
      
      const core = webToCore(web);
      expect(core.exposure).toBe(-5.0);
      
      web.basic.exposure = 5.0; // Max
      const core2 = webToCore(web);
      expect(core2.exposure).toBe(5.0);
    });

    it('handles extreme contrast values', () => {
      const web = createEmptyDevelopState();
      web.basic.contrast = -100; // Min
      
      const core = webToCore(web);
      expect(core.contrast).toBe(-100);
      
      web.basic.contrast = 100; // Max
      const core2 = webToCore(web);
      expect(core2.contrast).toBe(100);
    });

    it('handles extreme temperature values', () => {
      const web = createEmptyDevelopState();
      web.color.temperature = 2000; // Min
      
      const core = webToCore(web);
      expect(core.temperature).toBe(2000);
      
      web.color.temperature = 50000; // Max
      const core2 = webToCore(web);
      expect(core2.temperature).toBe(50000);
    });

    it('handles negative tint values', () => {
      const web = createEmptyDevelopState();
      web.color.tint = -150; // Min
      
      const core = webToCore(web);
      expect(core.tint).toBe(-150);
      
      web.color.tint = 150; // Max
      const core2 = webToCore(web);
      expect(core2.tint).toBe(150);
    });

    it('handles zero values correctly', () => {
      const web = createEmptyDevelopState();
      web.basic.exposure = 0;
      web.basic.contrast = 0;
      web.color.saturation = 0;
      
      const core = webToCore(web);
      
      expect(core.exposure).toBe(0);
      expect(core.contrast).toBe(0);
      expect(core.saturation).toBe(0);
    });

    it('handles curve points outside [0,1] range', () => {
      const web = createEmptyDevelopState();
      web.curveEndpoints.master.black = { x: 0.1, y: -0.05 }; // y < 0
      web.curveEndpoints.master.white = { x: 0.9, y: 1.1 }; // y > 1
      
      const core = webToCore(web);
      
      // No clamping during conversion (preserves extended range)
      expect(core.curveEndpoints?.master?.black?.y).toBe(-0.05);
      expect(core.curveEndpoints?.master?.white?.y).toBe(1.1);
    });

    it('handles fractional values precisely', () => {
      const web = createEmptyDevelopState();
      web.basic.exposure = 1.23456;
      web.color.temperature = 5432.1;
      
      const core = webToCore(web);
      
      expect(core.exposure).toBeCloseTo(1.23456, 5);
      expect(core.temperature).toBeCloseTo(5432.1, 1);
    });
  });

  describe('texture/details mapping edge cases', () => {
    it('handles texture=0 correctly', () => {
      const web = createEmptyDevelopState();
      web.effects.texture = 0; // Zero should still be mapped
      
      const core = webToCore(web);
      
      expect(core.details?.texture).toBe(0);
    });

    it('handles negative texture values', () => {
      const web = createEmptyDevelopState();
      web.effects.texture = -50;
      
      const core = webToCore(web);
      
      expect(core.details?.texture).toBe(-50);
    });

    it('handles maximum texture value', () => {
      const web = createEmptyDevelopState();
      web.effects.texture = 100;
      
      const core = webToCore(web);
      
      expect(core.details?.texture).toBe(100);
    });

    it('preserves other details fields when mapping texture', () => {
      const web = createEmptyDevelopState();
      web.effects.texture = 15;
      web.details.sharpness = 20;
      web.details.noiseReduction = 10;
      
      const core = webToCore(web);
      
      expect(core.details?.texture).toBe(15);
      expect(core.details?.sharpness).toBe(20);
      expect(core.details?.noiseReduction).toBe(10);
    });

    it('handles reverse texture mapping (core → web)', () => {
      const core = createNeutralDevelopState();
      core.details = { texture: 25, sharpness: 15 };
      
      const web = coreToWeb(core);
      
      expect(web.effects.texture).toBe(25);
      expect(web.details.sharpness).toBe(15);
    });
  });
});
