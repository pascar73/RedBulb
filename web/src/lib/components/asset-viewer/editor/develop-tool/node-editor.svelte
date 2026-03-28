<script lang="ts">
  import { type ProcessingNode, type NodeGraph, NODE_REGISTRY, nodeIsActive, createNode, type NodeType, DEFAULT_NODE_ORDER } from '../node-types';

  interface Props {
    graph: NodeGraph;
    onGraphChange: (graph: NodeGraph) => void;
    selectedNodeId: string | null;
    onSelectNode: (id: string | null) => void;
    /** Expose computed content dimensions for floating panel zoom-to-fit */
    onDimensionsChange?: (w: number, h: number) => void;
  }

  let { graph, onGraphChange, selectedNodeId, onSelectNode, onDimensionsChange }: Props = $props();

  // ── Layout constants ──
  const NODE_W = 90;
  const NODE_H = 48;
  const NODE_GAP = 16;
  const WIRE_Y = 24; // center of node for wire connections
  const PAD_X = 20;
  const PAD_Y = 16;
  const CONNECTOR_R = 5;

  // ── Drag state ──
  let dragIndex = $state<number | null>(null);
  let dragOverIndex = $state<number | null>(null);

  // ── Computed positions ──
  function nodeX(i: number): number { return PAD_X + i * (NODE_W + NODE_GAP); }
  function nodeY(_i: number): number { return PAD_Y; }

  const totalWidth = $derived(PAD_X * 2 + graph.nodes.length * (NODE_W + NODE_GAP) - NODE_GAP + NODE_W); // extra for add button
  const totalHeight = PAD_Y * 2 + NODE_H + 10;

  // Notify parent of content dimensions for zoom-to-fit
  $effect(() => {
    onDimensionsChange?.(totalWidth, totalHeight);
  });

  // ── Drag handlers ──
  function handleDragStart(index: number, e: DragEvent) {
    dragIndex = index;
    e.dataTransfer!.effectAllowed = 'move';
    e.dataTransfer!.setData('text/plain', String(index));
  }

  function handleDragOver(index: number, e: DragEvent) {
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';
    dragOverIndex = index;
  }

  function handleDrop(index: number, e: DragEvent) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) { dragIndex = null; dragOverIndex = null; return; }

    const nodes = [...graph.nodes];
    const [removed] = nodes.splice(dragIndex, 1);
    nodes.splice(index, 0, removed);
    // Update positions
    nodes.forEach((n, i) => { n.position = { x: nodeX(i), y: nodeY(i) }; });
    onGraphChange({ ...graph, nodes });
    dragIndex = null;
    dragOverIndex = null;
  }

  function handleDragEnd() {
    dragIndex = null;
    dragOverIndex = null;
  }

  function toggleNode(id: string) {
    const nodes = graph.nodes.map(n => n.id === id ? { ...n, enabled: !n.enabled } : n);
    onGraphChange({ ...graph, nodes });
  }

  function removeNode(id: string) {
    const nodes = graph.nodes.filter(n => n.id !== id);
    nodes.forEach((n, i) => { n.position = { x: nodeX(i), y: nodeY(i) }; });
    onGraphChange({ ...graph, nodes });
    if (selectedNodeId === id) onSelectNode(null);
  }

  // ── Add node ──
  let showAddMenu = $state(false);

  function addNode(type: NodeType) {
    // Don't add duplicates for most types
    if (graph.nodes.some(n => n.type === type)) { showAddMenu = false; return; }
    const node = createNode(type);
    const nodes = [...graph.nodes, node];
    nodes.forEach((n, i) => { n.position = { x: nodeX(i), y: nodeY(i) }; });
    onGraphChange({ ...graph, nodes });
    showAddMenu = false;
    onSelectNode(node.id);
  }

  function getAvailableNodeTypes(): NodeType[] {
    const existing = new Set(graph.nodes.map(n => n.type));
    return DEFAULT_NODE_ORDER.filter(t => !existing.has(t));
  }
</script>

<!-- DaVinci-style node graph — horizontal serial chain -->
<div class="node-editor-container">
  <svg
    width={totalWidth}
    height={totalHeight}
    viewBox="0 0 {totalWidth} {totalHeight}"
    class="node-graph"
  >
    <!-- Wires between nodes -->
    {#each graph.nodes as node, i}
      {#if i > 0}
        {@const x1 = nodeX(i - 1) + NODE_W + CONNECTOR_R}
        {@const x2 = nodeX(i) - CONNECTOR_R}
        {@const y = PAD_Y + WIRE_Y}
        <line
          {x1} y1={y} {x2} y2={y}
          stroke={nodeIsActive(graph.nodes[i - 1]) ? 'rgba(100, 180, 255, 0.5)' : 'rgba(100, 100, 100, 0.3)'}
          stroke-width="2"
          stroke-dasharray={nodeIsActive(graph.nodes[i - 1]) ? 'none' : '4 3'}
        />
      {/if}
    {/each}

    <!-- Input connector (left) -->
    <circle cx={PAD_X - CONNECTOR_R - 4} cy={PAD_Y + WIRE_Y} r={CONNECTOR_R}
      fill="rgba(100, 180, 255, 0.4)" stroke="rgba(100, 180, 255, 0.7)" stroke-width="1" />

    <!-- Output connector (right) -->
    {#if graph.nodes.length > 0}
      <circle
        cx={nodeX(graph.nodes.length - 1) + NODE_W + CONNECTOR_R + 4}
        cy={PAD_Y + WIRE_Y}
        r={CONNECTOR_R}
        fill="rgba(100, 180, 255, 0.4)" stroke="rgba(100, 180, 255, 0.7)" stroke-width="1" />
    {/if}
  </svg>

  <!-- Nodes (HTML overlay for better interaction) -->
  <div class="nodes-overlay" style="width: {totalWidth}px; height: {totalHeight}px;">
    {#each graph.nodes as node, i (node.id)}
      {@const def = NODE_REGISTRY[node.type]}
      {@const active = nodeIsActive(node)}
      {@const selected = selectedNodeId === node.id}
      {@const isDragTarget = dragOverIndex === i && dragIndex !== i}
      <div
        class="node-box"
        class:active
        class:selected
        class:disabled={!node.enabled}
        class:drag-target={isDragTarget}
        style="left: {nodeX(i)}px; top: {PAD_Y}px; width: {NODE_W}px; height: {NODE_H}px;"
        draggable="true"
        ondragstart={(e) => handleDragStart(i, e)}
        ondragover={(e) => handleDragOver(i, e)}
        ondrop={(e) => handleDrop(i, e)}
        ondragend={handleDragEnd}
        onclick={() => onSelectNode(node.id)}
        ondblclick={() => toggleNode(node.id)}
        role="button"
        tabindex="0"
      >
        <span class="node-icon">{def?.icon ?? '⬜'}</span>
        <span class="node-label">{node.label}</span>
        {#if selected}
          <button class="node-remove" onclick={(e) => { e.stopPropagation(); removeNode(node.id); }} title="Remove node">×</button>
        {/if}
      </div>
    {/each}

    <!-- Add node button -->
    <div class="add-node-area" style="left: {nodeX(graph.nodes.length)}px; top: {PAD_Y}px;">
      <button class="add-node-btn" onclick={() => showAddMenu = !showAddMenu} title="Add node">+</button>
      {#if showAddMenu}
        <div class="add-menu">
          {#each getAvailableNodeTypes() as type}
            {@const def = NODE_REGISTRY[type]}
            <button class="add-menu-item" onclick={() => addNode(type)}>
              <span>{def.icon}</span> {def.label}
            </button>
          {/each}
          {#if getAvailableNodeTypes().length === 0}
            <div class="add-menu-empty">All nodes added</div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .node-editor-container {
    position: relative;
    overflow-x: auto;
    overflow-y: hidden;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,0.15) transparent;
  }
  .node-graph {
    display: block;
  }
  .nodes-overlay {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
  }
  .node-box {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    border-radius: 6px;
    border: 1.5px solid rgba(255, 255, 255, 0.1);
    background: rgba(40, 40, 50, 0.9);
    cursor: grab;
    pointer-events: auto;
    transition: border-color 0.15s, box-shadow 0.15s, opacity 0.15s;
    user-select: none;
  }
  .node-box:hover {
    border-color: rgba(255, 255, 255, 0.25);
  }
  .node-box.active {
    border-color: rgba(100, 180, 255, 0.4);
    background: rgba(30, 50, 70, 0.9);
  }
  .node-box.selected {
    border-color: rgba(100, 180, 255, 0.8);
    box-shadow: 0 0 8px rgba(100, 180, 255, 0.3);
  }
  .node-box.disabled {
    opacity: 0.4;
    border-style: dashed;
  }
  .node-box.drag-target {
    border-color: rgba(255, 200, 50, 0.6);
    box-shadow: 0 0 6px rgba(255, 200, 50, 0.3);
  }
  .node-icon {
    font-size: 14px;
    line-height: 1;
  }
  .node-label {
    font-size: 9px;
    color: #aaa;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 80px;
  }
  .node-box.active .node-label { color: #ccc; }
  .node-box.selected .node-label { color: #fff; }

  .node-remove {
    position: absolute;
    top: -6px;
    right: -6px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 1px solid rgba(255, 80, 80, 0.6);
    background: rgba(255, 40, 40, 0.8);
    color: white;
    font-size: 11px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    pointer-events: auto;
  }
  .node-remove:hover {
    background: rgba(255, 40, 40, 1);
  }

  .add-node-area {
    position: absolute;
    pointer-events: auto;
  }
  .add-node-btn {
    width: 36px;
    height: 48px;
    border: 1.5px dashed rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    background: transparent;
    color: rgba(255, 255, 255, 0.3);
    font-size: 20px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .add-node-btn:hover {
    border-color: rgba(100, 180, 255, 0.4);
    color: rgba(100, 180, 255, 0.7);
  }
  .add-menu {
    position: absolute;
    top: 52px;
    left: 0;
    background: rgba(30, 30, 40, 0.97);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 6px;
    padding: 4px;
    min-width: 140px;
    z-index: 10;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    max-height: 300px;
    overflow-y: auto;
  }
  .add-menu-item {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 5px 8px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: #ccc;
    font-size: 11px;
    cursor: pointer;
    text-align: left;
  }
  .add-menu-item:hover {
    background: rgba(100, 180, 255, 0.15);
    color: #fff;
  }
  .add-menu-empty {
    padding: 8px;
    color: #666;
    font-size: 11px;
    text-align: center;
  }
</style>
