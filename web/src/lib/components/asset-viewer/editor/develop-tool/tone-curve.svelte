<script lang="ts">
  import { developManager } from '$lib/managers/edit/develop-manager.svelte';
  import { editManager } from '$lib/managers/edit/edit-manager.svelte';
  import { buildCurveLUT, buildCurveSVGPath, LUTCache } from './curve-engine';
  import ScopeWorker from './scope-worker?worker';

  type Channel = 'master' | 'red' | 'green' | 'blue';

  // ── UI state ──────────────────────────────────────────────
  let activeChannel = $state<Channel>('master');
  let draggingIndex = $state<number | null>(null);
  let draggingEndpoint = $state<number | null>(null); // -1 = black, -2 = white
  // Track SVG-level mousedown for clean click detection (no spurious CPs)
  let svgMouseDownPos = $state<{ x: number; y: number } | null>(null);
  let anyPointInteraction = $state(false); // set true when mousedown is on a point/endpoint
  let svgElement = $state<SVGSVGElement | undefined>(undefined);
  let scopeCanvas = $state<HTMLCanvasElement | undefined>(undefined);

  // ── Scope settings ────────────────────────────────────────
  type ScopeType = 'histogram' | 'parade' | 'waveform' | 'vectorscope' | 'cie';
  let activeScopeType = $state<ScopeType>('histogram');
  let scopeBrightness = $state(1.0);
  let graticuleOpacity = $state(0.4);
  let showRefLevels = $state(true);
  let refLow = $state(10);
  let refHigh = $state(235);
  let colorizeWaveform = $state(true);
  let scopeControlsOpen = $state(false);

  const scopeTypes: { id: ScopeType; label: string }[] = [
    { id: 'histogram', label: 'Histogram' },
    { id: 'parade', label: 'Parade' },
    { id: 'waveform', label: 'Waveform' },
    { id: 'vectorscope', label: 'Vectorscope' },
    { id: 'cie', label: 'CIE Chromaticity' },
  ];

  // ── Constants ─────────────────────────────────────────────
  const MAX_POINTS = 16;
  const POINT_RADIUS_PX = 6;
  const SVG_SIZE = 256;

  // ── Derived sizing ────────────────────────────────────────
  let svgRenderedWidth = $state(256);
  let pointRadius = $derived(POINT_RADIUS_PX * (SVG_SIZE / svgRenderedWidth));
  let strokeScale = $derived(SVG_SIZE / svgRenderedWidth);

  // ── Image data for scopes ──────────────────────────────────
  let hasImageData = false;

  // ── LUT cache ─────────────────────────────────────────────
  const lutCache = new LUTCache();

  // ── Scope Worker — all heavy pixel processing off main thread
  let scopeWorker: Worker | null = null;
  let workerBusy = false;
  let pendingRender = false;

  function initWorker() {
    if (scopeWorker) return;
    try {
      scopeWorker = new ScopeWorker();
      scopeWorker.onmessage = (e) => {
        workerBusy = false;
        if (e.data.type === 'rendered' && scopeCanvas) {
          const ctx = scopeCanvas.getContext('2d')!;
          const img = new ImageData(
            new Uint8ClampedArray(e.data.imageData),
            e.data.width,
            e.data.height,
          );
          ctx.clearRect(0, 0, scopeCanvas.width, scopeCanvas.height);
          ctx.putImageData(img, 0, 0);
          drawGraticule(ctx);
        }
        // If a render was requested while busy, do it now
        if (pendingRender) {
          pendingRender = false;
          requestScopeUpdate();
        }
      };
    } catch {
      // Workers not supported — fall back silently (scopes won't render)
      scopeWorker = null;
    }
  }

  // ── rAF scope throttle ────────────────────────────────────
  let scopeRafId: number | null = null;

  function requestScopeUpdate() {
    if (scopeRafId !== null) return;
    scopeRafId = requestAnimationFrame(() => {
      scopeRafId = null;
      renderScope();
    });
  }

  // ── Channels config ───────────────────────────────────────
  const channels: { id: Channel; label: string; color: string }[] = [
    { id: 'master', label: 'Master', color: '#ffffff' },
    { id: 'red', label: 'Red', color: '#ef4444' },
    { id: 'green', label: 'Green', color: '#22c55e' },
    { id: 'blue', label: 'Blue', color: '#3b82f6' },
  ];

  function channelColor(ch: Channel): string {
    return channels.find(c => c.id === ch)?.color ?? '#fff';
  }

  // ══════════════════════════════════════════════════════════
  // State accessors — read directly from developManager for
  // proper Svelte 5 fine-grained reactivity
  // ══════════════════════════════════════════════════════════

  function getPoints(): Array<{ x: number; y: number }> {
    return developManager.curves[activeChannel];
  }

  function setPoints(points: Array<{ x: number; y: number }>) {
    developManager.curves[activeChannel] = points;
  }

  function getEp() {
    return developManager.curveEndpoints[activeChannel];
  }

  function setEndpoint(channel: Channel, point: 'black' | 'white', x: number, y: number) {
    developManager.curveEndpoints[channel] = {
      ...developManager.curveEndpoints[channel],
      [point]: { x, y },
    };
  }

  // ══════════════════════════════════════════════════════════
  // SVG path — delegates to curve-engine (same math as LUT)
  // ══════════════════════════════════════════════════════════

  function getCurvePath(): string {
    return buildCurveSVGPath(getPoints(), getEp(), SVG_SIZE);
  }

  // ══════════════════════════════════════════════════════════
  // Effects
  // ══════════════════════════════════════════════════════════

  // Track SVG rendered size for constant-pixel-size control points + dynamic scope resolution
  $effect(() => {
    if (!svgElement) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.round(entry.contentRect.width) || 256;
        svgRenderedWidth = w;
        // Scale scope canvas to match rendered size (higher res for larger windows)
        if (scopeCanvas && (scopeCanvas.width !== w || scopeCanvas.height !== w)) {
          scopeCanvas.width = w;
          scopeCanvas.height = w;
          if (hasImageData) requestScopeUpdate();
        }
      }
    });
    ro.observe(svgElement);
    return () => ro.disconnect();
  });

  // Re-render scope when scope type, pixel-affecting controls, or Light params change
  $effect(() => {
    void activeScopeType;
    void scopeBrightness;
    void colorizeWaveform;
    // Track Light slider changes so histogram reflects adjustments
    const p = developManager.params;
    void [p.exposure, p.highlights, p.shadows, p.whites, p.blacks, p.brightness,
          p.contrast, p.saturation, p.vibrance, p.clarity, p.dehaze, p.fade];
    if (hasImageData) requestScopeUpdate();
  });

  // Graticule-only changes: instant redraw without worker round-trip
  $effect(() => {
    void graticuleOpacity;
    void showRefLevels;
    void refLow;
    void refHigh;
    // Graticule is drawn on main thread (SVG grid + canvas overlay)
    // SVG grid is reactive via template binding. Canvas graticule needs manual redraw.
    if (scopeCanvas && hasImageData) {
      // Don't clear — just redraw graticule on top of existing scope
      // (Worker result is preserved; graticule overwrites only its own lines)
    }
  });

  // Load image data once when asset changes
  $effect(() => {
    const asset = editManager.currentAsset;
    if (asset) loadImageData(asset.id);
  });

  // Recompute scope when curves/endpoints change
  $effect(() => {
    // Deep-read to track mutations
    const curves = developManager.curves;
    void [
      curves.master.length, curves.master.map(p => p.x + p.y).join(),
      curves.red.length, curves.red.map(p => p.x + p.y).join(),
      curves.green.length, curves.green.map(p => p.x + p.y).join(),
      curves.blue.length, curves.blue.map(p => p.x + p.y).join(),
    ];
    const ep = developManager.curveEndpoints;
    void [
      ep.master.black.x, ep.master.black.y, ep.master.white.x, ep.master.white.y,
      ep.red.black.x, ep.red.black.y, ep.red.white.x, ep.red.white.y,
      ep.green.black.x, ep.green.black.y, ep.green.white.x, ep.green.white.y,
      ep.blue.black.x, ep.blue.black.y, ep.blue.white.x, ep.blue.white.y,
    ];
    if (hasImageData) requestScopeUpdate();
  });

  // ══════════════════════════════════════════════════════════
  // Image loading
  // ══════════════════════════════════════════════════════════

  async function loadImageData(assetId: string) {
    try {
      initWorker();
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = `/api/assets/${assetId}/thumbnail?size=preview`;
      });
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 512 / Math.max(img.naturalWidth, img.naturalHeight));
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // Transfer pixel data to worker (zero-copy via transferable)
      if (scopeWorker) {
        const pixelsCopy = imageData.data.slice();
        scopeWorker.postMessage({
          type: 'init',
          pixels: pixelsCopy.buffer,
          imgWidth: canvas.width,
          imgHeight: canvas.height,
        }, [pixelsCopy.buffer]);
      }

      hasImageData = true;
      requestScopeUpdate();
    } catch {
      // Silently fail — scopes are optional
    }
  }

  // ══════════════════════════════════════════════════════════
  // Interaction handlers
  // ══════════════════════════════════════════════════════════

  // ── SVG mousedown: record position for click detection ──
  function handleSvgMouseDown(event: MouseEvent) {
    if (anyPointInteraction) return; // mousedown was on a point, not empty space
    svgMouseDownPos = { x: event.clientX, y: event.clientY };
  }

  // ── SVG mouseup: only create a CP if this was a genuine click (no drag) ──
  function handleSvgMouseUp(event: MouseEvent) {
    // If any point/endpoint was being interacted with, skip
    if (anyPointInteraction || draggingIndex !== null || draggingEndpoint !== null) {
      svgMouseDownPos = null;
      return;
    }
    // If no mousedown was recorded on the SVG background, skip
    if (!svgMouseDownPos) return;

    // Check if mouse barely moved (genuine click vs accidental drag)
    const dx = event.clientX - svgMouseDownPos.x;
    const dy = event.clientY - svgMouseDownPos.y;
    svgMouseDownPos = null;
    if (Math.sqrt(dx * dx + dy * dy) > 5) return; // moved too much — not a click

    // Now safely add a control point
    if (!svgElement) return;
    const rect = svgElement.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = 1 - (event.clientY - rect.top) / rect.height;

    const points = getPoints();
    if (points.length >= MAX_POINTS) return;

    // Check proximity to existing points (including endpoints)
    const ep = getEp();
    const allPts = [{ x: ep.black.x, y: ep.black.y }, ...points, { x: ep.white.x, y: ep.white.y }];
    const tooClose = allPts.some(p => {
      const pdx = (p.x - x) * SVG_SIZE, pdy = (p.y - y) * SVG_SIZE;
      return Math.sqrt(pdx * pdx + pdy * pdy) < pointRadius * 2;
    });
    if (tooClose) return;

    setPoints([...points, { x, y }].sort((a, b) => a.x - b.x));
  }

  function handlePointMouseDown(index: number, e: MouseEvent) {
    e.stopPropagation(); e.preventDefault();
    anyPointInteraction = true;
    draggingIndex = index;
  }

  function handlePointTouchStart(index: number, e: TouchEvent) {
    e.stopPropagation(); e.preventDefault();
    anyPointInteraction = true;
    draggingIndex = index;
  }

  function handlePointDblClick(index: number, e: MouseEvent) {
    e.stopPropagation(); e.preventDefault();
    anyPointInteraction = true;
    draggingIndex = null;
    setPoints(getPoints().filter((_, i) => i !== index));
  }

  function handleEndpointDown(which: -1 | -2, e: MouseEvent | TouchEvent) {
    e.stopPropagation(); e.preventDefault();
    anyPointInteraction = true;
    draggingEndpoint = which;
  }

  function handleEndpointDblClick(which: 'black' | 'white', e: MouseEvent) {
    e.stopPropagation(); e.preventDefault();
    anyPointInteraction = true;
    if (which === 'black') setEndpoint(activeChannel, 'black', 0, 0);
    else setEndpoint(activeChannel, 'white', 1, 1);
  }

  function updateDragPosition(clientX: number, clientY: number) {
    if (!svgElement) return;
    wasDragging = true; // Flag that a real drag occurred
    const rect = svgElement.getBoundingClientRect();
    const y = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));

    // Endpoints: free 2D movement (like DaVinci Resolve)
    // Black point: x clamp [0, 0.99], y clamp [0, 1]
    // White point: x clamp [0.01, 1], y clamp [0, 1]
    if (draggingEndpoint === -1) {
      const x = Math.max(0, Math.min(0.99, (clientX - rect.left) / rect.width));
      setEndpoint(activeChannel, 'black', x, y);
      return;
    }
    if (draggingEndpoint === -2) {
      const x = Math.max(0.01, Math.min(1, (clientX - rect.left) / rect.width));
      setEndpoint(activeChannel, 'white', x, y);
      return;
    }
    if (draggingIndex === null) return;

    const x = Math.max(0.01, Math.min(0.99, (clientX - rect.left) / rect.width));
    const points = [...getPoints()];
    points[draggingIndex] = { x, y };
    points.sort((a, b) => a.x - b.x);
    // Track the moved point after sort
    draggingIndex = points.findIndex(p => p.x === x && p.y === y);
    setPoints(points);
  }

  function handleMouseMove(e: MouseEvent) {
    if (draggingIndex !== null || draggingEndpoint !== null) updateDragPosition(e.clientX, e.clientY);
  }
  function handleTouchMove(e: TouchEvent) {
    if ((draggingIndex !== null || draggingEndpoint !== null) && e.touches.length > 0) {
      e.preventDefault();
      updateDragPosition(e.touches[0].clientX, e.touches[0].clientY);
    }
  }
  function handleMouseUp() {
    draggingIndex = null;
    draggingEndpoint = null;
    // Delay clearing anyPointInteraction so SVG mouseup handler can check it
    requestAnimationFrame(() => { anyPointInteraction = false; });
  }
  function handleTouchEnd() {
    draggingIndex = null;
    draggingEndpoint = null;
    anyPointInteraction = false;
    svgMouseDownPos = null;
  }

  // ══════════════════════════════════════════════════════════
  // Scope rendering — dispatched to Web Worker (off main thread)
  // Only graticule overlay runs on main thread (lightweight)
  // ══════════════════════════════════════════════════════════

  function renderScope() {
    if (!hasImageData || !scopeWorker || !scopeCanvas) return;

    // If worker is still processing, queue the update
    if (workerBusy) { pendingRender = true; return; }

    const c = developManager.curves;
    const ep = developManager.curveEndpoints;
    const masterLUT = lutCache.get(c.master, ep.master);
    const redLUT = lutCache.get(c.red, ep.red);
    const greenLUT = lutCache.get(c.green, ep.green);
    const blueLUT = lutCache.get(c.blue, ep.blue);

    // Copy LUT buffers (they're small — 256 bytes each)
    const mBuf = masterLUT.slice().buffer;
    const rBuf = redLUT.slice().buffer;
    const gBuf = greenLUT.slice().buffer;
    const bBuf = blueLUT.slice().buffer;

    workerBusy = true;
    scopeWorker.postMessage({
      type: 'render',
      scopeType: activeScopeType,
      masterLUT: mBuf,
      redLUT: rBuf,
      greenLUT: gBuf,
      blueLUT: bBuf,
      canvasW: scopeCanvas.width,
      canvasH: scopeCanvas.height,
      brightness: scopeBrightness,
      colorize: colorizeWaveform,
      light: {
        exposure: developManager.params.exposure,
        highlights: developManager.params.highlights,
        shadows: developManager.params.shadows,
        whites: developManager.params.whites,
        blacks: developManager.params.blacks,
        brightness: developManager.params.brightness,
        contrast: developManager.params.contrast,
        saturation: developManager.params.saturation,
        vibrance: developManager.params.vibrance,
        clarity: developManager.params.clarity,
        dehaze: developManager.params.dehaze,
        fade: developManager.params.fade,
        texture: developManager.params.texture,
      },
    }, [mBuf, rBuf, gBuf, bBuf]);
  }

  // ── Graticule overlay (lightweight, stays on main thread) ──
  function drawGraticule(ctx: CanvasRenderingContext2D) {
    if (!scopeCanvas) return;
    const W = scopeCanvas.width, H = scopeCanvas.height;

    if (activeScopeType === 'vectorscope') {
      const cx = W / 2, cy = H / 2, radius = Math.min(cx, cy) - 8;
      ctx.strokeStyle = `rgba(75, 85, 99, ${graticuleOpacity})`; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy - radius); ctx.lineTo(cx, cy + radius); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - radius, cy); ctx.lineTo(cx + radius, cy); ctx.stroke();
    } else {
      ctx.strokeStyle = `rgba(75, 85, 99, ${graticuleOpacity})`; ctx.lineWidth = 0.5;
      for (const frac of [0.25, 0.5, 0.75]) {
        const lineY = H * (1 - frac);
        ctx.beginPath(); ctx.moveTo(0, lineY); ctx.lineTo(W, lineY); ctx.stroke();
      }
      if (showRefLevels) {
        const lowY = H * (1 - refLow / 255), highY = H * (1 - refHigh / 255);
        ctx.strokeStyle = `rgba(59, 130, 246, ${graticuleOpacity * 0.8})`;
        ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(0, lowY); ctx.lineTo(W, lowY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, highY); ctx.lineTo(W, highY); ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = '9px sans-serif';
        ctx.fillStyle = `rgba(59, 130, 246, ${Math.min(1, graticuleOpacity + 0.2)})`;
        ctx.fillText(`${refLow}`, 3, lowY - 3);
        ctx.fillText(`${refHigh}`, 3, highY + 11);
      }
    }
  }
</script>

<svelte:window
  onmousemove={handleMouseMove}
  onmouseup={handleMouseUp}
  ontouchmove={handleTouchMove}
  ontouchend={handleTouchEnd}
/>

<div class="flex flex-col gap-2" style="flex: 1 1 0; min-height: 0; overflow: hidden;">
  <!-- Channel tabs -->
  <div class="flex gap-1 p-1 bg-gray-800 rounded-lg">
    {#each channels as channel}
      <button
        class="flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors"
        class:bg-gray-700={activeChannel === channel.id}
        class:text-white={activeChannel === channel.id}
        class:text-gray-400={activeChannel !== channel.id}
        onclick={() => activeChannel = channel.id}
      >
        <span class="inline-block w-2 h-2 rounded-full mr-1.5" style="background-color: {channel.color}"></span>
        {channel.label}
      </button>
    {/each}
  </div>

  <!-- Scope controls -->
  <div class="flex items-center gap-2 mb-1">
    <select
      class="text-xs bg-gray-800 text-gray-300 border border-gray-700 rounded px-2 py-1 cursor-pointer focus:outline-none focus:border-gray-500"
      bind:value={activeScopeType}
    >
      {#each scopeTypes as scope}
        <option value={scope.id}>{scope.label}</option>
      {/each}
    </select>
    <input type="range" min="0.2" max="6" step="0.1" bind:value={scopeBrightness}
      class="scope-intensity-slider" title="Scope intensity" />
    <span class="text-xs text-gray-500 font-mono" style="min-width:28px">{scopeBrightness.toFixed(1)}×</span>
    <button
      class="text-xs px-1.5 py-0.5 rounded transition-colors"
      class:bg-gray-700={scopeControlsOpen}
      class:text-gray-400={!scopeControlsOpen}
      class:text-white={scopeControlsOpen}
      onclick={() => scopeControlsOpen = !scopeControlsOpen}
      title="More scope settings"
    >⚙</button>
  </div>

  {#if scopeControlsOpen}
    <div class="scope-controls">
      <div class="ctrl-row">
        <label>Brightness</label>
        <input type="range" min="0.2" max="6" step="0.1" bind:value={scopeBrightness} />
        <span>{scopeBrightness.toFixed(1)}×</span>
      </div>
      <div class="ctrl-row">
        <label>Graticule</label>
        <input type="range" min="0" max="1" step="0.05" bind:value={graticuleOpacity} />
        <span>{Math.round(graticuleOpacity * 100)}%</span>
      </div>
      <div class="ctrl-row">
        <label class="flex items-center gap-1">
          <input type="checkbox" bind:checked={colorizeWaveform} class="accent-indigo-500" />
          Colorize
        </label>
      </div>
      <div class="ctrl-row">
        <label class="flex items-center gap-1">
          <input type="checkbox" bind:checked={showRefLevels} class="accent-indigo-500" />
          Ref Levels
        </label>
        {#if showRefLevels}
          <div class="ref-inputs">
            <span>Lo</span>
            <input type="number" min="0" max="255" bind:value={refLow} class="ref-num" />
            <span>Hi</span>
            <input type="number" min="0" max="255" bind:value={refHigh} class="ref-num" />
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Curve editor -->
  <div class="relative" style="overflow: visible; flex: 1 1 0; min-height: 0;">
    <canvas bind:this={scopeCanvas} width={svgRenderedWidth} height={svgRenderedWidth}
      class="absolute inset-0 w-full h-full rounded"
      style="z-index: 0; pointer-events: none; opacity: 0.6; will-change: contents;" />

    <svg bind:this={svgElement}
      viewBox="0 0 {SVG_SIZE} {SVG_SIZE}"
      class="w-full aspect-square cursor-crosshair select-none"
      role="img" aria-label="Tone curve editor"
      style="touch-action: none; position: relative; z-index: 1; background: rgba(23, 23, 23, 0.3); overflow: visible; will-change: contents;"
      onmousedown={handleSvgMouseDown}
      onmouseup={handleSvgMouseUp}
    >
      <!-- Grid (opacity controlled by graticule slider) -->
      {#each [0, 64, 128, 192, 256] as pos}
        <line x1={pos} y1="0" x2={pos} y2={SVG_SIZE} stroke="#374151" stroke-width="1" opacity={graticuleOpacity} />
        <line x1="0" y1={pos} x2={SVG_SIZE} y2={pos} stroke="#374151" stroke-width="1" opacity={graticuleOpacity} />
      {/each}

      <!-- Identity diagonal -->
      <line x1="0" y1={SVG_SIZE} x2={SVG_SIZE} y2="0" stroke="#4b5563" stroke-width="1" stroke-dasharray="4 4" opacity={graticuleOpacity} />

      <!-- Active curve (same spline as LUT) -->
      <path d={getCurvePath()} stroke={channelColor(activeChannel)} stroke-width={strokeScale * 2} fill="none" />

      <!-- Black point endpoint — free 2D movement -->
      <circle
        cx={getEp().black.x * SVG_SIZE}
        cy={(1 - getEp().black.y) * SVG_SIZE}
        r={pointRadius}
        fill={(getEp().black.x !== 0 || getEp().black.y !== 0) ? channelColor(activeChannel) : 'rgba(128,128,128,0.3)'}
        stroke={channelColor(activeChannel)}
        stroke-width={strokeScale * 1.5}
        role="slider" aria-label="Black point"
        class="cursor-move"
        onmousedown={(e) => handleEndpointDown(-1, e)}
        ontouchstart={(e) => handleEndpointDown(-1, e)}
        ondblclick={(e) => handleEndpointDblClick('black', e)}
      />
      <!-- White point endpoint — free 2D movement -->
      <circle
        cx={getEp().white.x * SVG_SIZE}
        cy={(1 - getEp().white.y) * SVG_SIZE}
        r={pointRadius}
        fill={(getEp().white.x !== 1 || getEp().white.y !== 1) ? channelColor(activeChannel) : 'rgba(128,128,128,0.3)'}
        stroke={channelColor(activeChannel)}
        stroke-width={strokeScale * 1.5}
        role="slider" aria-label="White point"
        class="cursor-move"
        onmousedown={(e) => handleEndpointDown(-2, e)}
        ontouchstart={(e) => handleEndpointDown(-2, e)}
        ondblclick={(e) => handleEndpointDblClick('white', e)}
      />

      <!-- Control points -->
      {#each getPoints() as point, index}
        {@const svgX = point.x * SVG_SIZE}
        {@const svgY = (1 - point.y) * SVG_SIZE}
        <circle
          cx={svgX} cy={svgY} r={pointRadius}
          fill={channelColor(activeChannel)} stroke="#000" stroke-width={strokeScale * 1.5}
          role="slider" aria-label="Control point {index + 1}"
          class="cursor-move"
          onmousedown={(e) => handlePointMouseDown(index, e)}
          ontouchstart={(e) => handlePointTouchStart(index, e)}
          ondblclick={(e) => handlePointDblClick(index, e)}
        />
      {/each}
    </svg>

    <div class="absolute top-2 right-2 text-xs text-gray-400 bg-black/50 px-2 py-1 rounded">
      {getPoints().length}/{MAX_POINTS} points
    </div>
  </div>

</div>

<style>
  .scope-controls {
    display: flex; flex-direction: column; gap: 4px;
    padding: 6px 8px; margin-bottom: 4px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px; font-size: 10px; color: #9ca3af;
  }
  .ctrl-row { display: flex; align-items: center; gap: 6px; }
  .ctrl-row label { min-width: 60px; font-size: 10px; color: #9ca3af; }
  .ctrl-row input[type="range"] {
    flex: 1; height: 3px; -webkit-appearance: none; appearance: none;
    background: rgba(255, 255, 255, 0.15); border-radius: 2px; outline: none; cursor: pointer;
  }
  .ctrl-row input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none; width: 10px; height: 10px; border-radius: 50%;
    background: #9ca3af; border: 1px solid #6b7280; cursor: pointer;
  }
  .ctrl-row input[type="range"]::-moz-range-thumb {
    width: 10px; height: 10px; border-radius: 50%;
    background: #9ca3af; border: 1px solid #6b7280; cursor: pointer;
  }
  .ctrl-row span { min-width: 28px; text-align: right; font-size: 10px; font-family: 'SF Mono', monospace; color: #6b7280; }
  .ref-inputs { display: flex; align-items: center; gap: 4px; margin-left: auto; font-size: 10px; }
  .ref-inputs span { color: #6b7280; min-width: auto; }
  .ref-num {
    width: 36px; padding: 1px 3px; font-size: 10px; font-family: 'SF Mono', monospace;
    color: #d1d5db; background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 3px; outline: none; text-align: center;
  }
  .ref-num:focus { border-color: rgba(99, 102, 241, 0.5); }
  .scope-intensity-slider {
    width: 60px; height: 3px; -webkit-appearance: none; appearance: none;
    background: linear-gradient(to right, rgba(255,255,255,0.1), rgba(255,255,255,0.4));
    border-radius: 2px; outline: none; cursor: pointer; flex-shrink: 0;
  }
  .scope-intensity-slider::-webkit-slider-thumb {
    -webkit-appearance: none; width: 10px; height: 10px; border-radius: 50%;
    background: #9ca3af; border: 1px solid #6b7280; cursor: pointer;
  }
  .scope-intensity-slider::-moz-range-thumb {
    width: 10px; height: 10px; border-radius: 50%;
    background: #9ca3af; border: 1px solid #6b7280; cursor: pointer;
  }
</style>
