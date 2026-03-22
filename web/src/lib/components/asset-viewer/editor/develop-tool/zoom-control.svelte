<script lang="ts">
  import { assetViewerManager } from '$lib/managers/asset-viewer-manager.svelte';

  const presets = [
    { label: 'Fit', value: 0 },   // 0 = fit to container
    { label: '25%', value: 0.25 },
    { label: '50%', value: 0.5 },
    { label: '75%', value: 0.75 },
    { label: '100%', value: 1 },
    { label: '200%', value: 2 },
    { label: '300%', value: 3 },
  ];

  let dropdownOpen = $state(false);

  const currentZoom = $derived(assetViewerManager.zoom);
  const displayLabel = $derived(
    currentZoom <= 1 && assetViewerManager.zoomState.currentPositionX === 0
      ? 'Fit'
      : `${Math.round(currentZoom * 100)}%`
  );

  function setZoom(value: number) {
    if (value === 0) {
      // Fit: reset to default
      assetViewerManager.resetZoomState();
    } else {
      assetViewerManager.animatedZoom(value);
    }
    dropdownOpen = false;
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newZoom = Math.max(0.25, Math.min(5, currentZoom + delta));
    assetViewerManager.zoomState = { ...assetViewerManager.zoomState, currentZoom: newZoom };
  }
</script>

<div class="zoom-control" onwheel={handleWheel}>
  <button
    class="zoom-btn"
    onclick={() => dropdownOpen = !dropdownOpen}
    title="Zoom level"
  >
    {displayLabel}
    <svg width="8" height="5" viewBox="0 0 8 5" fill="currentColor" class="chevron" class:open={dropdownOpen}>
      <path d="M0 0L4 5L8 0Z" />
    </svg>
  </button>

  {#if dropdownOpen}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="dropdown" onmouseleave={() => dropdownOpen = false}>
      {#each presets as preset}
        <button
          class="dropdown-item"
          class:active={preset.value === 0 ? currentZoom <= 1 : Math.abs(currentZoom - preset.value) < 0.01}
          onclick={() => setZoom(preset.value)}
        >
          {preset.label}
          {#if preset.value === 0}
            <span class="shortcut">Z</span>
          {:else if preset.value === 1}
            <span class="shortcut">⌥⌘Z</span>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .zoom-control {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  .zoom-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    font-size: 12px;
    font-weight: 500;
    font-family: ui-monospace, monospace;
    color: #d1d5db;
    background: rgba(55, 65, 81, 0.6);
    border: 1px solid rgba(75, 85, 99, 0.5);
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.15s;
    white-space: nowrap;
    min-width: 56px;
    justify-content: center;
  }

  .zoom-btn:hover {
    background: rgba(75, 85, 99, 0.8);
    color: #fff;
  }

  .chevron {
    transition: transform 0.15s;
  }

  .chevron.open {
    transform: rotate(180deg);
  }

  .dropdown {
    position: absolute;
    bottom: 100%;
    left: 0;
    margin-bottom: 4px;
    background: #1f2937;
    border: 1px solid #374151;
    border-radius: 6px;
    padding: 4px 0;
    min-width: 140px;
    box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.4);
    z-index: 50;
  }

  .dropdown-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding: 5px 12px;
    font-size: 12px;
    color: #d1d5db;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
  }

  .dropdown-item:hover {
    background: rgba(99, 102, 241, 0.2);
    color: #fff;
  }

  .dropdown-item.active {
    color: #a5b4fc;
  }

  .dropdown-item.active::before {
    content: '✓ ';
  }

  .shortcut {
    font-size: 10px;
    color: #6b7280;
    font-family: system-ui;
  }
</style>
