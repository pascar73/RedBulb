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

  // ── Per-node positions (draggable) ──
  // Use a plain object (not Map) to avoid Svelte proxy issues
  let positionStore: Record<string, { x: number; y: number }> = {};
  let posTick = $state(0); // bump to trigger reactivity

  function getNodePos(nodeId: string, idx: number): { x: number; y: number } {
    void posTick; // subscribe to changes
    if (positionStore[nodeId]) return positionStore[nodeId];
    // Lazily initialize default position
    const pos = { x: 80 + idx * (NODE_W + NODE_GAP), y: 60 };
    positionStore[nodeId] = pos;
    return pos;
  }

  function setNodePos(nodeId: string, x: number, y: number) {
    positionStore[nodeId] = { x, y };
    posTick++; // trigger reactivity
  }

  // ── Viewport ──
  let canvasEl = $state<HTMLDivElement | undefined>(undefined);
  let viewportW = $state(400);
  let viewportH = $state(200);

  $effect(() => {
    if (!canvasEl) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) { viewportW = e.contentRect.width; viewportH = e.contentRect.height; }
    });
    ro.observe(canvasEl);
    return () => ro.disconnect();
  });

  // ── Canvas size (derived from node positions) ──
  const canvasW = $derived.by(() => {
    void posTick;
    let maxX = 0;
    for (let i = 0; i < nodes.length; i++) {
      const p = getNodePos(nodes[i].id, i);
      maxX = Math.max(maxX, p.x + NODE_W);
    }
    return Math.max(400, maxX + 80);
  });

  const canvasH = $derived.by(() => {
    void posTick;
    let maxY = 0;
    for (let i = 0; i < nodes.length; i++) {
      const p = getNodePos(nodes[i].id, i);
      maxY = Math.max(maxY, p.y + NODE_H);
    }
    return Math.max(180, maxY + 40);
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

  // ── I/O wire endpoints (in SVG coordinates) ──
  // IN/OUT should be at the same y as their connected nodes for clean wire routing
  const ioY = $derived.by(() => {
    void posTick; // Subscribe to position changes
    if (nodes.length === 0) return canvasH / 2;
    // Use y position of first node (they're sorted by x for wire order)
    const sorted = nodes.map((n, i) => ({ node: n, pos: getNodePos(n.id, i) }))
      .sort((a, b) => a.pos.x - b.pos.x);
    return sorted[0].pos.y + NODE_H / 2;
  });
  const inputX = 16;
  const outputX = $derived(canvasW - 16);

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

    void posTick;
    // Get positions sorted by x for wire order
    const sorted = nodes.map((n, i) => ({ node: n, pos: getNodePos(n.id, i) }))
      .sort((a, b) => a.pos.x - b.pos.x);

    // IN → first node (input connector on left side of node)
    const first = sorted[0];
    result.push({ d: bezierPath(inputX, ioY, first.pos.x, first.pos.y + NODE_H / 2), active: true });

    // Node → Node wires (output of one → input of next)
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i], b = sorted[i + 1];
      const active = !a.node.bypass && hasActiveChanges(a.node.state);
      result.push({ d: bezierPath(
        a.pos.x + NODE_W, a.pos.y + NODE_H / 2,
        b.pos.x, b.pos.y + NODE_H / 2,
      ), active });
    }

    // Last node → OUT
    const last = sorted[sorted.length - 1];
    const lastActive = !last.node.bypass && hasActiveChanges(last.node.state);
    result.push({ d: bezierPath(last.pos.x + NODE_W, last.pos.y + NODE_H / 2, outputX, ioY), active: lastActive });

    return result;
  });

  // ── Node dragging ──
  let draggingNodeId = $state<string | null>(null);
  let dragStartMouse = { x: 0, y: 0 };
  let dragStartPos = { x: 0, y: 0 };

  function handleNodeMouseDown(nodeId: string, e: MouseEvent) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    draggingNodeId = nodeId;
    dragStartMouse = { x: e.clientX, y: e.clientY };
    const idx = nodes.findIndex(n => n.id === nodeId);
    const pos = getNodePos(nodeId, idx);
    dragStartPos = { x: pos.x, y: pos.y };

    // Lock zoom during drag (prevent auto-fit from changing zoom as canvas expands)
    if (isAutoFit) {
      userZoom = fitZoom;
      panX = autoTX;
      panY = autoTY;
    }

    const onMove = (ev: MouseEvent) => {
      if (!draggingNodeId) return;
      const dx = (ev.clientX - dragStartMouse.x) / zoom;
      const dy = (ev.clientY - dragStartMouse.y) / zoom;
      // Gentle boundaries - allow negative for flexibility, clamp extremes
      const newX = Math.max(-100, Math.min(3000, dragStartPos.x + dx));
      const newY = Math.max(-50, Math.min(1500, dragStartPos.y + dy));
      setNodePos(draggingNodeId, newX, newY);
    };

    const onUp = (ev: MouseEvent) => {
      const dist = Math.abs(ev.clientX - dragStartMouse.x) + Math.abs(ev.clientY - dragStartMouse.y);
      if (dist < 5) {
        // Click (no drag) → select node
        developManager.selectNode(nodeId);
      }
      draggingNodeId = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // ── Other interactions ──
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

  // ── Contextual menu (press-hold on connectors) ──
  let contextMenu = $state<{ x: number; y: number; afterNodeId: string } | null>(null);
  let pressHoldTimer: number | null = null;
  let pressHoldStart = { x: 0, y: 0 };

  function handleConnectorMouseDown(nodeId: string, side: 'input' | 'output', e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    
    pressHoldStart = { x: e.clientX, y: e.clientY };
    
    pressHoldTimer = window.setTimeout(() => {
      // Show menu after 400ms hold
      contextMenu = {
        x: e.clientX,
        y: e.clientY,
        afterNodeId: side === 'output' ? nodeId : '', // empty = insert at start
      };
    }, 400);

    const onMove = (ev: MouseEvent) => {
      const dist = Math.abs(ev.clientX - pressHoldStart.x) + Math.abs(ev.clientY - pressHoldStart.y);
      if (dist > 5 && pressHoldTimer) {
        window.clearTimeout(pressHoldTimer);
        pressHoldTimer = null;
      }
    };

    const onUp = () => {
      if (pressHoldTimer) {
        window.clearTimeout(pressHoldTimer);
        pressHoldTimer = null;
      }
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function addSerialNode() {
    if (!contextMenu) return;
    const afterId = contextMenu.afterNodeId;
    
    // Create new node
    developManager.addNode();
    
    // If afterId specified, position it after that node
    if (afterId) {
      const afterIdx = nodes.findIndex(n => n.id === afterId);
      if (afterIdx >= 0) {
        const afterPos = getNodePos(afterId, afterIdx);
        const newNode = nodes[nodes.length - 1];
        setNodePos(newNode.id, afterPos.x + NODE_W + NODE_GAP, afterPos.y);
      }
    }
    
    contextMenu = null;
  }

  function closeContextMenu() {
    contextMenu = null;
  }
</script>

<div class="node-editor-canvas" bind:this={canvasEl}
  onwheel={handleWheel}
  onmousedown={handleCanvasMouseDown}
  role="application"
  aria-label="Node Editor"
>
  <!-- Zoom controls -->
  <div class="zoom-controls" onmousedown={(e) => e.stopPropagation()}>
    <button onclick={resetToFit} title="Fit">Fit</button>
    <span class="zoom-pct">{Math.round(zoom * 100)}%</span>
  </div>

  <!-- SVG canvas (zoomable/pannable) -->
  <svg
    width={canvasW}
    height={canvasH}
    viewBox="0 0 {canvasW} {canvasH}"
    style="transform: translate({translateX}px, {translateY}px) scale({zoom}); transform-origin: 0 0;"
    class="node-svg"
  >
    <!-- IN/OUT connectors (in SVG coordinate space) -->
    <g class="io-connectors">
      <!-- IN connector -->
      <circle cx={inputX} cy={ioY} r={IO_R} fill="#333" stroke="#888" stroke-width="1.5" />
      <text x={inputX} y={ioY - 12} fill="#888" font-size="9" font-weight="600" text-anchor="middle">IN</text>
      
      <!-- OUT connector -->
      <circle cx={outputX} cy={ioY} r={IO_R} fill="#333" stroke="#888" stroke-width="1.5" />
      <text x={outputX} y={ioY - 12} fill="#888" font-size="9" font-weight="600" text-anchor="middle">OUT</text>
    </g>

    <!-- Wires -->
    {#each wires as wire}
      <path d={wire.d} fill="none" stroke={wire.active ? '#60a5fa' : '#555'} stroke-width="2.5" />
    {/each}

    <!-- Nodes -->
    {#each nodes as node, i (node.id)}
      {@const pos = getNodePos(node.id, i)}
      {@const nx = pos.x}
      {@const ny = pos.y}
      {@const isSelected = node.id === selectedId}
      {@const isActive = hasActiveChanges(node.state)}
      {@const isBypassed = node.bypass}
      {@const isDragging = draggingNodeId === node.id}

      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <g
        class="node-group"
        class:selected={isSelected}
        class:bypassed={isBypassed}
        class:dragging={isDragging}
        onmousedown={(e) => handleNodeMouseDown(node.id, e)}
        ondblclick={(e) => handleDoubleClick(node.id, e)}
        style="cursor: {isDragging ? 'grabbing' : 'grab'}"
      >
        <!-- Node body -->
        <rect
          x={nx} y={ny} width={NODE_W} height={NODE_H} rx="8"
          fill={isSelected ? '#1e3a5f' : '#2a2a3e'}
          stroke={isSelected ? '#60a5fa' : '#555'}
          stroke-width={isSelected ? 2 : 1}
          opacity={isBypassed ? 0.4 : 1}
        />

        <!-- Red dot indicator -->
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

        <!-- Bypass indicator -->
        {#if isBypassed}
          <text
            x={nx + NODE_W - 14} y={ny + 16}
            fill="#ef4444" font-size="10" text-anchor="middle" cursor="pointer"
            onmousedown={(e) => { e.stopPropagation(); handleToggleBypass(node.id, e); }}
          >⊘</text>
        {/if}

        <!-- Delete button (only if >1 node) -->
        {#if nodes.length > 1}
          <text
            x={nx + NODE_W - 14} y={ny + NODE_H - 8}
            fill="#666" font-size="11" text-anchor="middle" cursor="pointer"
            onmousedown={(e) => { e.stopPropagation(); handleDeleteNode(node.id, e); }}
          >✕</text>
        {/if}

        <!-- I/O connectors on node -->
        <circle 
          cx={nx} cy={ny + NODE_H / 2} r={IO_R} 
          fill="#333" stroke={isSelected ? '#60a5fa' : '#888'} stroke-width="1.5"
          style="cursor: context-menu;"
          onmousedown={(e) => handleConnectorMouseDown(node.id, 'input', e)}
        />
        <circle 
          cx={nx + NODE_W} cy={ny + NODE_H / 2} r={IO_R} 
          fill="#333" stroke={isSelected ? '#60a5fa' : '#888'} stroke-width="1.5"
          style="cursor: context-menu;"
          onmousedown={(e) => handleConnectorMouseDown(node.id, 'output', e)}
        />
      </g>
    {/each}
  </svg>

  <!-- Contextual menu -->
  {#if contextMenu}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="context-menu-overlay" onclick={closeContextMenu}>
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div 
        class="context-menu"
        style="left: {contextMenu.x}px; top: {contextMenu.y}px;"
        onclick={(e) => e.stopPropagation()}
      >
        <button 
          class="context-menu-item" 
          onclick={addSerialNode}
          disabled={nodes.length >= MAX_NODES}
        >
          <span class="menu-icon">➜</span>
          Add Serial Node
        </button>
        <button class="context-menu-item" disabled>
          <span class="menu-icon">⫴</span>
          Add Parallel Node
          <span class="menu-badge">Soon</span>
        </button>
        <button class="context-menu-item" disabled>
          <span class="menu-icon">⧉</span>
          Add Layer Node
          <span class="menu-badge">Soon</span>
        </button>
      </div>
    </div>
  {/if}

  <!-- Node count -->
  <div class="node-count">{nodes.length} node{nodes.length !== 1 ? 's' : ''}</div>
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

  .node-group { cursor: grab; }
  .node-group:hover rect { filter: brightness(1.15); }
  .node-group.dragging { cursor: grabbing; }

  .node-count {
    position: absolute;
    bottom: 4px;
    right: 8px;
    font-size: 10px;
    color: #555;
    z-index: 5;
  }

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

  /* Contextual menu */
  .context-menu-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 100;
    background: transparent;
  }

  .context-menu {
    position: fixed;
    background: #2a2a3e;
    border: 1px solid #444;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    padding: 4px;
    min-width: 180px;
    z-index: 101;
  }

  .context-menu-item {
    width: 100%;
    background: transparent;
    border: none;
    color: #ccc;
    padding: 8px 12px;
    text-align: left;
    cursor: pointer;
    border-radius: 4px;
    font-size: 13px;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: background 0.15s;
  }

  .context-menu-item:hover:not(:disabled) {
    background: rgba(96, 165, 250, 0.15);
    color: #fff;
  }

  .context-menu-item:disabled {
    color: #555;
    cursor: not-allowed;
  }

  .menu-icon {
    font-size: 14px;
    opacity: 0.7;
  }

  .menu-badge {
    margin-left: auto;
    font-size: 10px;
    color: #888;
    font-style: italic;
  }
</style>
