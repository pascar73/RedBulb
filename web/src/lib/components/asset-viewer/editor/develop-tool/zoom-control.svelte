<script lang="ts">
  import { assetViewerManager } from '$lib/managers/asset-viewer-manager.svelte';

  // Compute the "fit" scale: how much the image is scaled down to fit the container.
  // fitScale = min(containerW / naturalW, containerH / naturalH)
  // When fitScale = 1, the image fits perfectly at native res.
  // actualPixelRatio = cssZoom * fitScale
  // So: 100% actual = cssZoom of (1 / fitScale)

  const fitScale = $derived.by(() => {
    const img = assetViewerManager.imgRef;
    if (!img || !img.naturalWidth || !img.naturalHeight) return 1;
    const container = img.parentElement?.parentElement;
    if (!container) return 1;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    if (!cw || !ch) return 1;
    return Math.min(cw / img.naturalWidth, ch / img.naturalHeight);
  });

  // Current actual pixel ratio (what % of native resolution is displayed)
  const currentZoom = $derived(assetViewerManager.zoom);
  const actualPercent = $derived(Math.round(currentZoom * fitScale * 100));

  const isFit = $derived(
    currentZoom <= 1 && assetViewerManager.zoomState.currentPositionX === 0
  );

  const displayLabel = $derived(isFit ? `Fit (${actualPercent}%)` : `${actualPercent}%`);

  // Preset percentages relative to actual image pixels
  const presets = [
    { label: 'Fit', actualPct: 0 },
    { label: '12.5%', actualPct: 12.5 },
    { label: '25%', actualPct: 25 },
    { label: '50%', actualPct: 50 },
    { label: '100%', actualPct: 100 },
    { label: '200%', actualPct: 200 },
    { label: '400%', actualPct: 400 },
  ];

  let dropdownOpen = $state(false);

  function setZoom(actualPct: number) {
    if (actualPct === 0) {
      assetViewerManager.resetZoomState();
    } else {
      // Convert actual percentage to CSS zoom level
      // actualPct / 100 = cssZoom * fitScale → cssZoom = actualPct / (100 * fitScale)
      const cssZoom = actualPct / (100 * fitScale);

      // Center the view when zooming from the dropdown
      // The zoom library uses transform-origin 0,0, so we need to calculate
      // position that centers the image in the viewport
      const img = assetViewerManager.imgRef;
      if (img) {
        const container = img.parentElement?.parentElement;
        if (container) {
          const cw = container.clientWidth;
          const ch = container.clientHeight;
          // Image fitted dimensions
          const fw = img.naturalWidth * fitScale;
          const fh = img.naturalHeight * fitScale;
          // Center offset: position the zoomed content so the center of the image
          // aligns with the center of the container
          const posX = (cw - fw * cssZoom) / 2;
          const posY = (ch - fh * cssZoom) / 2;
          assetViewerManager.zoomState = {
            currentZoom: cssZoom,
            currentPositionX: posX,
            currentPositionY: posY,
          };
        } else {
          assetViewerManager.animatedZoom(cssZoom);
        }
      } else {
        assetViewerManager.animatedZoom(cssZoom);
      }
    }
    dropdownOpen = false;
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    // Step in actual percentage terms
    const step = actualPercent < 50 ? 5 : actualPercent < 200 ? 10 : 25;
    const newPct = e.deltaY > 0
      ? Math.max(5, actualPercent - step)
      : Math.min(800, actualPercent + step);
    setZoom(newPct);
  }
</script>

<div class="zoom-control" onwheel={handleWheel}>
  <button
    class="zoom-btn"
    onclick={() => dropdownOpen = !dropdownOpen}
    title="Zoom level (relative to image native resolution)"
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
          class:active={preset.actualPct === 0 ? isFit : Math.abs(actualPercent - preset.actualPct) < 2}
          onclick={() => setZoom(preset.actualPct)}
        >
          {preset.label}
          {#if preset.actualPct === 0}
            <span class="shortcut">Z</span>
          {:else if preset.actualPct === 100}
            <span class="shortcut">1:1</span>
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
    top: 100%;
    left: 0;
    margin-top: 4px;
    background: #1f2937;
    border: 1px solid #374151;
    border-radius: 6px;
    padding: 4px 0;
    min-width: 140px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
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
