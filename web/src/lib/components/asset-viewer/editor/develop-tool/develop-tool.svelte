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

  // Collapse state for each section
  let collapsed = $state<Record<string, boolean>>({
    basic: false,
    color: false,
    details: true,
    tone: true,
    effects: true,
    curves: false,
    hsl: true,
  });

  function toggleSection(key: string) {
    collapsed[key] = !collapsed[key];
  }

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

  function curvesHasChanges(): boolean {
    return Object.values(developManager.curves).some(ch => ch.length > 0);
  }

  function hslHasChanges(): boolean {
    return Object.values(developManager.hsl).some(ch => ch.h !== 0 || ch.s !== 0 || ch.l !== 0);
  }

  function formatValue(value: number): string {
    return value.toFixed(2);
  }
</script>

<div class="develop-panel">
  <!-- Basic -->
  <div class="section-card">
    <button class="section-header" onclick={() => toggleSection('basic')}>
      <span class="section-title">Basic</span>
      <div class="section-header-right">
        <button
          class="section-reset"
          class:has-changes={sectionHasChanges(basicSliders)}
          title="Reset Basic"
          onclick={(e) => { e.stopPropagation(); resetSection(basicSliders); }}
        >↺</button>
        <span class="chevron" class:collapsed={collapsed.basic}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M2.5 7.5L6 4L9.5 7.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
        </span>
      </div>
    </button>
    {#if !collapsed.basic}
      <div class="section-content">
        {#each basicSliders as slider}
          <div class="slider-row">
            <div class="slider-labels">
              <label
                class="slider-label"
                ondblclick={() => resetSlider(slider.key)}
              >
                {slider.label}
              </label>
              <span class="slider-value">
                {formatValue(developManager[slider.key] as number)}
              </span>
            </div>
            <input
              type="range"
              min={slider.min}
              max={slider.max}
              step={slider.step}
              bind:value={developManager[slider.key]}
              class="slider"
            />
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Curves -->
  <div class="section-card">
    <button class="section-header" onclick={() => toggleSection('curves')}>
      <span class="section-title">Curves</span>
      <div class="section-header-right">
        <button
          class="section-reset"
          class:has-changes={curvesHasChanges()}
          title="Reset Curves"
          onclick={(e) => { e.stopPropagation(); developManager.curves = { master: [], red: [], green: [], blue: [] }; }}
        >↺</button>
        <span class="chevron" class:collapsed={collapsed.curves}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M2.5 7.5L6 4L9.5 7.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
        </span>
      </div>
    </button>
    {#if !collapsed.curves}
      <div class="section-content">
        <ToneCurve />
      </div>
    {/if}
  </div>

  <!-- Color -->
  <div class="section-card">
    <button class="section-header" onclick={() => toggleSection('color')}>
      <span class="section-title">Color</span>
      <div class="section-header-right">
        <button
          class="section-reset"
          class:has-changes={sectionHasChanges(colorSliders)}
          title="Reset Color"
          onclick={(e) => { e.stopPropagation(); resetSection(colorSliders); }}
        >↺</button>
        <span class="chevron" class:collapsed={collapsed.color}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M2.5 7.5L6 4L9.5 7.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
        </span>
      </div>
    </button>
    {#if !collapsed.color}
      <div class="section-content">
        {#each colorSliders as slider}
          <div class="slider-row">
            <div class="slider-labels">
              <label
                class="slider-label"
                ondblclick={() => resetSlider(slider.key)}
              >
                {slider.label}
              </label>
              <span class="slider-value">
                {formatValue(developManager[slider.key] as number)}
              </span>
            </div>
            <input
              type="range"
              min={slider.min}
              max={slider.max}
              step={slider.step}
              bind:value={developManager[slider.key]}
              class="slider"
            />
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Details -->
  <div class="section-card">
    <button class="section-header" onclick={() => toggleSection('details')}>
      <span class="section-title">Details</span>
      <div class="section-header-right">
        <button
          class="section-reset"
          class:has-changes={sectionHasChanges(detailsSliders)}
          title="Reset Details"
          onclick={(e) => { e.stopPropagation(); resetSection(detailsSliders); }}
        >↺</button>
        <span class="chevron" class:collapsed={collapsed.details}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M2.5 7.5L6 4L9.5 7.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
        </span>
      </div>
    </button>
    {#if !collapsed.details}
      <div class="section-content">
        {#each detailsSliders as slider}
          <div class="slider-row" class:disabled={disabledSliders.has(slider.key)}>
            <div class="slider-labels">
              <label
                class="slider-label"
                ondblclick={() => resetSlider(slider.key)}
                title={disabledSliders.has(slider.key) ? 'WebGPU required' : ''}
              >
                {slider.label}
              </label>
              <span class="slider-value">
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
              class="slider"
            />
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Tone -->
  <div class="section-card">
    <button class="section-header" onclick={() => toggleSection('tone')}>
      <span class="section-title">Tone</span>
      <div class="section-header-right">
        <button
          class="section-reset"
          class:has-changes={sectionHasChanges(toneSliders)}
          title="Reset Tone"
          onclick={(e) => { e.stopPropagation(); resetSection(toneSliders); }}
        >↺</button>
        <span class="chevron" class:collapsed={collapsed.tone}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M2.5 7.5L6 4L9.5 7.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
        </span>
      </div>
    </button>
    {#if !collapsed.tone}
      <div class="section-content">
        {#each toneSliders as slider}
          <div class="slider-row">
            <div class="slider-labels">
              <label
                class="slider-label"
                ondblclick={() => resetSlider(slider.key)}
              >
                {slider.label}
              </label>
              <span class="slider-value">
                {formatValue(developManager[slider.key] as number)}
              </span>
            </div>
            <input
              type="range"
              min={slider.min}
              max={slider.max}
              step={slider.step}
              bind:value={developManager[slider.key]}
              class="slider"
            />
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Effects -->
  <div class="section-card">
    <button class="section-header" onclick={() => toggleSection('effects')}>
      <span class="section-title">Effects</span>
      <div class="section-header-right">
        <button
          class="section-reset"
          class:has-changes={sectionHasChanges(effectsSliders)}
          title="Reset Effects"
          onclick={(e) => { e.stopPropagation(); resetSection(effectsSliders); }}
        >↺</button>
        <span class="chevron" class:collapsed={collapsed.effects}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M2.5 7.5L6 4L9.5 7.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
        </span>
      </div>
    </button>
    {#if !collapsed.effects}
      <div class="section-content">
        {#each effectsSliders as slider}
          <div class="slider-row" class:disabled={disabledSliders.has(slider.key)}>
            <div class="slider-labels">
              <label
                class="slider-label"
                ondblclick={() => resetSlider(slider.key)}
                title={disabledSliders.has(slider.key) ? 'WebGPU required' : ''}
              >
                {slider.label}
              </label>
              <span class="slider-value">
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
              class="slider"
            />
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- HSL -->
  <div class="section-card">
    <button class="section-header" onclick={() => toggleSection('hsl')}>
      <span class="section-title">HSL</span>
      <div class="section-header-right">
        <button
          class="section-reset"
          class:has-changes={hslHasChanges()}
          title="Reset HSL"
          onclick={(e) => { e.stopPropagation(); for (const ch of Object.keys(developManager.hsl)) { (developManager.hsl as any)[ch] = { h: 0, s: 0, l: 0 }; } }}
        >↺</button>
        <span class="chevron" class:collapsed={collapsed.hsl}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M2.5 7.5L6 4L9.5 7.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
        </span>
      </div>
    </button>
    {#if !collapsed.hsl}
      <div class="section-content">
        <HslPanel />
      </div>
    {/if}
  </div>
</div>

<style>
  .develop-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 12px 16px;
  }

  /* Collapsible card container — RapidRAW style */
  .section-card {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    overflow: hidden;
    transition: border-color 0.15s;
  }

  .section-card:hover {
    border-color: rgba(255, 255, 255, 0.12);
  }

  /* Section header — clickable to toggle */
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 10px 14px;
    background: transparent;
    border: none;
    cursor: pointer;
    color: inherit;
    font: inherit;
  }

  .section-header:hover {
    background: rgba(255, 255, 255, 0.03);
  }

  .section-title {
    font-size: 14px;
    font-weight: 600;
    color: #e5e7eb;
    letter-spacing: 0.02em;
  }

  .section-header-right {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  /* Chevron rotation */
  .chevron {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #6b7280;
    transition: transform 0.2s ease;
  }

  .chevron.collapsed {
    transform: rotate(180deg);
  }

  /* Section content with padding */
  .section-content {
    padding: 4px 14px 14px;
  }

  /* Slider rows */
  .slider-row {
    margin-bottom: 10px;
  }

  .slider-row:last-child {
    margin-bottom: 0;
  }

  .slider-row.disabled {
    opacity: 0.4;
  }

  .slider-labels {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }

  .slider-label {
    font-size: 13px;
    color: #d1d5db;
    cursor: pointer;
    user-select: none;
  }

  .slider-value {
    font-size: 12px;
    color: #6b7280;
    font-family: 'SF Mono', 'Fira Code', monospace;
    min-width: 48px;
    text-align: right;
  }

  /* Per-section reset button */
  .section-reset {
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    color: #4b5563;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: default;
    pointer-events: none;
    transition: color 0.15s, background 0.15s;
    padding: 0;
  }

  .section-reset.has-changes {
    color: #9ca3af;
    cursor: pointer;
    pointer-events: auto;
  }

  .section-reset.has-changes:hover {
    color: #ffffff;
    background: rgba(255, 255, 255, 0.1);
  }

  /* Slider track and thumb */
  .slider {
    width: 100%;
    height: 6px;
    background: #2d3748;
    border-radius: 3px;
    -webkit-appearance: none;
    appearance: none;
    cursor: pointer;
    outline: none;
  }

  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    background: #ffffff;
    cursor: pointer;
    border-radius: 50%;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
  }

  .slider::-moz-range-thumb {
    width: 14px;
    height: 14px;
    background: #ffffff;
    cursor: pointer;
    border-radius: 50%;
    border: none;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
  }

  .slider::-webkit-slider-runnable-track {
    height: 6px;
    background: #2d3748;
    border-radius: 3px;
  }

  .slider::-moz-range-track {
    height: 6px;
    background: #2d3748;
    border-radius: 3px;
  }
</style>
