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
  });
});
