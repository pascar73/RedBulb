<script lang="ts">
  import { type CorrectorNode, hasActiveChanges, NODE_W, NODE_H, NODE_GAP, IO_R, MAX_NODES } from '../node-types';
  import { developManager } from '$lib/managers/edit/develop-manager.svelte';

  interface Props {
    onDimensionsChange?: (w: number, h: number) => void;
    onZoomChange?: (zoom: number) => void;
  }

  let { onDimensionsChange, onZoomChange }: Props = $props();

  // ── Reactive data from developManager ──
  const nodes = $derived(developManager.nodes);
  const selectedId = $derived(developManager.selectedNodeId);

  // ── Layout ──
  const CANVAS_LEFT_PAD = 40;
  const CANVAS_RIGHT_PAD = 40;
  const MIN_CANVAS_H = 120;
  const DEFAULT_Y = 16;

  const canvasW = $derived(CANVAS_LEFT_PAD + Math.max(1, nodes.length) * (NODE_W + NODE_GAP) + CANVAS_RIGHT_PAD);
  const canvasH = $derived(Math.max(MIN_CANVAS_H, NODE_H + DEFAULT_Y * 2 + 20));

  // I/O positions
  const ioY = $derived(DEFAULT_Y + NODE_H / 2);
  const inputPos = $derived({ x: 8, y: ioY });
  const outputX = $derived(canvasW - 8);

  // ── Viewport ──
  let canvasEl = $state<HTMLDivElement | undefined>(undefined);
  let viewportW = $state(400);
  let viewportH = $state(120);

  $effect(() => {
    if (!canvasEl) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) { viewportW = e.contentRect.width; viewportH = e.contentRect.height; }
    });
    ro.observe(canvasEl);
    return () => ro.disconnect();
  });

  // ── Zoom & Pan ──
  let userZoom = $state<number | null>(null);
  let panX = $state(0);
  let panY = $state(0);

  const fitZoom = $derived.by(() => {
    if (viewportW < 10 || viewportH < 10) return 1;
    return Math.min(2, Math.max(0.15, Math.min(viewportW / canvasW, viewportH / canvasH)));
  });
  const zoom = $derived(userZoom ?? fitZoom);
  const isAutoFit = $derived(userZoom === null);

  $effect(() => { onZoomChange?.(zoom); });

  const autoTX = $derived((viewportW - canvasW * fitZoom) / 2);
  const autoTY = $derived((viewportH - canvasH * fitZoom) / 2);
  const translateX = $derived(isAutoFit ? autoTX : panX);
  const translateY = $derived(isAutoFit ? autoTY : panY);

  $effect(() => { onDimensionsChange?.(canvasW, canvasH); });

  // Wheel zoom
  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    const rect = canvasEl?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const oldZ = zoom;
    const newZ = Math.max(0.1, Math.min(3, oldZ * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
    if (isAutoFit) { panX = autoTX; panY = autoTY; }
    panX = mx - (mx - (isAutoFit ? autoTX : panX)) * (newZ / oldZ);
    panY = my - (my - (isAutoFit ? autoTY : panY)) * (newZ / oldZ);
    userZoom = newZ;
  }

  // Middle-mouse pan
  let panning = $state(false);
  function handleCanvasMouseDown(e: MouseEvent) {
    if (e.button !== 1) return;
    e.preventDefault();
    panning = true;
    if (isAutoFit) { panX = autoTX; panY = autoTY; userZoom = fitZoom; }
    const sx = e.clientX, sy = e.clientY, spx = panX, spy = panY;
    const onMove = (ev: MouseEvent) => { panX = spx + (ev.clientX - sx); panY = spy + (ev.clientY - sy); };
    const onUp = () => { panning = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function resetToFit() { userZoom = null; panX = 0; panY = 0; }

  // ── Bezier wires ──
  function bezierPath(x1: number, y1: number, x2: number, y2: number): string {
    const dx = x2 - x1;
    const dy = Math.abs(y2 - y1);
    const adx = Math.abs(dx);
    const horizontalBias = adx / (adx + dy + 1);
    const cpx = Math.max(20, adx * 0.45 * horizontalBias + 30 * (1 - horizontalBias));
    return `M${x1},${y1} C${x1 + cpx},${y1} ${x2 - cpx},${y2} ${x2},${y2}`;
  }

  const wires = $derived.by(() => {
    const result: { d: string; active: boolean }[] = [];
    if (nodes.length === 0) return result;

    // Nodes in left-to-right order
    const sorted = [...nodes];

    const first = sorted[0];
    const firstX = CANVAS_LEFT_PAD + 0 * (NODE_W + NODE_GAP);
    result.push({ d: bezierPath(inputPos.x, inputPos.y, firstX, DEFAULT_Y + NODE_H / 2), active: true });

    for (let i = 0; i < sorted.length - 1; i++) {
      const ax = CANVAS_LEFT_PAD + i * (NODE_W + NODE_GAP);
      const bx = CANVAS_LEFT_PAD + (i + 1) * (NODE_W + NODE_GAP);
      const active = !sorted[i].bypass && hasActiveChanges(sorted[i].state);
      result.push({ d: bezierPath(ax + NODE_W, DEFAULT_Y + NODE_H / 2, bx, DEFAULT_Y + NODE_H / 2), active });
    }

    const lastX = CANVAS_LEFT_PAD + (sorted.length - 1) * (NODE_W + NODE_GAP);
    const lastActive = !sorted[sorted.length - 1].bypass && hasActiveChanges(sorted[sorted.length - 1].state);
    result.push({ d: bezierPath(lastX + NODE_W, DEFAULT_Y + NODE_H / 2, outputX, ioY), active: lastActive });

    return result;
  });

  // ── Node interactions ──
  function handleNodeClick(nodeId: string) {
    developManager.selectNode(nodeId);
  }

  function handleAddNode() {
    developManager.addNode();
  }

  function handleDeleteNode(nodeId: string, e: MouseEvent) {
    e.stopPropagation();
    if (nodes.length <= 1) return;
    developManager.deleteNode(nodeId);
  }

  function handleToggleBypass(nodeId: string, e: MouseEvent) {
    e.stopPropagation();
    developManager.toggleBypass(nodeId);
  }

  // Double-click to rename
  let editingLabel = $state<string | null>(null);
  let editLabelValue = $state('');

  function handleDoubleClick(nodeId: string, e: MouseEvent) {
    e.stopPropagation();
    editingLabel = nodeId;
    const node = nodes.find(n => n.id === nodeId);
    editLabelValue = node?.label ?? '';
  }

  function commitLabel() {
    if (editingLabel) {
      const node = nodes.find(n => n.id === editingLabel);
      if (node) node.label = editLabelValue || node.label;
      editingLabel = null;
    }
  }
</script>

<div class="node-editor-canvas" bind:this={canvasEl}
  onwheel={handleWheel}
  onmousedown={handleCanvasMouseDown}
  role="application"
  aria-label="Node Editor"
>
  <!-- Zoom controls -->
  <div class="zoom-controls">
    <button onclick={resetToFit} title="Fit">Fit</button>
    <span class="zoom-pct">{Math.round(zoom * 100)}%</span>
    <button onclick={handleAddNode} title="Add Node" disabled={nodes.length >= MAX_NODES}>+</button>
  </div>

  <svg
    width={canvasW}
    height={canvasH}
    viewBox="0 0 {canvasW} {canvasH}"
    style="transform: translate({translateX}px, {translateY}px) scale({zoom}); transform-origin: 0 0;"
    class="node-svg"
  >
    <!-- Wires -->
    {#each wires as wire}
      <path d={wire.d} fill="none" stroke={wire.active ? '#60a5fa' : '#555'} stroke-width="2.5" />
    {/each}

    <!-- Input connector -->
    <circle cx={inputPos.x} cy={inputPos.y} r={IO_R} fill="#333" stroke="#888" stroke-width="1.5" />
    <text x={inputPos.x} y={inputPos.y - IO_R - 4} fill="#888" font-size="10" text-anchor="middle">IN</text>

    <!-- Output connector -->
    <circle cx={outputX} cy={ioY} r={IO_R} fill="#333" stroke="#888" stroke-width="1.5" />
    <text x={outputX} y={ioY - IO_R - 4} fill="#888" font-size="10" text-anchor="middle">OUT</text>

    <!-- Nodes -->
    {#each nodes as node, i}
      {@const nx = CANVAS_LEFT_PAD + i * (NODE_W + NODE_GAP)}
      {@const ny = DEFAULT_Y}
      {@const isSelected = node.id === selectedId}
      {@const isActive = hasActiveChanges(node.state)}
      {@const isBypassed = node.bypass}

      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <g
        class="node-group"
        class:selected={isSelected}
        class:bypassed={isBypassed}
        onclick={() => handleNodeClick(node.id)}
        ondblclick={(e) => handleDoubleClick(node.id, e)}
      >
        <!-- Node body -->
        <rect
          x={nx} y={ny} width={NODE_W} height={NODE_H} rx="8"
          fill={isSelected ? '#1e3a5f' : '#2a2a3e'}
          stroke={isSelected ? '#60a5fa' : '#555'}
          stroke-width={isSelected ? 2 : 1}
          opacity={isBypassed ? 0.4 : 1}
        />

        <!-- Red dot indicator (active changes) -->
        {#if isActive && !isBypassed}
          <circle cx={nx + 14} cy={ny + 14} r="5" fill="#ef4444" />
        {/if}

        <!-- Node number -->
        <text
          x={nx + (isActive ? 28 : 14)} y={ny + 18}
          fill={isBypassed ? '#666' : '#999'}
          font-size="11" font-weight="600"
          text-decoration={isBypassed ? 'line-through' : 'none'}
        >{String(i + 1).padStart(2, '0')}</text>

        <!-- Node label -->
        {#if editingLabel === node.id}
          <foreignObject x={nx + 8} y={ny + 28} width={NODE_W - 16} height="24">
            <input
              type="text"
              bind:value={editLabelValue}
              onblur={commitLabel}
              onkeydown={(e) => { if (e.key === 'Enter') commitLabel(); }}
              class="node-label-input"
              autofocus
            />
          </foreignObject>
        {:else}
          <text
            x={nx + NODE_W / 2} y={ny + 45}
            fill={isBypassed ? '#555' : '#ccc'}
            font-size="12" text-anchor="middle"
            text-decoration={isBypassed ? 'line-through' : 'none'}
          >{node.label || String(i + 1).padStart(2, '0')}</text>
        {/if}

        <!-- Bypass button (D key indicator) -->
        <text
          x={nx + NODE_W - 14} y={ny + 16}
          fill={isBypassed ? '#ef4444' : '#666'}
          font-size="10" text-anchor="middle" cursor="pointer"
          onclick={(e) => handleToggleBypass(node.id, e)}
        >{isBypassed ? '⊘' : ''}</text>

        <!-- Delete button (only if >1 node) -->
        {#if nodes.length > 1}
          <text
            x={nx + NODE_W - 14} y={ny + NODE_H - 8}
            fill="#666" font-size="11" text-anchor="middle" cursor="pointer"
            onclick={(e) => handleDeleteNode(node.id, e)}
          >✕</text>
        {/if}

        <!-- I/O connectors -->
        <circle cx={nx} cy={ny + NODE_H / 2} r={IO_R} fill="#333" stroke={isSelected ? '#60a5fa' : '#888'} stroke-width="1.5" />
        <circle cx={nx + NODE_W} cy={ny + NODE_H / 2} r={IO_R} fill="#333" stroke={isSelected ? '#60a5fa' : '#888'} stroke-width="1.5" />
      </g>
    {/each}
  </svg>
</div>

<style>
  .node-editor-canvas {
    width: 100%;
    height: 100%;
    overflow: hidden;
    position: relative;
    background: #1a1a2e;
    border-radius: 8px;
  }

  .node-svg {
    position: absolute;
    top: 0;
    left: 0;
  }

  .zoom-controls {
    position: absolute;
    top: 4px;
    right: 4px;
    z-index: 10;
    display: flex;
    gap: 4px;
    align-items: center;
    background: rgba(0, 0, 0, 0.5);
    padding: 2px 6px;
    border-radius: 6px;
  }

  .zoom-controls button {
    background: rgba(255, 255, 255, 0.1);
    border: none;
    color: #ccc;
    padding: 2px 8px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
  }

  .zoom-controls button:hover { background: rgba(255, 255, 255, 0.2); }
  .zoom-controls button:disabled { opacity: 0.3; cursor: not-allowed; }

  .zoom-pct {
    color: #999;
    font-size: 10px;
    min-width: 32px;
    text-align: center;
  }

  .node-group { cursor: pointer; }
  .node-group:hover rect { filter: brightness(1.15); }

  .node-label-input {
    width: 100%;
    background: #111;
    border: 1px solid #60a5fa;
    color: #fff;
    font-size: 12px;
    padding: 2px 4px;
    border-radius: 4px;
    outline: none;
  }
</style>
