<script lang="ts">
  import { type ProcessingNode, type NodeGraph, NODE_REGISTRY, nodeIsActive, createNode, type NodeType, DEFAULT_NODE_ORDER } from '../node-types';

  interface Props {
    graph: NodeGraph;
    onGraphChange: (graph: NodeGraph) => void;
    selectedNodeId: string | null;
    onSelectNode: (id: string | null) => void;
    onDimensionsChange?: (w: number, h: number) => void;
  }

  let { graph, onGraphChange, selectedNodeId, onSelectNode, onDimensionsChange }: Props = $props();

  // ── Layout constants ──
  const NODE_W = 80;
  const NODE_H = 44;
  const NODE_GAP = 16;
  const IO_R = 5;
  const LIBRARY_W = 150;

  // ── Canvas coordinate space ──
  // Width based on node count. Height grows to contain all nodes.
  const CANVAS_LEFT_PAD = 30;
  const CANVAS_RIGHT_PAD = 30;
  const MIN_CANVAS_H = 120;

  const canvasW = $derived(CANVAS_LEFT_PAD + graph.nodes.length * (NODE_W + NODE_GAP) + CANVAS_RIGHT_PAD);

  // Canvas height grows to contain all nodes (allows dragging anywhere)
  const maxNodeY = $derived(graph.nodes.length > 0
    ? Math.max(...graph.nodes.map(n => n.position.y + NODE_H + 20))
    : MIN_CANVAS_H);
  const canvasH = $derived(Math.max(MIN_CANVAS_H, maxNodeY));

  // I/O connectors: fixed X, but Y tracks the vertical center of the chain
  const avgNodeY = $derived(graph.nodes.length > 0
    ? graph.nodes.reduce((sum, n) => sum + n.position.y + NODE_H / 2, 0) / graph.nodes.length
    : canvasH / 2);
  const inputPos = $derived({ x: 8, y: avgNodeY });
  const outputX = $derived(canvasW - 8);
  const outputY = $derived(avgNodeY);

  // ── Canvas viewport tracking ──
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

  // Auto-zoom: fit the fixed canvas into the viewport
  const autoZoom = $derived.by(() => {
    if (viewportW < 10 || viewportH < 10) return 1;
    const sx = viewportW / canvasW;
    const sy = viewportH / canvasH;
    return Math.min(2, Math.max(0.3, Math.min(sx, sy)));
  });

  // Report dimensions for floating panel
  $effect(() => {
    onDimensionsChange?.(canvasW + LIBRARY_W, canvasH);
  });

  // Ensure all nodes have proper initial positions (horizontal row at Y=40)
  const DEFAULT_Y = 40;
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

  // ── Sorted by x for wire connections ──
  const sortedNodes = $derived([...graph.nodes].sort((a, b) => a.position.x - b.position.x));

  // ── Wires: cubic bezier splines (DaVinci style) ──
  // Horizontal tangent at endpoints, smooth S-curve between any two points
  function bezierPath(x1: number, y1: number, x2: number, y2: number): string {
    const dx = x2 - x1;
    // Control point offset: at least 30px, scales with distance
    // Capped to prevent wild loops on short horizontal spans
    const cpx = Math.min(Math.max(30, Math.abs(dx) * 0.45), Math.abs(dx) * 0.5 + 20);
    return `M${x1},${y1} C${x1 + cpx},${y1} ${x2 - cpx},${y2} ${x2},${y2}`;
  }

  const wires = $derived.by(() => {
    const result: { d: string; active: boolean }[] = [];
    const sorted = sortedNodes;
    if (sorted.length === 0) return result;

    // Input → first node (left connector)
    const first = sorted[0];
    result.push({
      d: bezierPath(inputPos.x, inputPos.y, first.position.x, first.position.y + NODE_H / 2),
      active: true,
    });

    // Node → Node
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i], b = sorted[i + 1];
      result.push({
        d: bezierPath(a.position.x + NODE_W, a.position.y + NODE_H / 2, b.position.x, b.position.y + NODE_H / 2),
        active: nodeIsActive(a),
      });
    }

    // Last node → output
    const last = sorted[sorted.length - 1];
    result.push({
      d: bezierPath(last.position.x + NODE_W, last.position.y + NODE_H / 2, outputX, outputY),
      active: nodeIsActive(last),
    });

    return result;
  });

  // ── Library categories ──
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

  // ── Drag from library ──
  function handleLibDragStart(type: NodeType, e: DragEvent) {
    dragFromLibrary = type;
    e.dataTransfer!.effectAllowed = 'copy';
    e.dataTransfer!.setData('text/plain', type);
  }

  let dragFromLibrary = $state<NodeType | null>(null);
  let dropIndicator = $state<{ x: number; y: number } | null>(null);

  function handleCanvasDragOver(e: DragEvent) {
    if (!dragFromLibrary) return;
    e.preventDefault();
    const rect = canvasEl?.getBoundingClientRect();
    if (rect) {
      dropIndicator = { x: (e.clientX - rect.left) / autoZoom, y: (e.clientY - rect.top) / autoZoom };
    }
  }

  function handleCanvasDrop(e: DragEvent) {
    e.preventDefault();
    if (!dragFromLibrary || !canvasEl) { dragFromLibrary = null; dropIndicator = null; return; }
    const rect = canvasEl.getBoundingClientRect();
    const dropX = (e.clientX - rect.left) / autoZoom - NODE_W / 2;
    const dropY = (e.clientY - rect.top) / autoZoom - NODE_H / 2;

    const newNode = createNode(dragFromLibrary, {
      position: { x: Math.max(CANVAS_LEFT_PAD, dropX), y: Math.max(CANVAS_TOP_PAD, dropY) },
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
    e.stopPropagation();
    draggingNode = nodeId;
    onSelectNode(nodeId);

    const node = graph.nodes.find(n => n.id === nodeId);
    if (!node || !canvasEl) return;

    const rect = canvasEl.getBoundingClientRect();
    dragOffset = {
      x: (e.clientX - rect.left) / autoZoom - node.position.x,
      y: (e.clientY - rect.top) / autoZoom - node.position.y,
    };

    function onMove(ev: MouseEvent) {
      if (!draggingNode || !canvasEl) return;
      const r = canvasEl.getBoundingClientRect();
      const x = (ev.clientX - r.left) / autoZoom - dragOffset.x;
      const y = (ev.clientY - r.top) / autoZoom - dragOffset.y;
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
    if ((e.target as HTMLElement)?.closest('.node-box') || (e.target as HTMLElement)?.closest('.node-library')) return;
    onSelectNode(null);
  }
</script>

<div class="node-editor-root" onclick={handleCanvasClick}>
  <!-- Graph canvas -->
  <div
    class="node-canvas"
    bind:this={canvasEl}
    ondragover={handleCanvasDragOver}
    ondrop={handleCanvasDrop}
    ondragleave={() => dropIndicator = null}
    role="application"
  >
    <div class="graph-scaler" style="transform: translate({(viewportW - canvasW * autoZoom) / 2}px, {(viewportH - canvasH * autoZoom) / 2}px) scale({autoZoom}); width: {canvasW}px; height: {canvasH}px;">
      <!-- SVG wires + connectors -->
      <svg class="wire-svg" width={canvasW} height={canvasH}>
        {#each wires as wire}
          <path d={wire.d} fill="none"
            stroke={wire.active ? '#7aad7a' : 'rgba(80,80,80,0.4)'}
            stroke-width="1.5" />
        {/each}

        <!-- Input green dot -->
        <circle cx={inputPos.x} cy={inputPos.y} r={IO_R} fill="#4a8" stroke="#6c6" stroke-width="1.5" />
        <!-- Output green dot -->
        <circle cx={outputX} cy={outputY} r={IO_R} fill="#4a8" stroke="#6c6" stroke-width="1.5" />

        {#if dropIndicator}
          <rect x={dropIndicator.x - NODE_W/2} y={dropIndicator.y - NODE_H/2}
            width={NODE_W} height={NODE_H} rx="4"
            fill="none" stroke="rgba(100,180,255,0.5)" stroke-width="1.5" stroke-dasharray="4 3" />
        {/if}
      </svg>

      <!-- Node boxes -->
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
          <!-- Left connector -->
          <div class="conn conn-l">
            <svg width="8" height="8"><polygon points="0,0 8,4 0,8" fill="#4a8"/></svg>
          </div>
          <div class="node-inner">
            <span class="node-icon">{def?.icon ?? '⬜'}</span>
            <span class="node-label">{node.label}</span>
          </div>
          <!-- Right connector -->
          <div class="conn conn-r">
            <svg width="6" height="6"><rect width="6" height="6" rx="1" fill="#4a8"/></svg>
          </div>
          <div class="node-num">{String(idx).padStart(2, '0')}</div>
          {#if selected}
            <button class="node-del" onclick={(e) => { e.stopPropagation(); removeNode(node.id); }}>×</button>
          {/if}
        </div>
      {/each}
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
  }

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
    border-radius: 4px;
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
  .node-icon { font-size: 13px; line-height: 1; }
  .node-label { font-size: 8px; color: #999; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 68px; }
  .node-box.selected .node-label { color: #ddd; }

  .conn { position: absolute; display: flex; align-items: center; justify-content: center; }
  .conn-l { left: -5px; top: 50%; transform: translateY(-50%); }
  .conn-r { right: -5px; top: 50%; transform: translateY(-50%); }

  .node-num {
    position: absolute; bottom: -1px; left: 50%; transform: translateX(-50%);
    font-size: 7px; color: #555; font-family: monospace;
    background: rgba(20,20,28,0.8); padding: 0 3px; border-radius: 2px;
  }
  .node-del {
    position: absolute; top: -6px; right: -6px; width: 14px; height: 14px;
    border-radius: 50%; border: 1px solid rgba(255,80,80,0.5);
    background: rgba(200,40,40,0.85); color: white; font-size: 10px;
    display: flex; align-items: center; justify-content: center; cursor: pointer;
  }

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
