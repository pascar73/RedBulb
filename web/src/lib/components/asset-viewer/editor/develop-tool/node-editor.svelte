<script lang="ts">
  import { type ProcessingNode, type NodeGraph, NODE_REGISTRY, nodeIsActive, createNode, type NodeType, DEFAULT_NODE_ORDER } from '../node-types';

  interface Props {
    graph: NodeGraph;
    onGraphChange: (graph: NodeGraph) => void;
    selectedNodeId: string | null;
    onSelectNode: (id: string | null) => void;
    onDimensionsChange?: (w: number, h: number) => void;
    onZoomChange?: (zoom: number) => void;
  }

  let { graph, onGraphChange, selectedNodeId, onSelectNode, onDimensionsChange, onZoomChange }: Props = $props();

  // ── Layout constants ──
  // Node size: DaVinci Resolve scale (2x–4x of original 80×44)
  const NODE_W = 160;
  const NODE_H = 88;
  const NODE_GAP = 24;
  const IO_R = 7;
  const LIBRARY_W = 150;

  // ── Canvas coordinate space ──
  const CANVAS_LEFT_PAD = 40;
  const CANVAS_RIGHT_PAD = 40;
  const MIN_CANVAS_H = 120;
  const DEFAULT_Y = 40;

  const canvasW = $derived(CANVAS_LEFT_PAD + graph.nodes.length * (NODE_W + NODE_GAP) + CANVAS_RIGHT_PAD);

  const maxNodeY = $derived(graph.nodes.length > 0
    ? Math.max(...graph.nodes.map(n => n.position.y + NODE_H + 20))
    : MIN_CANVAS_H);
  const canvasH = $derived(Math.max(MIN_CANVAS_H, maxNodeY));

  // I/O connectors track average Y
  const avgNodeY = $derived(graph.nodes.length > 0
    ? graph.nodes.reduce((sum, n) => sum + n.position.y + NODE_H / 2, 0) / graph.nodes.length
    : canvasH / 2);
  const inputPos = $derived({ x: 8, y: avgNodeY });
  const outputX = $derived(canvasW - 8);
  const outputY = $derived(avgNodeY);

  // ── Viewport tracking ──
  let canvasEl = $state<HTMLDivElement | undefined>(undefined);
  let viewportW = $state(400);
  let viewportH = $state(120);

  $effect(() => {
    if (!canvasEl) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        viewportW = e.contentRect.width;
        viewportH = e.contentRect.height;
      }
    });
    ro.observe(canvasEl);
    return () => ro.disconnect();
  });

  // ── Zoom & Pan state ──
  const MIN_ZOOM = 0.1;
  const MAX_ZOOM = 3.0;
  const ZOOM_PRESETS = [25, 50, 75, 100, 150, 200];

  let userZoom = $state<number | null>(null); // null = auto-fit
  let panX = $state(0);
  let panY = $state(0);

  // Auto-fit zoom (used when userZoom is null)
  const fitZoom = $derived.by(() => {
    if (viewportW < 10 || viewportH < 10) return 1;
    const sx = viewportW / canvasW;
    const sy = viewportH / canvasH;
    return Math.min(2, Math.max(0.15, Math.min(sx, sy)));
  });

  const zoom = $derived(userZoom ?? fitZoom);
  const isAutoFit = $derived(userZoom === null);

  // Report zoom changes
  $effect(() => { onZoomChange?.(zoom); });

  // Auto-center when in auto-fit mode
  const autoTranslateX = $derived((viewportW - canvasW * fitZoom) / 2);
  const autoTranslateY = $derived((viewportH - canvasH * fitZoom) / 2);
  const translateX = $derived(isAutoFit ? autoTranslateX : panX);
  const translateY = $derived(isAutoFit ? autoTranslateY : panY);

  // Report dimensions
  $effect(() => { onDimensionsChange?.(canvasW + LIBRARY_W, canvasH); });

  // ── Zoom with mouse wheel ──
  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    const rect = canvasEl?.getBoundingClientRect();
    if (!rect) return;

    // Mouse position in viewport
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const oldZoom = zoom;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, oldZoom * factor));

    if (isAutoFit) {
      // Switch from auto to manual: initialize pan from current auto position
      panX = autoTranslateX;
      panY = autoTranslateY;
    }

    // Zoom towards cursor: adjust pan so point under cursor stays fixed
    panX = mx - (mx - (isAutoFit ? autoTranslateX : panX)) * (newZoom / oldZoom);
    panY = my - (my - (isAutoFit ? autoTranslateY : panY)) * (newZoom / oldZoom);
    userZoom = newZoom;
  }

  // ── Middle mouse pan ──
  let panning = $state(false);
  let panStartX = 0;
  let panStartY = 0;
  let panStartPanX = 0;
  let panStartPanY = 0;

  function handleCanvasMouseDown(e: MouseEvent) {
    // Middle mouse button (button 1)
    if (e.button === 1) {
      e.preventDefault();
      panning = true;

      if (isAutoFit) {
        panX = autoTranslateX;
        panY = autoTranslateY;
        userZoom = fitZoom;
      }

      panStartX = e.clientX;
      panStartY = e.clientY;
      panStartPanX = panX;
      panStartPanY = panY;

      function onMove(ev: MouseEvent) {
        panX = panStartPanX + (ev.clientX - panStartX);
        panY = panStartPanY + (ev.clientY - panStartY);
      }
      function onUp() {
        panning = false;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      }
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    }
  }

  // ── Zoom controls ──
  let showZoomMenu = $state(false);

  function setZoomPreset(pct: number) {
    const newZoom = pct / 100;
    if (isAutoFit) {
      panX = autoTranslateX;
      panY = autoTranslateY;
    }
    // Re-center when picking a preset
    panX = (viewportW - canvasW * newZoom) / 2;
    panY = (viewportH - canvasH * newZoom) / 2;
    userZoom = newZoom;
    showZoomMenu = false;
  }

  function resetToFit() {
    userZoom = null;
    panX = 0;
    panY = 0;
    showZoomMenu = false;
  }

  // ── Initial layout ──
  $effect(() => {
    const needsLayout = graph.nodes.some((n, i) => {
      return n.position.x === 0 && n.position.y === 0 && i > 0;
    });
    if (needsLayout) {
      const nodes = graph.nodes.map((n, i) => ({
        ...n,
        position: { x: CANVAS_LEFT_PAD + i * (NODE_W + NODE_GAP), y: DEFAULT_Y },
      }));
      onGraphChange({ ...graph, nodes });
    }
  });

  // ── Sorted for wires ──
  const sortedNodes = $derived([...graph.nodes].sort((a, b) => a.position.x - b.position.x));

  // ── Bezier wires ──
  // Nuke-style: horizontal tangent at both ends, control point offset
  // proportional to the total distance (not just dx) so large Y gaps
  // don't create loops
  function bezierPath(x1: number, y1: number, x2: number, y2: number): string {
    const dx = x2 - x1;
    const dy = y2 - y1;
    // Use total distance, not just horizontal — prevents loops on big Y gaps
    const dist = Math.sqrt(dx * dx + dy * dy);
    // Control point offset: 40% of total distance, min 30, max half of dx+100
    const cpx = Math.max(30, Math.min(dist * 0.4, Math.abs(dx) * 0.5 + 100));
    return `M${x1},${y1} C${x1 + cpx},${y1} ${x2 - cpx},${y2} ${x2},${y2}`;
  }

  const wires = $derived.by(() => {
    const result: { d: string; active: boolean }[] = [];
    const sorted = sortedNodes;
    if (sorted.length === 0) return result;

    const first = sorted[0];
    result.push({ d: bezierPath(inputPos.x, inputPos.y, first.position.x, first.position.y + NODE_H / 2), active: true });

    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i], b = sorted[i + 1];
      result.push({ d: bezierPath(a.position.x + NODE_W, a.position.y + NODE_H / 2, b.position.x, b.position.y + NODE_H / 2), active: nodeIsActive(a) });
    }

    const last = sorted[sorted.length - 1];
    result.push({ d: bezierPath(last.position.x + NODE_W, last.position.y + NODE_H / 2, outputX, outputY), active: nodeIsActive(last) });
    return result;
  });

  // ── Library ──
  type Category = { label: string; types: NodeType[] };
  const categories: Category[] = [
    { label: 'Light', types: ['exposure', 'contrast', 'curves', 'filmicToneMap'] },
    { label: 'Color', types: ['temperature', 'saturation', 'hsl', 'colorGrade'] },
    { label: 'Detail', types: ['caCorrection', 'dehaze', 'clarity', 'sharpen', 'denoise'] },
    { label: 'Effects', types: ['vignette', 'grain'] },
  ];

  function isNodeInGraph(type: NodeType): boolean {
    return graph.nodes.some(n => n.type === type);
  }

  let dragFromLibrary = $state<NodeType | null>(null);
  let dropIndicator = $state<{ x: number; y: number } | null>(null);

  function handleLibDragStart(type: NodeType, e: DragEvent) {
    dragFromLibrary = type;
    e.dataTransfer!.effectAllowed = 'copy';
    e.dataTransfer!.setData('text/plain', type);
  }

  function handleCanvasDragOver(e: DragEvent) {
    if (!dragFromLibrary) return;
    e.preventDefault();
    const rect = canvasEl?.getBoundingClientRect();
    if (rect) {
      dropIndicator = { x: (e.clientX - rect.left - translateX) / zoom, y: (e.clientY - rect.top - translateY) / zoom };
    }
  }

  function handleCanvasDrop(e: DragEvent) {
    e.preventDefault();
    if (!dragFromLibrary || !canvasEl) { dragFromLibrary = null; dropIndicator = null; return; }
    const rect = canvasEl.getBoundingClientRect();
    const dropX = (e.clientX - rect.left - translateX) / zoom - NODE_W / 2;
    const dropY = (e.clientY - rect.top - translateY) / zoom - NODE_H / 2;

    const newNode = createNode(dragFromLibrary, {
      position: { x: Math.max(CANVAS_LEFT_PAD, dropX), y: dropY },
    });
    onGraphChange({ ...graph, nodes: [...graph.nodes, newNode] });
    onSelectNode(newNode.id);
    dragFromLibrary = null;
    dropIndicator = null;
  }

  // ── Node drag ──
  let draggingNode = $state<string | null>(null);
  let dragOffset = { x: 0, y: 0 };

  function handleNodeMouseDown(nodeId: string, e: MouseEvent) {
    if (e.button !== 0) return; // only left click
    e.stopPropagation();
    draggingNode = nodeId;
    onSelectNode(nodeId);

    const node = graph.nodes.find(n => n.id === nodeId);
    if (!node || !canvasEl) return;

    const rect = canvasEl.getBoundingClientRect();
    dragOffset = {
      x: (e.clientX - rect.left - translateX) / zoom - node.position.x,
      y: (e.clientY - rect.top - translateY) / zoom - node.position.y,
    };

    function onMove(ev: MouseEvent) {
      if (!draggingNode || !canvasEl) return;
      const r = canvasEl.getBoundingClientRect();
      const x = (ev.clientX - r.left - translateX) / zoom - dragOffset.x;
      const y = (ev.clientY - r.top - translateY) / zoom - dragOffset.y;
      const nodes = graph.nodes.map(n =>
        n.id === draggingNode ? { ...n, position: { x: Math.max(CANVAS_LEFT_PAD, x), y } } : n
      );
      onGraphChange({ ...graph, nodes });
    }

    function onUp() {
      draggingNode = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function toggleNode(id: string) {
    const nodes = graph.nodes.map(n => n.id === id ? { ...n, enabled: !n.enabled } : n);
    onGraphChange({ ...graph, nodes });
  }

  function removeNode(id: string) {
    onGraphChange({ ...graph, nodes: graph.nodes.filter(n => n.id !== id) });
    if (selectedNodeId === id) onSelectNode(null);
  }

  function handleCanvasClick(e: MouseEvent) {
    if ((e.target as HTMLElement)?.closest('.node-box') || (e.target as HTMLElement)?.closest('.node-library') || (e.target as HTMLElement)?.closest('.zoom-controls')) return;
    onSelectNode(null);
    showZoomMenu = false;
  }
</script>

<div class="node-editor-root" onclick={handleCanvasClick}>
  <!-- Graph canvas -->
  <div
    class="node-canvas"
    class:panning
    bind:this={canvasEl}
    onwheel={handleWheel}
    onmousedown={handleCanvasMouseDown}
    ondragover={handleCanvasDragOver}
    ondrop={handleCanvasDrop}
    ondragleave={() => dropIndicator = null}
    role="application"
  >
    <div class="graph-scaler" style="transform: translate({translateX}px, {translateY}px) scale({zoom}); width: {canvasW}px; height: {canvasH}px;">
      <svg class="wire-svg" width={canvasW} height={canvasH}>
        {#each wires as wire}
          <path d={wire.d} fill="none" stroke={wire.active ? '#7aad7a' : 'rgba(80,80,80,0.4)'} stroke-width="1.5" />
        {/each}
        <circle cx={inputPos.x} cy={inputPos.y} r={IO_R} fill="#4a8" stroke="#6c6" stroke-width="1.5" />
        <circle cx={outputX} cy={outputY} r={IO_R} fill="#4a8" stroke="#6c6" stroke-width="1.5" />
        {#if dropIndicator}
          <rect x={dropIndicator.x - NODE_W/2} y={dropIndicator.y - NODE_H/2} width={NODE_W} height={NODE_H} rx="4"
            fill="none" stroke="rgba(100,180,255,0.5)" stroke-width="1.5" stroke-dasharray="4 3" />
        {/if}
      </svg>

      {#each graph.nodes as node (node.id)}
        {@const def = NODE_REGISTRY[node.type]}
        {@const active = nodeIsActive(node)}
        {@const selected = selectedNodeId === node.id}
        {@const idx = sortedNodes.findIndex(n => n.id === node.id) + 1}
        <div
          class="node-box"
          class:active class:selected class:disabled={!node.enabled}
          style="left:{node.position.x}px; top:{node.position.y}px; width:{NODE_W}px; height:{NODE_H}px;"
          onmousedown={(e) => handleNodeMouseDown(node.id, e)}
          ondblclick={() => toggleNode(node.id)}
          role="button" tabindex="0"
        >
          <div class="conn conn-l">
            <svg width="10" height="10"><polygon points="0,0 10,5 0,10" fill="#4a8"/></svg>
          </div>
          <div class="node-inner">
            <span class="node-icon">{def?.icon ?? '⬜'}</span>
            <span class="node-label">{node.label}</span>
          </div>
          <div class="conn conn-r">
            <svg width="8" height="8"><rect width="8" height="8" rx="1.5" fill="#4a8"/></svg>
          </div>
          <div class="node-num">{String(idx).padStart(2, '0')}</div>
          {#if selected}
            <button class="node-del" onclick={(e) => { e.stopPropagation(); removeNode(node.id); }}>×</button>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Zoom controls overlay -->
    <div class="zoom-controls">
      <button class="zoom-btn" onclick={() => setZoomPreset(Math.max(10, Math.round(zoom * 100) - 25))} title="Zoom out">−</button>
      <button class="zoom-display" onclick={() => showZoomMenu = !showZoomMenu} title="Click for zoom presets">
        {isAutoFit ? 'Fit' : Math.round(zoom * 100) + '%'}
      </button>
      <button class="zoom-btn" onclick={() => setZoomPreset(Math.min(300, Math.round(zoom * 100) + 25))} title="Zoom in">+</button>

      {#if showZoomMenu}
        <div class="zoom-menu">
          <button class="zoom-menu-item" class:active={isAutoFit} onclick={resetToFit}>Fit to View</button>
          {#each ZOOM_PRESETS as pct}
            <button class="zoom-menu-item" class:active={!isAutoFit && Math.round(zoom * 100) === pct} onclick={() => setZoomPreset(pct)}>{pct}%</button>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <!-- Library sidebar -->
  <div class="node-library">
    <div class="lib-header">Library</div>
    <div class="lib-list">
      {#each categories as cat}
        <div class="lib-cat">
          <div class="cat-label">{cat.label}</div>
          {#each cat.types as type}
            {@const def = NODE_REGISTRY[type]}
            {@const inGraph = isNodeInGraph(type)}
            <div
              class="lib-item" class:used={inGraph}
              draggable={!inGraph}
              ondragstart={(e) => handleLibDragStart(type, e)}
              ondragend={() => { dragFromLibrary = null; dropIndicator = null; }}
            >
              <span>{def.icon}</span>
              <span class="lib-name">{def.label}</span>
            </div>
          {/each}
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .node-editor-root {
    display: flex;
    width: 100%;
    height: 100%;
    min-height: 80px;
    background: rgba(0,0,0,0.15);
    border-radius: 4px;
    overflow: hidden;
  }

  .node-canvas {
    flex: 1 1 0;
    overflow: hidden;
    position: relative;
    background: radial-gradient(ellipse at 50% 50%, rgba(30,35,45,1) 0%, rgba(18,18,24,1) 100%);
    cursor: default;
  }
  .node-canvas.panning { cursor: grabbing; }

  .graph-scaler {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: 0 0;
  }

  .wire-svg {
    position: absolute;
    top: 0; left: 0;
    pointer-events: none;
  }

  /* Nodes */
  .node-box {
    position: absolute;
    display: flex;
    align-items: center;
    border-radius: 6px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(35,38,48,0.95);
    cursor: grab;
    user-select: none;
    transition: border-color 0.12s, box-shadow 0.12s;
  }
  .node-box:hover { border-color: rgba(255,255,255,0.2); }
  .node-box.active { border-color: rgba(100,170,130,0.4); }
  .node-box.selected { border-color: rgba(100,180,255,0.7); box-shadow: 0 0 6px rgba(100,180,255,0.25); }
  .node-box.disabled { opacity: 0.35; border-style: dashed; }

  .node-inner {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    overflow: hidden;
  }
  .node-icon { font-size: 22px; line-height: 1; }
  .node-label { font-size: 11px; color: #999; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px; }
  .node-box.selected .node-label { color: #ddd; }

  .conn { position: absolute; display: flex; align-items: center; justify-content: center; }
  .conn-l { left: -7px; top: 50%; transform: translateY(-50%); }
  .conn-r { right: -6px; top: 50%; transform: translateY(-50%); }

  .node-num {
    position: absolute; bottom: 2px; left: 50%; transform: translateX(-50%);
    font-size: 9px; color: #555; font-family: monospace;
    background: rgba(20,20,28,0.8); padding: 1px 4px; border-radius: 2px;
  }
  .node-del {
    position: absolute; top: -8px; right: -8px; width: 18px; height: 18px;
    border-radius: 50%; border: 1px solid rgba(255,80,80,0.5);
    background: rgba(200,40,40,0.85); color: white; font-size: 12px;
    display: flex; align-items: center; justify-content: center; cursor: pointer;
  }

  /* Zoom controls */
  .zoom-controls {
    position: absolute;
    top: 6px;
    right: 6px;
    display: flex;
    align-items: center;
    gap: 1px;
    background: rgba(20,20,28,0.9);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 5px;
    padding: 2px;
    z-index: 5;
  }
  .zoom-btn {
    width: 22px; height: 22px;
    display: flex; align-items: center; justify-content: center;
    background: transparent; border: none; border-radius: 3px;
    color: #aaa; font-size: 14px; font-weight: 600;
    cursor: pointer; padding: 0;
    transition: background 0.1s, color 0.1s;
  }
  .zoom-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }

  .zoom-display {
    min-width: 40px; height: 22px;
    display: flex; align-items: center; justify-content: center;
    background: transparent; border: none; border-radius: 3px;
    color: #ccc; font-size: 10px; font-family: 'SF Mono', monospace;
    cursor: pointer; padding: 0 4px;
    transition: background 0.1s;
  }
  .zoom-display:hover { background: rgba(255,255,255,0.08); }

  .zoom-menu {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 4px;
    background: rgba(25,25,35,0.97);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 6px;
    padding: 4px 0;
    min-width: 110px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.5);
    z-index: 10;
  }
  .zoom-menu-item {
    display: block; width: 100%;
    padding: 5px 12px;
    background: transparent; border: none;
    color: #bbb; font-size: 11px; text-align: left;
    cursor: pointer; transition: background 0.1s;
  }
  .zoom-menu-item:hover { background: rgba(100,180,255,0.12); color: #fff; }
  .zoom-menu-item.active { color: #7aad7a; font-weight: 600; }

  /* Library */
  .node-library {
    width: 150px; flex-shrink: 0;
    border-left: 1px solid rgba(255,255,255,0.06);
    background: rgba(22,22,30,0.98);
    display: flex; flex-direction: column; overflow: hidden;
  }
  .lib-header { padding: 6px 10px; font-size: 11px; font-weight: 600; color: #bbb; border-bottom: 1px solid rgba(255,255,255,0.06); }
  .lib-list { flex: 1; overflow-y: auto; padding: 4px 0; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.08) transparent; }
  .lib-cat { margin-bottom: 2px; }
  .cat-label { padding: 4px 10px 2px; font-size: 9px; font-weight: 600; color: #555; text-transform: uppercase; letter-spacing: 0.05em; }
  .lib-item { display: flex; align-items: center; gap: 5px; padding: 3px 10px; cursor: grab; font-size: 10px; color: #aaa; }
  .lib-item:hover { background: rgba(100,180,255,0.08); }
  .lib-item.used { opacity: 0.35; cursor: default; }
  .lib-name { font-size: 10px; }
</style>
