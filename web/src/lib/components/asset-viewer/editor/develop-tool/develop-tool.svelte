<script lang="ts">
  import { developManager } from '$lib/managers/edit/develop-manager.svelte';

  interface SliderConfig {
    label: string;
    key: keyof typeof developManager & string;
    min: number;
    max: number;
    step: number;
  }

  const sliders: SliderConfig[] = [
    { label: 'Exposure', key: 'exposure', min: -5, max: 5, step: 0.1 },
    { label: 'Contrast', key: 'contrast', min: -1, max: 1, step: 0.01 },
    { label: 'Highlights', key: 'highlights', min: -1, max: 1, step: 0.01 },
    { label: 'Shadows', key: 'shadows', min: -1, max: 1, step: 0.01 },
    { label: 'Whites', key: 'whites', min: -1, max: 1, step: 0.01 },
    { label: 'Blacks', key: 'blacks', min: -1, max: 1, step: 0.01 },
    { label: 'Brightness', key: 'brightness', min: -1, max: 1, step: 0.01 },
  ];

  function resetSlider(key: string) {
    (developManager as any)[key] = 0;
  }

  function formatValue(value: number): string {
    return value.toFixed(2);
  }
</script>

<div class="mt-3 px-4">
  <div class="flex h-10 w-full items-center justify-between text-sm mt-2">
    <h2>Basic</h2>
  </div>

  <div class="space-y-4 mt-4">
    {#each sliders as slider}
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
</div>

<style>
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
