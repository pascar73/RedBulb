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

  // Details parameters
  sharpness = $state(0);
  noiseReduction = $state(0);
  clarity = $state(0);
  dehaze = $state(0);

  // Tone parameters
  vibrance = $state(0);
  tint = $state(0);

  // Effects parameters
  vignette = $state(0);
  grain = $state(0);
  fade = $state(0);

  hasChanges = $derived.by(() => {
    return (
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
      this.vibrance !== 0 ||
      this.tint !== 0 ||
      this.vignette !== 0 ||
      this.grain !== 0 ||
      this.fade !== 0
    );
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
    vibrance: this.vibrance,
    tint: this.tint,
    vignette: this.vignette,
    grain: this.grain,
    fade: this.fade
  }));

  async onActivate(asset: AssetResponseDto, edits: EditActions): Promise<void> {
    // No special activation needed for now
    // In future sprints, we'll load existing develop edits from the server
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
    this.vibrance = 0;
    this.tint = 0;
    this.vignette = 0;
    this.grain = 0;
    this.fade = 0;
  }

  getEdits(): EditActions {
    // No server integration yet - return empty array
    // In Sprint 2, this will return actual edit actions for WebGPU processing
    return [];
  }
}

export const developManager = new DevelopManager();
