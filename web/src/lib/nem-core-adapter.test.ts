/**
 * nem-core-adapter.test.ts — Tests for web ↔ core DevelopState conversion
 */

import { describe, it, expect } from 'vitest';
import { webToCore, coreToWeb } from './nem-core-adapter';
import { createEmptyDevelopState } from './components/asset-viewer/editor/node-types';
import { createNeutralDevelopState } from '@redbulb/nem-core';

describe('nem-core-adapter', () => {
  describe('webToCore', () => {
    it('converts tonal adjustments correctly', () => {
      const web = createEmptyDevelopState();
      web.exposure = 1.5;
      web.contrast = 20;
      web.highlights = -10;
      
      const core = webToCore(web);
      
      expect(core.exposure).toBe(1.5);
      expect(core.contrast).toBe(20);
      expect(core.highlights).toBe(-10);
    });

    it('converts color adjustments correctly', () => {
      const web = createEmptyDevelopState();
      web.temperature = 5500;
      web.tint = 10;
      web.saturation = 15;
      web.vibrance = 5;
      web.hue = 5;
      
      const core = webToCore(web);
      
      expect(core.temperature).toBe(5500);
      expect(core.tint).toBe(10);
      expect(core.saturation).toBe(15);
      expect(core.vibrance).toBe(5);
      expect(core.hue).toBe(5);
    });

    it('converts details correctly', () => {
      const web = createEmptyDevelopState();
      web.clarity = 10;
      web.dehaze = 5;
      web.details = { sharpness: 20, noiseReduction: 10, clarity: 10, texture: 0 };
      
      const core = webToCore(web);
      
      expect(core.clarity).toBe(10);
      expect(core.dehaze).toBe(5);
      expect(core.details?.sharpness).toBe(20);
    });

    it('converts texture in details', () => {
      const web = createEmptyDevelopState();
      web.details = { texture: 15, sharpness: 0, noiseReduction: 0, clarity: 0 };
      
      const core = webToCore(web);
      
      expect(core.details?.texture).toBe(15);
    });

    it('converts effects correctly', () => {
      const web = createEmptyDevelopState();
      web.effects = { vignette: 30, grain: 10, vignetteMidpoint: 50, vignetteRoundness: 0, vignetteFeather: 50, vignetteHighlights: 0, grainSize: 25, grainRoughness: 50, fade: 0 };
      
      const core = webToCore(web);
      
      expect(core.effects?.vignette).toBe(30);
      expect(core.effects?.grain).toBe(10);
    });
  });

  describe('coreToWeb', () => {
    it('converts tonal adjustments correctly', () => {
      const core = createNeutralDevelopState();
      core.exposure = 1.5;
      core.contrast = 20;
      core.highlights = -10;
      
      const web = coreToWeb(core);
      
      expect(web.exposure).toBe(1.5);
      expect(web.contrast).toBe(20);
      expect(web.highlights).toBe(-10);
    });

    it('converts color adjustments correctly', () => {
      const core = createNeutralDevelopState();
      core.temperature = 5500;
      core.tint = 10;
      core.saturation = 15;
      core.vibrance = 5;
      core.hue = 5;
      
      const web = coreToWeb(core);
      
      expect(web.temperature).toBe(5500);
      expect(web.tint).toBe(10);
      expect(web.saturation).toBe(15);
      expect(web.vibrance).toBe(5);
      expect(web.hue).toBe(5);
    });

    it('converts details correctly', () => {
      const core = createNeutralDevelopState();
      core.clarity = 10;
      core.dehaze = 5;
      core.details = { sharpness: 20, noiseReduction: 10, clarity: 10, texture: 0 };
      
      const web = coreToWeb(core);
      
      expect(web.clarity).toBe(10);
      expect(web.dehaze).toBe(5);
      expect(web.details?.sharpness).toBe(20);
    });

    it('round-trips correctly', () => {
      const original = createEmptyDevelopState();
      original.exposure = 1.5;
      original.contrast = 20;
      original.temperature = 5500;
      original.details = { texture: 15, sharpness: 10, noiseReduction: 5, clarity: 5 };
      
      const core = webToCore(original);
      const roundTrip = coreToWeb(core);
      
      expect(roundTrip.exposure).toBe(1.5);
      expect(roundTrip.contrast).toBe(20);
      expect(roundTrip.temperature).toBe(5500);
      expect(roundTrip.details?.texture).toBe(15);
    });
  });
});
