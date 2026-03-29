import { type EditActions, type EditToolManager } from '$lib/managers/edit/edit-manager.svelte';
import type { AssetResponseDto } from '@immich/sdk';

class DevelopManager implements EditToolManager {
  // Basic adjustment parameters
  exposure = $state(0);
  contrast = $state(0);
  highlights = $state(0);
  shadows = $state(0);
  whites = $state(0);
  blacks = $state(0);
  brightness = $state(0);

  // Color adjustment parameters
  saturation = $state(0);
  temperature = $state(0);

  // Curve endpoints (black point / white point per channel)
  curveEndpoints = $state({
    master: { black: { x: 0, y: 0 }, white: { x: 1, y: 1 } },
    red: { black: { x: 0, y: 0 }, white: { x: 1, y: 1 } },
    green: { black: { x: 0, y: 0 }, white: { x: 1, y: 1 } },
    blue: { black: { x: 0, y: 0 }, white: { x: 1, y: 1 } },
  });

  // Eyedropper mode — when true, clicking the photo samples WB
  eyedropperActive = $state(false);

  // Details parameters
  sharpness = $state(0);
  noiseReduction = $state(0);
  clarity = $state(0);
  dehaze = $state(0);

  // Lens corrections
  caCorrection = $state(0);

  // Tone mapper: 'none' = standard, 'filmic' = AgX film-like
  toneMapper = $state<'none' | 'filmic'>('none');

  // Tone parameters
  vibrance = $state(0);
  tint = $state(0);

  // Effects parameters
  texture = $state(0);
  vignette = $state(0);
  vignetteMidpoint = $state(50);
  vignetteRoundness = $state(0);
  vignetteFeather = $state(50);
  vignetteHighlights = $state(0);
  grain = $state(0);
  grainSize = $state(25);
  grainRoughness = $state(50);
  fade = $state(0);

  // Geometry — perspective/distortion transforms (RapidRAW-style)
  geoRotation = $state(0);       // Fine rotation in degrees (-45 to +45)
  geoDistortion = $state(0);     // Barrel/pincushion (-100 to +100)
  geoVertical = $state(0);       // Vertical perspective / keystone (-100 to +100)
  geoHorizontal = $state(0);     // Horizontal perspective (-100 to +100)
  geoScale = $state(100);        // Scale after transform (50 to 200, default 100)

  // Tone curves - array of control points per channel
  curves = $state({
    master: [] as Array<{x: number, y: number}>,
    red: [] as Array<{x: number, y: number}>,
    green: [] as Array<{x: number, y: number}>,
    blue: [] as Array<{x: number, y: number}>,
  });

  // Color Wheels — 3-way color grading (shadows/midtones/highlights)
  colorWheels = $state({
    shadows: { hue: 0, sat: 0, lum: 0 },
    midtones: { hue: 0, sat: 0, lum: 0 },
    highlights: { hue: 0, sat: 0, lum: 0 },
  });

  // HSL adjustments per color channel
  hsl = $state({
    red: { h: 0, s: 0, l: 0 },
    orange: { h: 0, s: 0, l: 0 },
    yellow: { h: 0, s: 0, l: 0 },
    green: { h: 0, s: 0, l: 0 },
    aqua: { h: 0, s: 0, l: 0 },
    blue: { h: 0, s: 0, l: 0 },
    purple: { h: 0, s: 0, l: 0 },
    magenta: { h: 0, s: 0, l: 0 },
  });

  hasChanges = $derived.by(() => {
    // Check basic parameters
    const hasParamChanges = (
      this.exposure !== 0 ||
      this.contrast !== 0 ||
      this.highlights !== 0 ||
      this.shadows !== 0 ||
      this.whites !== 0 ||
      this.blacks !== 0 ||
      this.brightness !== 0 ||
      this.saturation !== 0 ||
      this.temperature !== 0 ||
      this.sharpness !== 0 ||
      this.noiseReduction !== 0 ||
      this.clarity !== 0 ||
      this.dehaze !== 0 ||
      this.caCorrection !== 0 ||
      this.toneMapper !== 'none' ||
      this.vibrance !== 0 ||
      this.tint !== 0 ||
      this.texture !== 0 ||
      this.vignette !== 0 ||
      this.vignetteMidpoint !== 50 ||
      this.vignetteRoundness !== 0 ||
      this.vignetteFeather !== 50 ||
      this.vignetteHighlights !== 0 ||
      this.grain !== 0 ||
      this.grainSize !== 25 ||
      this.grainRoughness !== 50 ||
      this.fade !== 0
    );

    // Check geometry
    const hasGeoChanges = (
      this.geoRotation !== 0 ||
      this.geoDistortion !== 0 ||
      this.geoVertical !== 0 ||
      this.geoHorizontal !== 0 ||
      this.geoScale !== 100
    );

    // Check curves (any channel has control points)
    const hasCurveChanges = (
      this.curves.master.length > 0 ||
      this.curves.red.length > 0 ||
      this.curves.green.length > 0 ||
      this.curves.blue.length > 0
    );

    // Check color wheels
    const hasColorWheelChanges = Object.values(this.colorWheels).some(
      w => w.hue !== 0 || w.sat !== 0 || w.lum !== 0
    );

    // Check curve endpoints
    const hasEndpointChanges = Object.values(this.curveEndpoints).some(
      ep => ep.black.x !== 0 || ep.black.y !== 0 || ep.white.x !== 1 || ep.white.y !== 1
    );

    // Check HSL (any channel has non-zero values)
    const hasHslChanges = Object.values(this.hsl).some(
      channel => channel.h !== 0 || channel.s !== 0 || channel.l !== 0
    );

    return hasParamChanges || hasCurveChanges || hasColorWheelChanges || hasHslChanges || hasEndpointChanges || hasGeoChanges;
  });

  canReset = $derived(this.hasChanges);

  edits = $derived.by(() => this.getEdits());

  // Reactive object for WebGPU rendering
  params = $derived.by(() => ({
    exposure: this.exposure,
    contrast: this.contrast,
    highlights: this.highlights,
    shadows: this.shadows,
    whites: this.whites,
    blacks: this.blacks,
    brightness: this.brightness,
    saturation: this.saturation,
    temperature: this.temperature,
    sharpness: this.sharpness,
    noiseReduction: this.noiseReduction,
    clarity: this.clarity,
    dehaze: this.dehaze,
    caCorrection: this.caCorrection,
    toneMapper: this.toneMapper,
    vibrance: this.vibrance,
    tint: this.tint,
    texture: this.texture,
    vignette: this.vignette,
    vignetteMidpoint: this.vignetteMidpoint,
    vignetteRoundness: this.vignetteRoundness,
    vignetteFeather: this.vignetteFeather,
    vignetteHighlights: this.vignetteHighlights,
    grain: this.grain,
    grainSize: this.grainSize,
    grainRoughness: this.grainRoughness,
    fade: this.fade,
    geoRotation: this.geoRotation,
    geoDistortion: this.geoDistortion,
    geoVertical: this.geoVertical,
    geoHorizontal: this.geoHorizontal,
    geoScale: this.geoScale,
    curves: this.curves,
    curveEndpoints: this.curveEndpoints,
    hsl: this.hsl,
    colorWheels: this.colorWheels
  }));

  async onActivate(asset: AssetResponseDto, edits: EditActions): Promise<void> {
    // Try localStorage first (in-session edits), then server (persisted XMP/history)
    const loaded = this.loadFromStorage(asset.id);
    if (!loaded) {
      await this.loadFromServer(asset.id);
    }
  }

  onDeactivate(): void {
    // No special deactivation needed
  }

  async resetAllChanges(): Promise<void> {
    this.exposure = 0;
    this.contrast = 0;
    this.highlights = 0;
    this.shadows = 0;
    this.whites = 0;
    this.blacks = 0;
    this.brightness = 0;
    this.saturation = 0;
    this.temperature = 0;
    this.sharpness = 0;
    this.noiseReduction = 0;
    this.clarity = 0;
    this.dehaze = 0;
    this.caCorrection = 0;
    this.toneMapper = 'none';
    this.vibrance = 0;
    this.tint = 0;
    this.texture = 0;
    this.vignette = 0;
    this.vignetteMidpoint = 50;
    this.vignetteRoundness = 0;
    this.vignetteFeather = 50;
    this.vignetteHighlights = 0;
    this.grain = 0;
    this.grainSize = 25;
    this.grainRoughness = 50;
    this.fade = 0;

    // Reset geometry
    this.geoRotation = 0;
    this.geoDistortion = 0;
    this.geoVertical = 0;
    this.geoHorizontal = 0;
    this.geoScale = 100;

    // Reset curves
    this.curves.master = [];
    this.curves.red = [];
    this.curves.green = [];
    this.curves.blue = [];

    // Reset curve endpoints
    this.curveEndpoints.master = { black: { x: 0, y: 0 }, white: { x: 1, y: 1 } };
    this.curveEndpoints.red = { black: { x: 0, y: 0 }, white: { x: 1, y: 1 } };
    this.curveEndpoints.green = { black: { x: 0, y: 0 }, white: { x: 1, y: 1 } };
    this.curveEndpoints.blue = { black: { x: 0, y: 0 }, white: { x: 1, y: 1 } };

    this.eyedropperActive = false;

    // Reset color wheels
    this.colorWheels.shadows = { hue: 0, sat: 0, lum: 0 };
    this.colorWheels.midtones = { hue: 0, sat: 0, lum: 0 };
    this.colorWheels.highlights = { hue: 0, sat: 0, lum: 0 };

    // Reset HSL
    Object.keys(this.hsl).forEach((channel) => {
      this.hsl[channel as keyof typeof this.hsl] = { h: 0, s: 0, l: 0 };
    });
  }

  /** Save current edits to localStorage for the given asset */
  saveToStorage(assetId: string): void {
    if (!assetId) return;
    const key = `redbulb-edits-${assetId}`;
    const data = this.serialize();
    if (!this.hasChanges) {
      // No changes — remove saved data
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, JSON.stringify(data));
  }

  /** Load saved edits from localStorage for the given asset. Returns true if found. */
  loadFromStorage(assetId: string): boolean {
    if (!assetId) return false;
    const key = `redbulb-edits-${assetId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    try {
      const data = JSON.parse(raw);
      this.deserialize(data);
      return true;
    } catch {
      return false;
    }
  }

  /** Load saved edits from server (history API). */
  async loadFromServer(assetId: string): Promise<boolean> {
    if (!assetId) return false;
    try {
      const baseUrl = `${window.location.protocol}//${window.location.hostname}:3380`;
      const res = await fetch(`${baseUrl}/api/assets/${assetId}/develop-history/current`);
      if (!res.ok) return false;
      const data = await res.json();
      if (data?.state && typeof data.state === 'object') {
        this.deserialize(data.state);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /** Check if an asset has saved edits */
  hasSavedEdits(assetId: string): boolean {
    if (!assetId) return false;
    return localStorage.getItem(`redbulb-edits-${assetId}`) !== null;
  }

  /** Delete saved edits for an asset */
  deleteSavedEdits(assetId: string): void {
    if (!assetId) return;
    localStorage.removeItem(`redbulb-edits-${assetId}`);
  }

  getEdits(): EditActions {
    return [];
  }

  /** Serialize all edit state to a plain JSON object for XMP storage */
  serialize(): Record<string, unknown> {
    return {
      version: 1,
      basic: {
        exposure: this.exposure,
        contrast: this.contrast,
        highlights: this.highlights,
        shadows: this.shadows,
        whites: this.whites,
        blacks: this.blacks,
        brightness: this.brightness,
      },
      color: {
        saturation: this.saturation,
        temperature: this.temperature,
        tint: this.tint,
        vibrance: this.vibrance,
      },
      toneMapper: this.toneMapper,
      details: {
        sharpness: this.sharpness,
        noiseReduction: this.noiseReduction,
        clarity: this.clarity,
        dehaze: this.dehaze,
        caCorrection: this.caCorrection,
      },
      effects: {
        texture: this.texture,
        vignette: this.vignette,
        vignetteMidpoint: this.vignetteMidpoint,
        vignetteRoundness: this.vignetteRoundness,
        vignetteFeather: this.vignetteFeather,
        vignetteHighlights: this.vignetteHighlights,
        grain: this.grain,
        grainSize: this.grainSize,
        grainRoughness: this.grainRoughness,
        fade: this.fade,
      },
      geometry: {
        rotation: this.geoRotation,
        distortion: this.geoDistortion,
        vertical: this.geoVertical,
        horizontal: this.geoHorizontal,
        scale: this.geoScale,
      },
      curves: JSON.parse(JSON.stringify(this.curves)),
      curveEndpoints: JSON.parse(JSON.stringify(this.curveEndpoints)),
      colorWheels: JSON.parse(JSON.stringify(this.colorWheels)),
      hsl: JSON.parse(JSON.stringify(this.hsl)),
    };
  }

  /** Restore all edit state from a serialized JSON object */
  deserialize(data: Record<string, unknown>): void {
    if (!data || typeof data !== 'object') return;
    const d = data as any;

    // Basic
    if (d.basic) {
      this.exposure = d.basic.exposure ?? 0;
      this.contrast = d.basic.contrast ?? 0;
      this.highlights = d.basic.highlights ?? 0;
      this.shadows = d.basic.shadows ?? 0;
      this.whites = d.basic.whites ?? 0;
      this.blacks = d.basic.blacks ?? 0;
      this.brightness = d.basic.brightness ?? 0;
    }

    // Color
    if (d.color) {
      this.saturation = d.color.saturation ?? 0;
      this.temperature = d.color.temperature ?? 0;
      this.tint = d.color.tint ?? 0;
      this.vibrance = d.color.vibrance ?? 0;
    }

    // Tone mapper
    this.toneMapper = d.toneMapper ?? 'none';

    // Details
    if (d.details) {
      this.sharpness = d.details.sharpness ?? 0;
      this.noiseReduction = d.details.noiseReduction ?? 0;
      this.clarity = d.details.clarity ?? 0;
      this.dehaze = d.details.dehaze ?? 0;
      this.caCorrection = d.details.caCorrection ?? 0;
    }

    // Effects
    if (d.effects) {
      this.texture = d.effects.texture ?? 0;
      this.vignette = d.effects.vignette ?? 0;
      this.vignetteMidpoint = d.effects.vignetteMidpoint ?? 50;
      this.vignetteRoundness = d.effects.vignetteRoundness ?? 0;
      this.vignetteFeather = d.effects.vignetteFeather ?? 50;
      this.vignetteHighlights = d.effects.vignetteHighlights ?? 0;
      this.grain = d.effects.grain ?? 0;
      this.grainSize = d.effects.grainSize ?? 25;
      this.grainRoughness = d.effects.grainRoughness ?? 50;
      this.fade = d.effects.fade ?? 0;
    }

    // Geometry
    if (d.geometry) {
      this.geoRotation = d.geometry.rotation ?? 0;
      this.geoDistortion = d.geometry.distortion ?? 0;
      this.geoVertical = d.geometry.vertical ?? 0;
      this.geoHorizontal = d.geometry.horizontal ?? 0;
      this.geoScale = d.geometry.scale ?? 100;
    }

    // Curves
    if (d.curves) {
      this.curves.master = d.curves.master ?? [];
      this.curves.red = d.curves.red ?? [];
      this.curves.green = d.curves.green ?? [];
      this.curves.blue = d.curves.blue ?? [];
    }

    // Curve endpoints
    if (d.curveEndpoints) {
      const defEp = { black: { x: 0, y: 0 }, white: { x: 1, y: 1 } };
      this.curveEndpoints.master = d.curveEndpoints.master ?? defEp;
      this.curveEndpoints.red = d.curveEndpoints.red ?? defEp;
      this.curveEndpoints.green = d.curveEndpoints.green ?? defEp;
      this.curveEndpoints.blue = d.curveEndpoints.blue ?? defEp;
    }

    // Color wheels
    if (d.colorWheels) {
      this.colorWheels.shadows = d.colorWheels.shadows ?? { hue: 0, sat: 0, lum: 0 };
      this.colorWheels.midtones = d.colorWheels.midtones ?? { hue: 0, sat: 0, lum: 0 };
      this.colorWheels.highlights = d.colorWheels.highlights ?? { hue: 0, sat: 0, lum: 0 };
    }

    // HSL
    if (d.hsl) {
      for (const channel of Object.keys(this.hsl)) {
        if (d.hsl[channel]) {
          this.hsl[channel as keyof typeof this.hsl] = d.hsl[channel];
        }
      }
    }
  }
}

export const developManager = new DevelopManager();
