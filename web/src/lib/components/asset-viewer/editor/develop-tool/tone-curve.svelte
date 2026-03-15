<script lang="ts">
  import { developManager } from '$lib/managers/edit/develop-manager.svelte';
  import { editManager } from '$lib/managers/edit/edit-manager.svelte';

  type Channel = 'master' | 'red' | 'green' | 'blue';
  
  let activeChannel = $state<Channel>('master');
  let draggingIndex = $state<number | null>(null);
  let pointClicked = false; // prevents SVG background click when clicking a point
  let histogramPaths = $state<{ master: string; red: string; green: string; blue: string }>({
    master: '', red: '', green: '', blue: ''
  });

  const MAX_POINTS = 16;
  const POINT_RADIUS = 8; // larger hit target for easier clicking
  const SVG_SIZE = 256;
  const HISTOGRAM_BINS = 256;

  // Cached raw pixel data from the original image
  let rawPixelData: Uint8ClampedArray | null = null;
  let histTimeout: ReturnType<typeof setTimeout> | undefined;

  // Load image data once when asset changes
  $effect(() => {
    const asset = editManager.currentAsset;
    if (asset) {
      loadImageData(asset.id);
    }
  });

  // Recompute histogram when curves change
  $effect(() => {
    // Track curves to trigger recompute
    const _curves = developManager.curves;
    if (rawPixelData) {
      if (histTimeout) clearTimeout(histTimeout);
      histTimeout = setTimeout(() => updateHistogram(), 80);
    }
  });

  async function loadImageData(assetId: string) {
    try {
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

      rawPixelData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      updateHistogram();
    } catch {
      // Silently fail — histogram is optional
    }
  }

  function buildCurveLUT(points: Array<{ x: number; y: number }>): Uint8Array {
    const lut = new Uint8Array(256);
    if (points.length === 0) {
      // Identity — no curve adjustment
      for (let i = 0; i < 256; i++) lut[i] = i;
      return lut;
    }

    // Full control points including endpoints
    const allPoints = [{ x: 0, y: 0 }, ...points, { x: 1, y: 1 }];

    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      // Find segment
      let seg = 0;
      for (let s = 0; s < allPoints.length - 1; s++) {
        if (t >= allPoints[s].x && t <= allPoints[s + 1].x) { seg = s; break; }
      }
      const p0 = allPoints[seg];
      const p1 = allPoints[seg + 1];
      const frac = p1.x === p0.x ? 0 : (t - p0.x) / (p1.x - p0.x);
      const val = p0.y + frac * (p1.y - p0.y);
      lut[i] = Math.max(0, Math.min(255, Math.round(val * 255)));
    }
    return lut;
  }

  function updateHistogram() {
    if (!rawPixelData) return;
    const data = rawPixelData;
    const curves = developManager.curves;

    // Build LUTs for each channel
    const masterLUT = buildCurveLUT(curves.master);
    const redLUT = buildCurveLUT(curves.red);
    const greenLUT = buildCurveLUT(curves.green);
    const blueLUT = buildCurveLUT(curves.blue);

    const rHist = new Uint32Array(HISTOGRAM_BINS);
    const gHist = new Uint32Array(HISTOGRAM_BINS);
    const bHist = new Uint32Array(HISTOGRAM_BINS);
    const lHist = new Uint32Array(HISTOGRAM_BINS);

    for (let i = 0; i < data.length; i += 4) {
      // Apply curves: channel-specific then master
      const r = masterLUT[redLUT[data[i]]];
      const g = masterLUT[greenLUT[data[i + 1]]];
      const b = masterLUT[blueLUT[data[i + 2]]];
      rHist[r]++;
      gHist[g]++;
      bHist[b]++;
      lHist[Math.round(0.299 * r + 0.587 * g + 0.114 * b)]++;
    }

    histogramPaths = {
      master: buildHistogramPath(lHist),
      red: buildHistogramPath(rHist),
      green: buildHistogramPath(gHist),
      blue: buildHistogramPath(bHist),
    };
  }

  function buildHistogramPath(hist: Uint32Array): string {
    const max = Math.max(...hist) || 1;
    const points: string[] = [`M 0,${SVG_SIZE}`];
    for (let i = 0; i < HISTOGRAM_BINS; i++) {
      const x = (i / 255) * SVG_SIZE;
      const h = (hist[i] / max) * SVG_SIZE * 0.8; // 80% max height
      points.push(`L ${x.toFixed(1)},${(SVG_SIZE - h).toFixed(1)}`);
    }
    points.push(`L ${SVG_SIZE},${SVG_SIZE} Z`);
    return points.join(' ');
  }

  const channels: { id: Channel; label: string; color: string }[] = [
    { id: 'master', label: 'Master', color: '#ffffff' },
    { id: 'red', label: 'Red', color: '#ef4444' },
    { id: 'green', label: 'Green', color: '#22c55e' },
    { id: 'blue', label: 'Blue', color: '#3b82f6' },
  ];

  function getPoints() {
    return developManager.curves[activeChannel];
  }

  function setPoints(points: Array<{ x: number; y: number }>) {
    developManager.curves[activeChannel] = points;
  }

  function handleSvgClick(event: MouseEvent) {
    // Don't add a point if we just clicked on an existing point
    if (pointClicked) {
      pointClicked = false;
      return;
    }

    const svg = event.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = 1 - (event.clientY - rect.top) / rect.height;

    const points = getPoints();
    if (points.length >= MAX_POINTS) return;

    // Check if click is near an existing point (within POINT_RADIUS)
    const clickNearPoint = points.some(p => {
      const dx = (p.x - x) * SVG_SIZE;
      const dy = (p.y - y) * SVG_SIZE;
      return Math.sqrt(dx * dx + dy * dy) < POINT_RADIUS * 2;
    });
    if (clickNearPoint) return;

    // Add new point and sort by x
    const newPoints = [...points, { x, y }].sort((a, b) => a.x - b.x);
    setPoints(newPoints);
  }

  function handlePointMouseDown(index: number, event: MouseEvent) {
    event.stopPropagation();
    event.preventDefault();
    pointClicked = true;
    draggingIndex = index;
  }

  function handlePointDblClick(index: number, event: MouseEvent) {
    event.stopPropagation();
    event.preventDefault();
    pointClicked = true;
    draggingIndex = null;
    const points = getPoints();
    const newPoints = points.filter((_, i) => i !== index);
    setPoints(newPoints);
  }

  function handleMouseMove(event: MouseEvent) {
    if (draggingIndex === null) return;

    const svg = (event.currentTarget as HTMLElement).querySelector('svg');
    if (!svg) return;

    const rect = svg.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / rect.height));

    const points = getPoints();
    const newPoints = [...points];
    newPoints[draggingIndex] = { x, y };
    // Re-sort after moving
    newPoints.sort((a, b) => a.x - b.x);
    setPoints(newPoints);
  }

  function handleMouseUp() {
    draggingIndex = null;
  }

  // Monotone cubic spline interpolation (Fritsch-Carlson)
  function getCurvePath(): string {
    const points = getPoints();
    if (points.length === 0) {
      return `M 0,${SVG_SIZE} L ${SVG_SIZE},0`;
    }

    // Include endpoints
    const allPoints = [
      { x: 0, y: 0 },
      ...points,
      { x: 1, y: 1 }
    ].sort((a, b) => a.x - b.x);

    const n = allPoints.length;
    if (n < 2) return `M 0,${SVG_SIZE} L ${SVG_SIZE},0`;
    if (n === 2) {
      const p0 = allPoints[0], p1 = allPoints[1];
      return `M ${p0.x * SVG_SIZE},${(1 - p0.y) * SVG_SIZE} L ${p1.x * SVG_SIZE},${(1 - p1.y) * SVG_SIZE}`;
    }

    // Compute tangents using Catmull-Rom style
    const tangents: number[] = [];
    for (let i = 0; i < n; i++) {
      if (i === 0) {
        tangents.push((allPoints[1].y - allPoints[0].y) / (allPoints[1].x - allPoints[0].x || 1));
      } else if (i === n - 1) {
        tangents.push((allPoints[n - 1].y - allPoints[n - 2].y) / (allPoints[n - 1].x - allPoints[n - 2].x || 1));
      } else {
        const d0 = (allPoints[i].y - allPoints[i - 1].y) / (allPoints[i].x - allPoints[i - 1].x || 1);
        const d1 = (allPoints[i + 1].y - allPoints[i].y) / (allPoints[i + 1].x - allPoints[i].x || 1);
        // Average tangent, clamped for monotonicity
        tangents.push((d0 + d1) / 2);
      }
    }

    // Build cubic bezier path segments
    let path = `M ${allPoints[0].x * SVG_SIZE},${(1 - allPoints[0].y) * SVG_SIZE}`;
    for (let i = 0; i < n - 1; i++) {
      const p0 = allPoints[i];
      const p1 = allPoints[i + 1];
      const dx = p1.x - p0.x;
      // Control points for cubic bezier
      const cp1x = p0.x + dx / 3;
      const cp1y = p0.y + tangents[i] * dx / 3;
      const cp2x = p1.x - dx / 3;
      const cp2y = p1.y - tangents[i + 1] * dx / 3;
      path += ` C ${cp1x * SVG_SIZE},${(1 - cp1y) * SVG_SIZE} ${cp2x * SVG_SIZE},${(1 - cp2y) * SVG_SIZE} ${p1.x * SVG_SIZE},${(1 - p1.y) * SVG_SIZE}`;
    }

    return path;
  }
</script>

<svelte:window
  onmousemove={handleMouseMove}
  onmouseup={handleMouseUp}
/>

<div class="flex flex-col gap-2">
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

  <!-- Curve editor -->
  <div class="relative">
    <svg
      viewBox="0 0 {SVG_SIZE} {SVG_SIZE}"
      class="w-full aspect-square bg-neutral-900 rounded cursor-crosshair select-none"
      onclick={handleSvgClick}
    >
      <!-- Grid lines -->
      {#each [0, 64, 128, 192, 256] as pos}
        <line
          x1={pos} y1="0"
          x2={pos} y2={SVG_SIZE}
          stroke="#374151"
          stroke-width="1"
        />
        <line
          x1="0" y1={pos}
          x2={SVG_SIZE} y2={pos}
          stroke="#374151"
          stroke-width="1"
        />
      {/each}

      <!-- Histogram overlay — all channels visible simultaneously (DaVinci-style) -->
      {#if histogramPaths.master}
        <path d={histogramPaths.master} fill="rgba(180,180,180,0.10)" stroke="none" />
      {/if}
      {#if histogramPaths.red}
        <path d={histogramPaths.red} fill="rgba(239,68,68,0.12)" stroke="rgba(239,68,68,0.25)" stroke-width="0.5" />
      {/if}
      {#if histogramPaths.green}
        <path d={histogramPaths.green} fill="rgba(34,197,94,0.12)" stroke="rgba(34,197,94,0.25)" stroke-width="0.5" />
      {/if}
      {#if histogramPaths.blue}
        <path d={histogramPaths.blue} fill="rgba(59,130,246,0.12)" stroke="rgba(59,130,246,0.25)" stroke-width="0.5" />
      {/if}

      <!-- Identity diagonal reference (faint) -->
      <line
        x1="0" y1={SVG_SIZE}
        x2={SVG_SIZE} y2="0"
        stroke="#4b5563"
        stroke-width="1"
        stroke-dasharray="4 4"
      />

      <!-- Active curve -->
      <path
        d={getCurvePath()}
        stroke={channels.find(c => c.id === activeChannel)?.color}
        stroke-width="2"
        fill="none"
      />

      <!-- Control points -->
      {#each getPoints() as point, index}
        {@const svgX = point.x * SVG_SIZE}
        {@const svgY = (1 - point.y) * SVG_SIZE}
        <circle
          cx={svgX}
          cy={svgY}
          r={POINT_RADIUS}
          fill={channels.find(c => c.id === activeChannel)?.color}
          stroke="#000"
          stroke-width="1.5"
          class="cursor-move"
          onmousedown={(e) => handlePointMouseDown(index, e)}
          ondblclick={(e) => handlePointDblClick(index, e)}
        />
      {/each}
    </svg>

    <!-- Point count indicator -->
    <div class="absolute top-2 right-2 text-xs text-gray-400 bg-black/50 px-2 py-1 rounded">
      {getPoints().length}/{MAX_POINTS} points
    </div>
  </div>

  <!-- Instructions -->
  <div class="text-xs text-gray-400">
    Click to add control points • Drag to adjust • Double-click to remove
  </div>
</div>
