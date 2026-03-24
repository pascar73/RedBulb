<script lang="ts">
  import { developManager } from '$lib/managers/edit/develop-manager.svelte';
  import { editManager } from '$lib/managers/edit/edit-manager.svelte';
  import ToneCurve from './tone-curve.svelte';
  import HslPanel from './hsl-panel.svelte';
  import ColorWheels from './color-wheels.svelte';
  import FloatingPanel from './floating-panel.svelte';
  import HistoryPanel from './history-panel.svelte';

  let saveStatus = $state<'idle' | 'saved' | 'saving'>('idle');
  let saveTimeout: ReturnType<typeof setTimeout> | undefined;

  function saveEdits() {
    const asset = editManager.currentAsset;
    if (!asset) return;
    saveStatus = 'saving';
    developManager.saveToStorage(asset.id);
    saveStatus = 'saved';
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => { saveStatus = 'idle'; }, 2000);
  }

  // Auto-save on changes (debounced)
  let autoSaveTimeout: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const _changes = developManager.hasChanges;
    const asset = editManager.currentAsset;
    if (!asset) return;
    if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(() => {
      developManager.saveToStorage(asset.id);
    }, 3000); // Auto-save after 3 seconds of inactivity
  });

  interface SliderConfig {
    label: string;
    key: keyof typeof developManager & string;
    min: number;
    max: number;
    step: number;
  }

  // --- LIGHT section (Lightroom-style grouping) ---
  const lightSliders: SliderConfig[] = [
    { label: 'Exposure', key: 'exposure', min: -5, max: 5, step: 0.1 },
    { label: 'Contrast', key: 'contrast', min: -1, max: 1, step: 0.01 },
    { label: 'Highlights', key: 'highlights', min: -1, max: 1, step: 0.01 },
    { label: 'Shadows', key: 'shadows', min: -1, max: 1, step: 0.01 },
    { label: 'Whites', key: 'whites', min: -1, max: 1, step: 0.01 },
    { label: 'Blacks', key: 'blacks', min: -1, max: 1, step: 0.01 },
    { label: 'Brightness', key: 'brightness', min: -1, max: 1, step: 0.01 },
  ];

  // --- COLOR section (WB + saturation) ---
  const colorSliders: SliderConfig[] = [
    { label: 'Temperature', key: 'temperature', min: -1, max: 1, step: 0.01 },
    { label: 'Tint', key: 'tint', min: -1, max: 1, step: 0.01 },
    { label: 'Vibrance', key: 'vibrance', min: -1, max: 1, step: 0.01 },
    { label: 'Saturation', key: 'saturation', min: -1, max: 1, step: 0.01 },
  ];

  // --- PRESENCE section (clarity, dehaze) ---
  const presenceSliders: SliderConfig[] = [
    { label: 'Clarity', key: 'clarity', min: -1, max: 1, step: 0.01 },
    { label: 'Dehaze', key: 'dehaze', min: -1, max: 1, step: 0.01 },
  ];

  // --- DETAIL section ---
  const detailSliders: SliderConfig[] = [
    { label: 'Sharpness', key: 'sharpness', min: 0, max: 1, step: 0.01 },
    { label: 'Noise Reduction', key: 'noiseReduction', min: 0, max: 1, step: 0.01 },
  ];

  // --- EFFECTS section ---
  // Effects sliders — grouped like Lightroom
  const effectsTopSliders: SliderConfig[] = [
    { label: 'Texture', key: 'texture', min: -1, max: 1, step: 0.01 },
    { label: 'Fade', key: 'fade', min: 0, max: 1, step: 0.01 },
  ];
  const vignetteSliders: SliderConfig[] = [
    { label: 'Vignette', key: 'vignette', min: -1, max: 1, step: 0.01 },
    { label: 'Midpoint', key: 'vignetteMidpoint', min: 0, max: 100, step: 1 },
    { label: 'Roundness', key: 'vignetteRoundness', min: -100, max: 100, step: 1 },
    { label: 'Feather', key: 'vignetteFeather', min: 0, max: 100, step: 1 },
    { label: 'Highlights', key: 'vignetteHighlights', min: 0, max: 100, step: 1 },
  ];
  const grainSliders: SliderConfig[] = [
    { label: 'Grain', key: 'grain', min: 0, max: 1, step: 0.01 },
    { label: 'Size', key: 'grainSize', min: 1, max: 100, step: 1 },
    { label: 'Roughness', key: 'grainRoughness', min: 0, max: 100, step: 1 },
  ];
  // Combined for section reset detection
  const effectsSliders: SliderConfig[] = [...effectsTopSliders, ...vignetteSliders, ...grainSliders];

  // Legacy aliases for template compatibility
  const basicSliders = lightSliders;
  const toneSliders: SliderConfig[] = [];

  const disabledSliders = new Set<string>();

  // Pop-out state for curves/scopes
  let curvesPoppedOut = $state(false);

  // Collapse state for each section
  let collapsed = $state<Record<string, boolean>>({
    light: false,
    color: false,
    presence: true,
    curves: false,
    colorWheels: false,
    hsl: true,
    detail: true,
    effects: true,
    history: true,
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

  let hoveredSlider = $state<string | null>(null);

  function formatValue(value: number): string {
    return value.toFixed(2);
  }

  function isModified(key: string): boolean {
    return (developManager as any)[key] !== 0;
  }
</script>

{#snippet sliderGroup(sliders: SliderConfig[], disabled?: Set<string>)}
  {#each sliders as slider}
    <div
      class="slider-row"
      class:disabled={disabled?.has(slider.key)}
      onmouseenter={() => hoveredSlider = slider.key}
      onmouseleave={() => hoveredSlider = null}
    >
      <div class="slider-labels">
        {#if hoveredSlider === slider.key && isModified(slider.key)}
          <button class="reset-label" onclick={() => resetSlider(slider.key)}>Reset</button>
        {:else}
          <label class="slider-label">{slider.label}</label>
        {/if}
        <span class="slider-value">{formatValue(developManager[slider.key] as number)}</span>
      </div>
      <input
        type="range"
        min={slider.min}
        max={slider.max}
        step={slider.step}
        bind:value={developManager[slider.key]}
        disabled={disabled?.has(slider.key)}
        class="slider"
      />
    </div>
  {/each}
{/snippet}

{#snippet sectionHeader(key: string, title: string, sliders: SliderConfig[], extra?: any)}
  <div class="section-header" role="button" tabindex="0" onclick={() => toggleSection(key)}>
    <span class="section-title">{title}</span>
    <div class="section-header-right">
      {#if extra === 'eyedropper'}
        <button
          class="section-eyedropper"
          class:active={developManager.eyedropperActive}
          title="Eyedropper: click photo to set white balance"
          onclick={(e) => { e.stopPropagation(); developManager.eyedropperActive = !developManager.eyedropperActive; }}
        >💧</button>
      {/if}
      <button
        class="section-reset"
        class:has-changes={sectionHasChanges(sliders)}
        title="Reset {title}"
        onclick={(e) => { e.stopPropagation(); e.preventDefault(); resetSection(sliders); }}
      >↺</button>
      <span class="chevron" class:collapsed={collapsed[key]}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
          <path d="M2.5 7.5L6 4L9.5 7.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
      </span>
    </div>
  </div>
{/snippet}

<div class="develop-panel">
  <!-- LIGHT -->
  <div class="section-card">
    {@render sectionHeader('light', 'Light', lightSliders)}
    {#if !collapsed.light}
      <div class="section-content">
        {@render sliderGroup(lightSliders)}
      </div>
    {/if}
  </div>

  <!-- Curves -->
  {#if !curvesPoppedOut}
    <div class="section-card">
      <div class="section-header" role="button" tabindex="0" onclick={() => toggleSection('curves')}>
        <span class="section-title">Curves</span>
        <div class="section-header-right">
          <button
            class="section-popout"
            title="Pop out to floating window"
            onclick={(e) => { e.stopPropagation(); curvesPoppedOut = true; }}
          >⤢</button>
          <button
            class="section-reset"
            class:has-changes={curvesHasChanges()}
            title="Reset Curves"
            onclick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              if (curvesHasChanges()) {
                developManager.curves = { master: [], red: [], green: [], blue: [] };
                developManager.curveEndpoints = {
                  master: { black: { x: 0, y: 0 }, white: { x: 1, y: 1 } },
                  red: { black: { x: 0, y: 0 }, white: { x: 1, y: 1 } },
                  green: { black: { x: 0, y: 0 }, white: { x: 1, y: 1 } },
                  blue: { black: { x: 0, y: 0 }, white: { x: 1, y: 1 } },
                };
              }
            }}
          >↺</button>
          <span class="chevron" class:collapsed={collapsed.curves}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M2.5 7.5L6 4L9.5 7.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
          </span>
        </div>
      </div>
      {#if !collapsed.curves}
        <div class="section-content">
          <ToneCurve />
        </div>
      {/if}
    </div>
  {:else}
    <!-- Collapsed placeholder when popped out -->
    <div class="section-card popped-out-placeholder">
      <div class="section-header" role="button" tabindex="0" onclick={() => curvesPoppedOut = false}>
        <span class="section-title popped-label">Curves ↗</span>
        <div class="section-header-right">
          <button
            class="section-popout active"
            title="Collapse back to panel"
            onclick={(e) => { e.stopPropagation(); curvesPoppedOut = false; }}
          >⤡</button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Floating Curves Window -->
  {#if curvesPoppedOut}
    <FloatingPanel title="Curves & Scopes" onClose={() => curvesPoppedOut = false}>
      <ToneCurve />
    </FloatingPanel>
  {/if}

  <!-- COLOR (with eyedropper for WB) -->
  <div class="section-card">
    {@render sectionHeader('color', 'Color', colorSliders, 'eyedropper')}
    {#if !collapsed.color}
      <div class="section-content">
        {#if developManager.eyedropperActive}
          <div class="eyedropper-hint">
            💧 Click on a neutral area in the photo to set white balance
            <button class="eyedropper-cancel" onclick={() => developManager.eyedropperActive = false}>Cancel</button>
          </div>
        {/if}
        {@render sliderGroup(colorSliders)}
      </div>
    {/if}
  </div>

  <!-- PRESENCE (clarity, dehaze) -->
  <div class="section-card">
    {@render sectionHeader('presence', 'Presence', presenceSliders)}
    {#if !collapsed.presence}
      <div class="section-content">
        {@render sliderGroup(presenceSliders)}
      </div>
    {/if}
  </div>

  <!-- Color Grading (Color Wheels) -->
  <div class="section-card">
    <div class="section-header" role="button" tabindex="0" onclick={() => toggleSection('colorWheels')}>
      <span class="section-title">Color Grading</span>
      <div class="section-header-right">
        <button
          class="section-reset"
          class:has-changes={Object.values(developManager.colorWheels).some(w => w.hue !== 0 || w.sat !== 0 || w.lum !== 0)}
          title="Reset Color Grading"
          onclick={(e) => { e.stopPropagation(); e.preventDefault(); developManager.colorWheels = { shadows: { hue: 0, sat: 0, lum: 0 }, midtones: { hue: 0, sat: 0, lum: 0 }, highlights: { hue: 0, sat: 0, lum: 0 } }; }}
        >↺</button>
        <span class="chevron" class:collapsed={collapsed.colorWheels}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M2.5 7.5L6 4L9.5 7.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
        </span>
      </div>
    </div>
    {#if !collapsed.colorWheels}
      <div class="section-content">
        <ColorWheels />
      </div>
    {/if}
  </div>

  <!-- HSL -->
  <div class="section-card">
    <div class="section-header" role="button" tabindex="0" onclick={() => toggleSection('hsl')}>
      <span class="section-title">HSL</span>
      <div class="section-header-right">
        <button
          class="section-reset"
          class:has-changes={hslHasChanges()}
          title="Reset HSL"
          onclick={(e) => { e.stopPropagation(); e.preventDefault(); for (const ch of Object.keys(developManager.hsl)) { (developManager.hsl as any)[ch] = { h: 0, s: 0, l: 0 }; } }}
        >↺</button>
        <span class="chevron" class:collapsed={collapsed.hsl}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M2.5 7.5L6 4L9.5 7.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
        </span>
      </div>
    </div>
    {#if !collapsed.hsl}
      <div class="section-content">
        <HslPanel />
      </div>
    {/if}
  </div>

  <!-- DETAIL -->
  <div class="section-card">
    {@render sectionHeader('detail', 'Detail', detailSliders)}
    {#if !collapsed.detail}
      <div class="section-content">
        {@render sliderGroup(detailSliders)}
      </div>
    {/if}
  </div>

  <!-- EFFECTS -->
  <div class="section-card">
    {@render sectionHeader('effects', 'Effects', effectsSliders)}
    {#if !collapsed.effects}
      <div class="section-content">
        {@render sliderGroup(effectsTopSliders, disabledSliders)}

        <div class="sub-section">
          <div class="sub-section-label">Vignette</div>
          {@render sliderGroup(vignetteSliders, disabledSliders)}
        </div>

        <div class="sub-section">
          <div class="sub-section-label">Grain</div>
          {@render sliderGroup(grainSliders, disabledSliders)}
        </div>
      </div>
    {/if}
  </div>

  <!-- HISTORY -->
  <div class="section-card">
    <div class="section-header" role="button" tabindex="0" onclick={() => toggleSection('history')}>
      <span class="section-title">History</span>
      <div class="section-header-right">
        <span class="chevron" class:collapsed={collapsed.history}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M2.5 7.5L6 4L9.5 7.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
        </span>
      </div>
    </div>
    {#if !collapsed.history}
      <div class="section-content">
        <HistoryPanel />
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
    overflow-x: hidden;
    max-width: 100%;
    box-sizing: border-box;
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
    gap: 10px;
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
    cursor: default;
    user-select: none;
  }

  /* "Reset" label appears on hover when slider is modified */
  .reset-label {
    font-size: 13px;
    color: #9ca3af;
    background: transparent;
    border: none;
    padding: 0;
    cursor: pointer;
    font-family: inherit;
    transition: color 0.1s;
  }

  .reset-label:hover {
    color: #ffffff;
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
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    color: #4b5563;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: default;
    transition: color 0.15s, background 0.15s;
    padding: 0;
  }

  .section-reset.has-changes {
    color: #9ca3af;
    cursor: pointer;
  }

  .section-reset.has-changes:hover {
    color: #ffffff;
    background: rgba(255, 255, 255, 0.1);
  }

  /* Pop-out button */
  .section-popout {
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    color: #6b7280;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    padding: 0;
    transition: color 0.15s, background 0.15s;
  }

  .section-popout:hover {
    color: #a5b4fc;
    background: rgba(99, 102, 241, 0.15);
  }

  .section-popout.active {
    color: #a5b4fc;
  }

  .sub-section {
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid rgba(75, 85, 99, 0.3);
  }

  .sub-section-label {
    font-size: 11px;
    font-weight: 600;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 6px;
  }

  .popped-out-placeholder {
    opacity: 0.6;
    border-style: dashed;
  }

  .popped-label {
    font-style: italic;
    color: #9ca3af !important;
  }

  /* Eyedropper button */
  .section-eyedropper {
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    padding: 0;
    transition: all 0.15s;
    filter: grayscale(1) opacity(0.5);
  }

  .section-eyedropper:hover,
  .section-eyedropper.active {
    filter: grayscale(0) opacity(1);
    background: rgba(59, 130, 246, 0.15);
  }

  .eyedropper-hint {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    margin-bottom: 8px;
    font-size: 11px;
    color: #93c5fd;
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid rgba(59, 130, 246, 0.2);
    border-radius: 6px;
  }

  .eyedropper-cancel {
    margin-left: auto;
    padding: 2px 8px;
    font-size: 10px;
    color: #9ca3af;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 4px;
    cursor: pointer;
  }

  .eyedropper-cancel:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.15);
  }

  /* Save bar */
  .save-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
  }

  .save-btn {
    padding: 4px 12px;
    font-size: 11px;
    font-weight: 600;
    color: #fff;
    background: rgba(34, 197, 94, 0.2);
    border: 1px solid rgba(34, 197, 94, 0.3);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .save-btn:hover {
    background: rgba(34, 197, 94, 0.35);
  }

  .autosave-hint {
    font-size: 10px;
    color: #6b7280;
  }

  /* Slider track and thumb — vertically centered */
  .slider {
    width: 100%;
    height: 14px;
    background: transparent;
    -webkit-appearance: none;
    appearance: none;
    cursor: pointer;
    outline: none;
    margin: 0;
    padding: 0;
  }

  .slider::-webkit-slider-runnable-track {
    height: 4px;
    background: #2d3748;
    border-radius: 2px;
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
    margin-top: -5px;
  }

  .slider::-moz-range-track {
    height: 4px;
    background: #2d3748;
    border-radius: 2px;
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
</style>
