<script lang="ts">
  import { developManager } from '$lib/managers/edit/develop-manager.svelte';

  type Channel = 'master' | 'red' | 'green' | 'blue';
  
  let activeChannel = $state<Channel>('master');
  let draggingIndex = $state<number | null>(null);

  const MAX_POINTS = 16;
  const POINT_RADIUS = 6;
  const SVG_SIZE = 256;

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
    const svg = event.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = 1 - (event.clientY - rect.top) / rect.height;

    const points = getPoints();
    if (points.length >= MAX_POINTS) return;

    // Add new point and sort by x
    const newPoints = [...points, { x, y }].sort((a, b) => a.x - b.x);
    setPoints(newPoints);
  }

  function handlePointMouseDown(index: number, event: MouseEvent) {
    event.stopPropagation();
    draggingIndex = index;
  }

  function handlePointDoubleClick(index: number, event: MouseEvent) {
    event.stopPropagation();
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

  // Generate smooth curve path using cubic bezier interpolation
  function getCurvePath(): string {
    const points = getPoints();
    if (points.length === 0) {
      // Identity line
      return `M 0,${SVG_SIZE} L ${SVG_SIZE},0`;
    }

    // Always include corners
    const allPoints = [
      { x: 0, y: 0 },
      ...points,
      { x: 1, y: 1 }
    ].sort((a, b) => a.x - b.x);

    // Simple linear interpolation for now (cubic bezier would be more complex)
    const pathParts = allPoints.map((p, i) => {
      const svgX = p.x * SVG_SIZE;
      const svgY = (1 - p.y) * SVG_SIZE;
      return i === 0 ? `M ${svgX},${svgY}` : `L ${svgX},${svgY}`;
    });

    return pathParts.join(' ');
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
          ondblclick={(e) => handlePointDoubleClick(index, e)}
        />
      {/each}
    </svg>

    <!-- Point count indicator -->
    <div class="absolute top-2 right-2 text-xs text-gray-400 bg-black/50 px-2 py-1 rounded">
      {getPoints().length}/{MAX_POINTS} points
    </div>
  </div>

  <!-- Instructions -->
  <div class="text-xs text-gray-400 space-y-1">
    <div>Click to add control points • Drag to adjust • Double-click to remove</div>
    <div class="text-amber-400">⚠ WebGPU required for live preview</div>
  </div>
</div>
