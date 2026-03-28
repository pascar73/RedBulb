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
  const CONNECTOR_R = 4;
  const IO_R = 5;           // Input/output green dot radius
  const LIBRARY_W = 160;    // Right sidebar width
  const CANVAS_PAD = 24;

  // ── Canvas pan/scroll state ──
  let canvasEl = $state<HTMLDivElement | undefined>(undefined);

  // ── Drag from library state ──
  let dragFromLibrary = $state<NodeType | null>(null);
  let dropIndicator = $state<{ x: number; y: number } | null>(null);

  // ── Node drag state ──
  let draggingNode = $state<string | null>(null);
  let dragOffset = { x: 0, y: 0 };

  // ── Computed bounds ──
  const graphBounds = $derived.by(() => {
    if (graph.nodes.length === 0) return { minX: 0, minY: 0, maxX: 400, maxY: 200 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of graph.nodes) {
      minX = Math.min(minX, n.position.x);
      minY = Math.min(minY, n.position.y);
      maxX = Math.max(maxX, n.position.x + NODE_W);
      maxY = Math.max(maxY, n.position.y + NODE_H);
    }
    return { minX: minX - CANVAS_PAD, minY: minY - CANVAS_PAD, maxX: maxX + CANVAS_PAD, maxY: maxY + CANVAS_PAD };
  });

  const canvasW = $derived(Math.max(400, graphBounds.maxX - graphBounds.minX + CANVAS_PAD * 2 + IO_R * 4));
  const canvasH = $derived(Math.max(120, graphBounds.maxY - graphBounds.minY + CANVAS_PAD * 2));

  // Input/output connector positions (green dots)
  const inputPos = $derived({ x: 6, y: canvasH / 2 });
  const outputPos = $derived({ x: canvasW - 6, y: canvasH / 2 });

  // Report dimensions
  $effect(() => {
    onDimensionsChange?.(canvasW + LIBRARY_W, canvasH);
  });

  // ── Node center helpers ──
  function nodeLeft(n: ProcessingNode) { return n.position.x; }
  function nodeRight(n: ProcessingNode) { return n.position.x + NODE_W; }
  function nodeCenterY(n: ProcessingNode) { return n.position.y + NODE_H / 2; }

  // ── Wires: connect nodes in serial order (sorted by x position) ──
  const sortedNodes = $derived([...graph.nodes].sort((a, b) => a.position.x - b.position.x));

  const wires = $derived.by(() => {
    const result: { x1: number; y1: number; x2: number; y2: number; active: boolean }[] = [];
    const sorted = sortedNodes;
    if (sorted.length === 0) return result;

    // Input → first node
    result.push({
      x1: inputPos.x, y1: inputPos.y,
      x2: nodeLeft(sorted[0]), y2: nodeCenterY(sorted[0]),
      active: true,
    });

    // Node → node
    for (let i = 0; i < sorted.length - 1; i++) {
      result.push({
        x1: nodeRight(sorted[i]), y1: nodeCenterY(sorted[i]),
        x2: nodeLeft(sorted[i + 1]), y2: nodeCenterY(sorted[i + 1]),
        active: nodeIsActive(sorted[i]),
      });
    }

    // Last node → output
    const last = sorted[sorted.length - 1];
    result.push({
      x1: nodeRight(last), y1: nodeCenterY(last),
      x2: outputPos.x, y2: outputPos.y,
      active: nodeIsActive(last),
    });

    return result;
  });

  // ── Library: categorized node types ──
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
  function handleLibraryDragStart(type: NodeType, e: DragEvent) {
    dragFromLibrary = type;
    e.dataTransfer!.effectAllowed = 'copy';
    e.dataTransfer!.setData('text/plain', type);
  }

  function handleCanvasDragOver(e: DragEvent) {
    if (!dragFromLibrary) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'copy';
    const rect = canvasEl?.getBoundingClientRect();
    if (rect) {
      dropIndicator = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
  }

  function handleCanvasDrop(e: DragEvent) {
    e.preventDefault();
    if (!dragFromLibrary || !canvasEl) { dragFromLibrary = null; dropIndicator = null; return; }

    const rect = canvasEl.getBoundingClientRect();
    const dropX = e.clientX - rect.left;
    const dropY = e.clientY - rect.top;

    const newNode = createNode(dragFromLibrary, {
      position: { x: dropX - NODE_W / 2, y: dropY - NODE_H / 2 },
    });

    // If first node, center it
    const nodes = [...graph.nodes, newNode];
    onGraphChange({ ...graph, nodes });
    onSelectNode(newNode.id);

    dragFromLibrary = null;
    dropIndicator = null;
  }

  function handleCanvasDragLeave() {
    dropIndicator = null;
  }

  // ── Node drag on canvas ──
  function handleNodeMouseDown(nodeId: string, e: MouseEvent) {
    e.stopPropagation();
    const node = graph.nodes.find(n => n.id === nodeId);
    if (!node) return;
    draggingNode = nodeId;
    dragOffset = { x: e.offsetX, y: e.offsetY };
    onSelectNode(nodeId);

    function onMouseMove(ev: MouseEvent) {
      if (!draggingNode || !canvasEl) return;
      const rect = canvasEl.getBoundingClientRect();
      const x = ev.clientX - rect.left - dragOffset.x;
      const y = ev.clientY - rect.top - dragOffset.y;
      const nodes = graph.nodes.map(n =>
        n.id === draggingNode ? { ...n, position: { x: Math.max(0, x), y: Math.max(0, y) } } : n
      );
      onGraphChange({ ...graph, nodes });
    }

    function onMouseUp() {
      draggingNode = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  function toggleNode(id: string) {
    const nodes = graph.nodes.map(n => n.id === id ? { ...n, enabled: !n.enabled } : n);
    onGraphChange({ ...graph, nodes });
  }

  function removeNode(id: string) {
    const nodes = graph.nodes.filter(n => n.id !== id);
    onGraphChange({ ...graph, nodes });
    if (selectedNodeId === id) onSelectNode(null);
  }

  function handleCanvasClick(e: MouseEvent) {
    // Click on empty canvas = deselect
    if (e.target === canvasEl || (e.target as HTMLElement)?.classList?.contains('canvas-svg')) {
      onSelectNode(null);
    }
  }
</script>

<div class="node-editor-root">
  <!-- Canvas area -->
  <div
    class="node-canvas"
    bind:this={canvasEl}
    ondragover={handleCanvasDragOver}
    ondrop={handleCanvasDrop}
    ondragleave={handleCanvasDragLeave}
    onclick={handleCanvasClick}
    role="application"
  >
    <!-- SVG layer: wires + I/O dots -->
    <svg class="canvas-svg" viewBox="0 0 {canvasW} {canvasH}" preserveAspectRatio="xMidYMid meet">
      <!-- Wires -->
      {#each wires as wire}
        <line
          x1={wire.x1} y1={wire.y1} x2={wire.x2} y2={wire.y2}
          stroke={wire.active ? 'rgba(140, 180, 140, 0.5)' : 'rgba(80, 80, 80, 0.4)'}
          stroke-width="1.5"
        />
      {/each}

      <!-- Input connector (green dot) -->
      <circle cx={inputPos.x} cy={inputPos.y} r={IO_R}
        fill="#4a8" stroke="#6c6" stroke-width="1.5" />

      <!-- Output connector (green dot) -->
      <circle cx={outputPos.x} cy={outputPos.y} r={IO_R}
        fill="#4a8" stroke="#6c6" stroke-width="1.5" />

      <!-- Drop indicator -->
      {#if dropIndicator}
        <rect
          x={dropIndicator.x - NODE_W / 2} y={dropIndicator.y - NODE_H / 2}
          width={NODE_W} height={NODE_H}
          rx="4" fill="none" stroke="rgba(100, 180, 255, 0.5)" stroke-width="1.5" stroke-dasharray="4 3"
        />
      {/if}
    </svg>

    <!-- Node boxes (HTML overlay) -->
    {#each graph.nodes as node (node.id)}
      {@const def = NODE_REGISTRY[node.type]}
      {@const active = nodeIsActive(node)}
      {@const selected = selectedNodeId === node.id}
      {@const idx = sortedNodes.findIndex(n => n.id === node.id) + 1}
      <div
        class="node-box"
        class:active
        class:selected
        class:disabled={!node.enabled}
        style="left: {node.position.x}px; top: {node.position.y}px; width: {NODE_W}px; height: {NODE_H}px;"
        onmousedown={(e) => handleNodeMouseDown(node.id, e)}
        ondblclick={() => toggleNode(node.id)}
        role="button"
        tabindex="0"
      >
        <!-- Left connector (green input) -->
        <div class="node-connector left">
          <svg width="8" height="8"><polygon points="0,0 8,4 0,8" fill="#4a8"/></svg>
        </div>

        <!-- Node content -->
        <div class="node-content">
          <span class="node-icon">{def?.icon ?? '⬜'}</span>
          <span class="node-label">{node.label}</span>
        </div>

        <!-- Right connector (green output) -->
        <div class="node-connector right">
          <svg width="6" height="6"><rect width="6" height="6" rx="1" fill="#4a8"/></svg>
        </div>

        <!-- Node number badge -->
        <div class="node-number">{String(idx).padStart(2, '0')}</div>

        <!-- Remove button (selected only) -->
        {#if selected}
          <button class="node-remove" onclick={(e) => { e.stopPropagation(); removeNode(node.id); }}>×</button>
        {/if}
      </div>
    {/each}
  </div>

  <!-- Library sidebar -->
  <div class="node-library">
    <div class="library-header">Library</div>
    <div class="library-list">
      {#each categories as cat}
        <div class="library-category">
          <div class="category-label">{cat.label}</div>
          <div class="category-items">
            {#each cat.types as type}
              {@const def = NODE_REGISTRY[type]}
              {@const inGraph = isNodeInGraph(type)}
              <div
                class="library-item"
                class:in-graph={inGraph}
                draggable={!inGraph}
                ondragstart={(e) => handleLibraryDragStart(type, e)}
                ondragend={() => { dragFromLibrary = null; dropIndicator = null; }}
                title={inGraph ? `${def.label} (already in graph)` : `Drag to add ${def.label}`}
              >
                <span class="lib-icon">{def.icon}</span>
                <span class="lib-name">{def.label}</span>
              </div>
            {/each}
          </div>
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
  }

  /* ── Canvas ── */
  .node-canvas {
    flex: 1 1 0;
    position: relative;
    overflow: auto;
    background:
      radial-gradient(circle at 50% 50%, rgba(30, 35, 45, 1) 0%, rgba(18, 18, 24, 1) 100%);
    scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,0.08) transparent;
  }
  .canvas-svg {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  /* ── Nodes ── */
  .node-box {
    position: absolute;
    display: flex;
    align-items: center;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(35, 38, 48, 0.95);
    cursor: grab;
    user-select: none;
    transition: border-color 0.12s, box-shadow 0.12s;
  }
  .node-box:hover { border-color: rgba(255, 255, 255, 0.2); }
  .node-box.active { border-color: rgba(100, 170, 130, 0.4); }
  .node-box.selected {
    border-color: rgba(100, 180, 255, 0.7);
    box-shadow: 0 0 6px rgba(100, 180, 255, 0.25);
  }
  .node-box.disabled { opacity: 0.35; border-style: dashed; }

  .node-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    overflow: hidden;
  }
  .node-icon { font-size: 13px; line-height: 1; }
  .node-label {
    font-size: 8px;
    color: #999;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 68px;
  }
  .node-box.selected .node-label { color: #ddd; }

  .node-connector {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .node-connector.left { left: -5px; top: 50%; transform: translateY(-50%); }
  .node-connector.right { right: -5px; top: 50%; transform: translateY(-50%); }

  .node-number {
    position: absolute;
    bottom: -1px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 7px;
    color: #666;
    font-family: 'SF Mono', monospace;
    background: rgba(20, 20, 28, 0.8);
    padding: 0 3px;
    border-radius: 2px;
  }

  .node-remove {
    position: absolute;
    top: -6px; right: -6px;
    width: 14px; height: 14px;
    border-radius: 50%;
    border: 1px solid rgba(255, 80, 80, 0.5);
    background: rgba(200, 40, 40, 0.85);
    color: white;
    font-size: 10px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .node-remove:hover { background: rgba(255, 40, 40, 1); }

  /* ── Library sidebar ── */
  .node-library {
    width: 160px;
    flex-shrink: 0;
    border-left: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(22, 22, 30, 0.98);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .library-header {
    padding: 6px 10px;
    font-size: 11px;
    font-weight: 600;
    color: #bbb;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    flex-shrink: 0;
  }
  .library-list {
    flex: 1 1 0;
    overflow-y: auto;
    padding: 4px 0;
    scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,0.08) transparent;
  }
  .library-category {
    margin-bottom: 2px;
  }
  .category-label {
    padding: 4px 10px 2px;
    font-size: 9px;
    font-weight: 600;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .category-items {
    display: flex;
    flex-direction: column;
  }
  .library-item {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 3px 10px;
    cursor: grab;
    transition: background 0.1s;
  }
  .library-item:hover { background: rgba(100, 180, 255, 0.08); }
  .library-item.in-graph {
    opacity: 0.35;
    cursor: default;
  }
  .lib-icon { font-size: 11px; }
  .lib-name { font-size: 10px; color: #aaa; }
  .library-item.in-graph .lib-name { color: #666; }
</style>
