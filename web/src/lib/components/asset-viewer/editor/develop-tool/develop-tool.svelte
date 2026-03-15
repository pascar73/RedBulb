<script lang="ts">
  import { developManager } from '$lib/managers/edit/develop-manager.svelte';
  import ToneCurve from './tone-curve.svelte';
  import HslPanel from './hsl-panel.svelte';

  interface SliderConfig {
    label: string;
    key: keyof typeof developManager & string;
    min: number;
    max: number;
    step: number;
  }

  const basicSliders: SliderConfig[] = [
    { label: 'Exposure', key: 'exposure', min: -5, max: 5, step: 0.1 },
    { label: 'Contrast', key: 'contrast', min: -1, max: 1, step: 0.01 },
    { label: 'Highlights', key: 'highlights', min: -1, max: 1, step: 0.01 },
    { label: 'Shadows', key: 'shadows', min: -1, max: 1, step: 0.01 },
    { label: 'Whites', key: 'whites', min: -1, max: 1, step: 0.01 },
    { label: 'Blacks', key: 'blacks', min: -1, max: 1, step: 0.01 },
    { label: 'Brightness', key: 'brightness', min: -1, max: 1, step: 0.01 },
  ];

  const colorSliders: SliderConfig[] = [
    { label: 'Temperature', key: 'temperature', min: -1, max: 1, step: 0.01 },
    { label: 'Saturation', key: 'saturation', min: -1, max: 1, step: 0.01 },
  ];

  const detailsSliders: SliderConfig[] = [
    { label: 'Sharpness', key: 'sharpness', min: 0, max: 1, step: 0.01 },
    { label: 'Noise Reduction', key: 'noiseReduction', min: 0, max: 1, step: 0.01 },
    { label: 'Clarity', key: 'clarity', min: -1, max: 1, step: 0.01 },
    { label: 'Dehaze', key: 'dehaze', min: -1, max: 1, step: 0.01 },
  ];

  const toneSliders: SliderConfig[] = [
    { label: 'Vibrance', key: 'vibrance', min: -1, max: 1, step: 0.01 },
    { label: 'Tint', key: 'tint', min: -1, max: 1, step: 0.01 },
  ];

  const effectsSliders: SliderConfig[] = [
    { label: 'Vignette', key: 'vignette', min: 0, max: 1, step: 0.01 },
    { label: 'Grain', key: 'grain', min: 0, max: 1, step: 0.01 },
    { label: 'Fade', key: 'fade', min: 0, max: 1, step: 0.01 },
  ];

  const disabledSliders = new Set(['vignette', 'grain']);

  function resetSlider(key: string) {
    (developManager as any)[key] = 0;
  }

  function resetSection(sliders: SliderConfig[]) {
    for (const s of sliders) {
      (developManager as any)[s.key] = 0;
    }
  }

  function sectionHasChanges(sliders: SliderConfig[]): boolean {
    return sliders.some(s => (developManager as any)[s.key] !== 0);
  }

  function formatValue(value: number): string {
    return value.toFixed(2);
  }
</script>

<div class="mt-3 px-4">
  <div class="flex h-10 w-full items-center justify-between text-sm mt-2">
    <h2>Basic</h2>
    {#if sectionHasChanges(basicSliders)}
      <button class="section-reset" title="Reset Basic" onclick={() => resetSection(basicSliders)}>↺</button>
    {/if}
  </div>

  <div class="space-y-4 mt-4">
    {#each basicSliders as slider}
      <div class="flex flex-col gap-1">
        <div class="flex justify-between items-center">
          <label
            class="text-sm text-white cursor-pointer select-none"
            ondblclick={() => resetSlider(slider.key)}
          >
            {slider.label}
          </label>
          <span class="text-sm text-gray-400 font-mono w-16 text-right">
            {formatValue(developManager[slider.key] as number)}
          </span>
        </div>
        <input
          type="range"
          min={slider.min}
          max={slider.max}
          step={slider.step}
          bind:value={developManager[slider.key]}
          class="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
        />
      </div>
    {/each}
  </div>

  <div class="flex h-10 w-full items-center justify-between text-sm mt-8">
    <h2>Color</h2>
    {#if sectionHasChanges(colorSliders)}
      <button class="section-reset" title="Reset Color" onclick={() => resetSection(colorSliders)}>↺</button>
    {/if}
  </div>

  <div class="space-y-4 mt-4">
    {#each colorSliders as slider}
      <div class="flex flex-col gap-1">
        <div class="flex justify-between items-center">
          <label
            class="text-sm text-white cursor-pointer select-none"
            ondblclick={() => resetSlider(slider.key)}
          >
            {slider.label}
          </label>
          <span class="text-sm text-gray-400 font-mono w-16 text-right">
            {formatValue(developManager[slider.key] as number)}
          </span>
        </div>
        <input
          type="range"
          min={slider.min}
          max={slider.max}
          step={slider.step}
          bind:value={developManager[slider.key]}
          class="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
        />
      </div>
    {/each}
  </div>

  <div class="flex h-10 w-full items-center justify-between text-sm mt-8">
    <h2>Details</h2>
    {#if sectionHasChanges(detailsSliders)}
      <button class="section-reset" title="Reset Details" onclick={() => resetSection(detailsSliders)}>↺</button>
    {/if}
  </div>

  <div class="space-y-4 mt-4">
    {#each detailsSliders as slider}
      <div class="flex flex-col gap-1" class:opacity-40={disabledSliders.has(slider.key)}>
        <div class="flex justify-between items-center">
          <label
            class="text-sm text-white cursor-pointer select-none"
            ondblclick={() => resetSlider(slider.key)}
            title={disabledSliders.has(slider.key) ? 'WebGPU required' : ''}
          >
            {slider.label}
          </label>
          <span class="text-sm text-gray-400 font-mono w-16 text-right">
            {formatValue(developManager[slider.key] as number)}
          </span>
        </div>
        <input
          type="range"
          min={slider.min}
          max={slider.max}
          step={slider.step}
          bind:value={developManager[slider.key]}
          disabled={disabledSliders.has(slider.key)}
          class="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
        />
      </div>
    {/each}
  </div>

  <div class="flex h-10 w-full items-center justify-between text-sm mt-8">
    <h2>Tone</h2>
    {#if sectionHasChanges(toneSliders)}
      <button class="section-reset" title="Reset Tone" onclick={() => resetSection(toneSliders)}>↺</button>
    {/if}
  </div>

  <div class="space-y-4 mt-4">
    {#each toneSliders as slider}
      <div class="flex flex-col gap-1">
        <div class="flex justify-between items-center">
          <label
            class="text-sm text-white cursor-pointer select-none"
            ondblclick={() => resetSlider(slider.key)}
          >
            {slider.label}
          </label>
          <span class="text-sm text-gray-400 font-mono w-16 text-right">
            {formatValue(developManager[slider.key] as number)}
          </span>
        </div>
        <input
          type="range"
          min={slider.min}
          max={slider.max}
          step={slider.step}
          bind:value={developManager[slider.key]}
          class="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
        />
      </div>
    {/each}
  </div>

  <div class="flex h-10 w-full items-center justify-between text-sm mt-8">
    <h2>Effects</h2>
    {#if sectionHasChanges(effectsSliders)}
      <button class="section-reset" title="Reset Effects" onclick={() => resetSection(effectsSliders)}>↺</button>
    {/if}
  </div>

  <div class="space-y-4 mt-4">
    {#each effectsSliders as slider}
      <div class="flex flex-col gap-1" class:opacity-40={disabledSliders.has(slider.key)}>
        <div class="flex justify-between items-center">
          <label
            class="text-sm text-white cursor-pointer select-none"
            ondblclick={() => resetSlider(slider.key)}
            title={disabledSliders.has(slider.key) ? 'WebGPU required' : ''}
          >
            {slider.label}
          </label>
          <span class="text-sm text-gray-400 font-mono w-16 text-right">
            {formatValue(developManager[slider.key] as number)}
          </span>
        </div>
        <input
          type="range"
          min={slider.min}
          max={slider.max}
          step={slider.step}
          bind:value={developManager[slider.key]}
          disabled={disabledSliders.has(slider.key)}
          class="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
        />
      </div>
    {/each}
  </div>

  <div class="flex h-10 w-full items-center justify-between text-sm mt-8">
    <h2>Curves</h2>
    {#if Object.values(developManager.curves).some(ch => ch.length > 0)}
      <button class="section-reset" title="Reset Curves" onclick={() => { developManager.curves = { master: [], red: [], green: [], blue: [] }; }}>↺</button>
    {/if}
  </div>

  <div class="mt-4">
    <ToneCurve />
  </div>

  <div class="flex h-10 w-full items-center justify-between text-sm mt-8">
    <h2>HSL</h2>
    {#if Object.values(developManager.hsl).some(ch => ch.h !== 0 || ch.s !== 0 || ch.l !== 0)}
      <button class="section-reset" title="Reset HSL" onclick={() => { for (const ch of Object.keys(developManager.hsl)) { (developManager.hsl as any)[ch] = { h: 0, s: 0, l: 0 }; } }}>↺</button>
    {/if}
  </div>

  <div class="mt-4">
    <HslPanel />
  </div>

  <!-- Reset handled by Immich's built-in "Reset changes" button in editor-panel -->
</div>

<style>
  /* Per-section reset button */
  .section-reset {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    color: #9ca3af;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: color 0.15s, background 0.15s;
  }
  .section-reset:hover {
    color: #ffffff;
    background: #374151;
  }

  /* Custom slider styling to match Immich dark theme */
  .slider {
    -webkit-appearance: none;
    appearance: none;
  }

  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    background: white;
    cursor: pointer;
    border-radius: 50%;
  }

  .slider::-moz-range-thumb {
    width: 16px;
    height: 16px;
    background: white;
    cursor: pointer;
    border-radius: 50%;
    border: none;
  }

  .slider::-webkit-slider-track {
    width: 100%;
    height: 8px;
    cursor: pointer;
    background: #374151;
    border-radius: 4px;
  }

  .slider::-moz-range-track {
    width: 100%;
    height: 8px;
    cursor: pointer;
    background: #374151;
    border-radius: 4px;
  }
</style>
