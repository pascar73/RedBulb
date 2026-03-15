<script lang="ts">
  import { developManager } from '$lib/managers/edit/develop-manager.svelte';

  type HSLMode = 'hue' | 'saturation' | 'luminance';
  type ColorChannel = 'red' | 'orange' | 'yellow' | 'green' | 'aqua' | 'blue' | 'purple' | 'magenta';

  let activeMode = $state<HSLMode>('hue');

  const colorChannels: Array<{ id: ColorChannel; label: string; color: string }> = [
    { id: 'red', label: 'Red', color: '#ef4444' },
    { id: 'orange', label: 'Orange', color: '#f97316' },
    { id: 'yellow', label: 'Yellow', color: '#eab308' },
    { id: 'green', label: 'Green', color: '#22c55e' },
    { id: 'aqua', label: 'Aqua', color: '#06b6d4' },
    { id: 'blue', label: 'Blue', color: '#3b82f6' },
    { id: 'purple', label: 'Purple', color: '#a855f7' },
    { id: 'magenta', label: 'Magenta', color: '#ec4899' },
  ];

  const modes: Array<{ id: HSLMode; label: string }> = [
    { id: 'hue', label: 'Hue' },
    { id: 'saturation', label: 'Saturation' },
    { id: 'luminance', label: 'Luminance' },
  ];

  function getPropertyKey(mode: HSLMode): 'h' | 's' | 'l' {
    return mode === 'hue' ? 'h' : mode === 'saturation' ? 's' : 'l';
  }

  function resetChannel(channel: ColorChannel, mode: HSLMode) {
    const key = getPropertyKey(mode);
    developManager.hsl[channel][key] = 0;
  }

  function formatValue(value: number): string {
    return value.toFixed(2);
  }
</script>

<div class="flex flex-col gap-4">
  <!-- Mode tabs -->
  <div class="flex gap-1 p-1 bg-gray-800 rounded-lg">
    {#each modes as mode}
      <button
        class="flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors"
        class:bg-gray-700={activeMode === mode.id}
        class:text-white={activeMode === mode.id}
        class:text-gray-400={activeMode !== mode.id}
        onclick={() => activeMode = mode.id}
      >
        {mode.label}
      </button>
    {/each}
  </div>

  <!-- Sliders for active mode -->
  <div class="space-y-4">
    {#each colorChannels as channel}
      {@const key = getPropertyKey(activeMode)}
      {@const value = developManager.hsl[channel.id][key]}
      <div class="flex flex-col gap-1">
        <div class="flex justify-between items-center">
          <label
            class="text-sm text-white cursor-pointer select-none flex items-center gap-2"
            ondblclick={() => resetChannel(channel.id, activeMode)}
          >
            <span class="inline-block w-3 h-3 rounded-full" style="background-color: {channel.color}"></span>
            {channel.label}
          </label>
          <span class="text-sm text-gray-400 font-mono w-16 text-right">
            {formatValue(value)}
          </span>
        </div>
        <input
          type="range"
          min="-1"
          max="1"
          step="0.01"
          bind:value={developManager.hsl[channel.id][key]}
          class="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
        />
      </div>
    {/each}
  </div>
</div>

<style>
  /* Match existing slider styling */
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
