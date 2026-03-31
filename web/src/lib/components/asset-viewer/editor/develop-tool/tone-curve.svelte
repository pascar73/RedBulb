<script lang="ts">
  import { developManager } from '$lib/managers/edit/develop-manager.svelte';
  import { editManager } from '$lib/managers/edit/edit-manager.svelte';
  import { buildCurveLUT, buildCurveSVGPath, LUTCache } from './curve-engine';
  import ScopeWorker from './scope-worker?worker';

  type Channel = 'master' | 'red' | 'green' | 'blue';
  
  // Fix 1: Stable point identity with unique IDs
  type CurvePoint = { id: string; x: number; y: number };
  let nextPointId = 0;
  function generatePointId(): string {
    return `cp_${Date.now()}_${nextPointId++}`;
  }

  // ── UI state ──────────────────────────────────────────────
  let activeChannel = $state<Channel>('master');
  let draggingEndpoint = $state<number | null>(null); // -1 = black, -2 = white
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
  // Fix 1: Migrate to ID-based points with backward compat
  // ══════════════════════════════════════════════════════════

  function getPoints(): CurvePoint[] {
    const stored = developManager.curves[activeChannel];
    // Migrate old { x, y } points to { id, x, y } on read
    return stored.map((pt: any) => 
      pt.id ? pt : { id: generatePointId(), x: pt.x, y: pt.y }
    );
  }

  function setPoints(points: CurvePoint[]) {
    // Store with IDs (backward compat maintained - old code ignores id field)
    developManager.curves[activeChannel] = points as any;
  }

  // Lantana fix: One-time migration persistence (prevent ID regeneration)
  function migrateAndPersistIds(channel: Channel) {
    const stored = developManager.curves[channel];
    const needsMigration = stored.some((pt: any) => !pt.id);
    if (needsMigration) {
      const migrated = stored.map((pt: any) => 
        pt.id ? pt : { id: generatePointId(), x: pt.x, y: pt.y }
      );
      developManager.curves[channel] = migrated as any;
    }
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

  // Lantana fix: One-time ID migration on channel change/load
  $effect(() => {
    migrateAndPersistIds(activeChannel);
    // Also migrate other channels on first load
    if (activeChannel === 'master') {
      migrateAndPersistIds('red');
      migrateAndPersistIds('green');
      migrateAndPersistIds('blue');
    }
  });

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

  // Fix 3: Deterministic add-point - explicit state tracking (no timing hacks)
  let svgClickStart = $state<{ x: number; y: number; time: number } | null>(null);

  // ── SVG mousedown: record click start ──
  function handleSvgMouseDown(event: MouseEvent) {
    // Ignore if already dragging something
    if (draggingPointId !== null || draggingEndpoint !== null) return;
    svgClickStart = { x: event.clientX, y: event.clientY, time: Date.now() };
  }

  // ── SVG mouseup: deterministic point insertion on segment ──
  function handleSvgMouseUp(event: MouseEvent) {
    // Ignore if we're dragging or no click was started
    if (draggingPointId !== null || draggingEndpoint !== null || !svgClickStart) {
      svgClickStart = null;
      return;
    }

    // Check if mouse barely moved (genuine click vs drag)
    const dx = event.clientX - svgClickStart.x;
    const dy = event.clientY - svgClickStart.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    svgClickStart = null;
    
    if (dist > 5) return; // Moved too much — user was trying to pan/drag, not click

    // Add control point at click location
    if (!svgElement) return;
    const rect = svgElement.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = 1 - (event.clientY - rect.top) / rect.height;

    const points = getPoints();
    if (points.length >= MAX_POINTS) return;

    // Check proximity to existing points (including endpoints)
    const ep = getEp();
    const allPts = [{ x: ep.black.x, y: ep.black.y }, ...points.map(p => ({ x: p.x, y: p.y })), { x: ep.white.x, y: ep.white.y }];
    const tooClose = allPts.some(p => {
      const pdx = (p.x - x) * SVG_SIZE, pdy = (p.y - y) * SVG_SIZE;
      return Math.sqrt(pdx * pdx + pdy * pdy) < pointRadius * 2;
    });
    if (tooClose) return;

    // Insert point in sorted position (maintain x-order)
    const newPoint: CurvePoint = { id: generatePointId(), x, y };
    const insertIdx = points.findIndex(p => p.x > x);
    const updated = insertIdx === -1 
      ? [...points, newPoint] 
      : [...points.slice(0, insertIdx), newPoint, ...points.slice(insertIdx)];
    setPoints(updated);
  }

  // Fix 2: Store point ID instead of index for stable drag reference
  let draggingPointId = $state<string | null>(null);
  
  function handlePointMouseDown(pointId: string, e: MouseEvent) {
    e.stopPropagation(); e.preventDefault();
    draggingPointId = pointId;
    svgClickStart = null; // Cancel any pending click
  }

  function handlePointTouchStart(pointId: string, e: TouchEvent) {
    e.stopPropagation(); e.preventDefault();
    draggingPointId = pointId;
    svgClickStart = null; // Cancel any pending click
  }

  function handlePointDblClick(pointId: string, e: MouseEvent) {
    e.stopPropagation(); e.preventDefault();
    draggingPointId = null;
    svgClickStart = null;
    setPoints(getPoints().filter(p => p.id !== pointId));
  }

  function handleEndpointDown(which: -1 | -2, e: MouseEvent | TouchEvent) {
    e.stopPropagation(); e.preventDefault();
    draggingEndpoint = which;
    svgClickStart = null; // Cancel any pending click
  }

  function handleEndpointDblClick(which: 'black' | 'white', e: MouseEvent) {
    e.stopPropagation(); e.preventDefault();
    svgClickStart = null;
    if (which === 'black') setEndpoint(activeChannel, 'black', 0, 0);
    else setEndpoint(activeChannel, 'white', 1, 1);
  }

  function updateDragPosition(clientX: number, clientY: number) {
    if (!svgElement) return;
    // drag in progress
    const rect = svgElement.getBoundingClientRect();
    const y = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));

    // Endpoints: constrained to edges of the curve box
    // Black point: slides along LEFT edge (x=0, y varies) or BOTTOM edge (y=0, x varies)
    // White point: slides along RIGHT edge (x=1, y varies) or TOP edge (y=1, x varies)
    // Snap to whichever edge the cursor is closer to.
    if (draggingEndpoint === -1) {
      const rawX = Math.max(0, Math.min(0.5, (clientX - rect.left) / rect.width));
      const rawY = Math.max(0, Math.min(0.5, y));
      // Distance to left edge (x=0) vs bottom edge (y=0)
      if (rawX <= rawY) {
        // Closer to left edge → constrain x=0, slide y
        setEndpoint(activeChannel, 'black', 0, rawY);
      } else {
        // Closer to bottom edge → constrain y=0, slide x
        setEndpoint(activeChannel, 'black', rawX, 0);
      }
      return;
    }
    if (draggingEndpoint === -2) {
      const rawX = Math.max(0.5, Math.min(1, (clientX - rect.left) / rect.width));
      const rawY = Math.max(0.5, Math.min(1, y));
      // Distance to right edge (x=1) vs top edge (y=1)
      const distRight = 1 - rawX;
      const distTop = 1 - rawY;
      if (distRight <= distTop) {
        // Closer to right edge → constrain x=1, slide y
        setEndpoint(activeChannel, 'white', 1, rawY);
      } else {
        // Closer to top edge → constrain y=1, slide x
        setEndpoint(activeChannel, 'white', rawX, 1);
      }
      return;
    }
    if (draggingPointId === null) return;

    // Fix 2: Neighbor-clamped drag - keep points ordered during drag (no post-sort)
    const points = getPoints();
    const dragIdx = points.findIndex(p => p.id === draggingPointId);
    if (dragIdx === -1) return;
    
    const rawX = (clientX - rect.left) / rect.width;
    
    // Clamp x between neighbors + epsilon to maintain order
    const EPSILON = 0.001;
    const prevX = dragIdx > 0 ? points[dragIdx - 1].x + EPSILON : 0.01;
    const nextX = dragIdx < points.length - 1 ? points[dragIdx + 1].x - EPSILON : 0.99;
    const clampedX = Math.max(prevX, Math.min(nextX, rawX));
    
    // Update point in-place (no reordering needed - neighbor clamps maintain order)
    const updated = [...points];
    updated[dragIdx] = { id: draggingPointId, x: clampedX, y };
    setPoints(updated);
  }

  function handleMouseMove(e: MouseEvent) {
    if (draggingPointId !== null || draggingEndpoint !== null) updateDragPosition(e.clientX, e.clientY);
  }
  function handleTouchMove(e: TouchEvent) {
    if ((draggingPointId !== null || draggingEndpoint !== null) && e.touches.length > 0) {
      e.preventDefault();
      updateDragPosition(e.touches[0].clientX, e.touches[0].clientY);
    }
  }
  function handleMouseUp() {
    // Fix 2: No post-sort needed - neighbor clamps maintain order during drag
    draggingPointId = null;
    draggingEndpoint = null;
  }
  function handleTouchEnd() {
    draggingPointId = null;
    draggingEndpoint = null;
    svgClickStart = null;
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

<div class="flex flex-col gap-2" style="flex: 1 1 auto; min-height: 0; overflow: hidden;">
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

  <!-- Curve editor — SVG drives the size, canvas matches exactly -->
  <div class="relative" style="flex-shrink: 1;">
    <!-- Scope canvas — absolutely positioned behind SVG, aspect-ratio locked to 1:1 -->
    <canvas bind:this={scopeCanvas} width={svgRenderedWidth} height={svgRenderedWidth}
      class="absolute top-0 left-0 w-full rounded"
      style="z-index: 0; pointer-events: none; opacity: 0.6; will-change: contents; aspect-ratio: 1 / 1;" />

    <svg bind:this={svgElement}
      viewBox="0 0 {SVG_SIZE} {SVG_SIZE}"
      class="w-full cursor-crosshair select-none"
      role="img" aria-label="Tone curve editor"
      style="touch-action: none; display: block; position: relative; z-index: 1; background: rgba(23, 23, 23, 0.3); overflow: visible; will-change: contents; aspect-ratio: 1 / 1;"
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
      <!-- Fix 1: Key by point.id instead of index for stable identity -->
      {#each getPoints() as point (point.id)}
        {@const svgX = point.x * SVG_SIZE}
        {@const svgY = (1 - point.y) * SVG_SIZE}
        <circle
          cx={svgX} cy={svgY} r={pointRadius}
          fill={channelColor(activeChannel)} stroke="#000" stroke-width={strokeScale * 1.5}
          role="slider" aria-label="Control point"
          class="cursor-move"
          onmousedown={(e) => handlePointMouseDown(point.id, e)}
          ontouchstart={(e) => handlePointTouchStart(point.id, e)}
          ondblclick={(e) => handlePointDblClick(point.id, e)}
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
