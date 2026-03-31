<script lang="ts">
  import { type CorrectorNode, hasActiveChanges, NODE_W, NODE_H, NODE_GAP, IO_R, MAX_NODES, TOP_PAD, BOTTOM_PAD, SIDE_PAD } from '../node-types';
  import { developManager } from '$lib/managers/edit/develop-manager.svelte';

  interface Props {
    onDimensionsChange?: (w: number, h: number) => void;
    onZoomChange?: (zoom: number) => void;
  }

  let { onDimensionsChange, onZoomChange }: Props = $props();

  // ── Reactive data from developManager ──
  const nodes = $derived(developManager.nodes);
  const selectedId = $derived(developManager.selectedNodeId);
  const connections = $derived(developManager.nodeGraph?.connections ?? []);

  // FIX #5: Normalize node positions to ensure all are positive (for stable origin)
  $effect(() => {
    if (nodes.length === 0) return;
    let needsNormalization = false;
    for (const node of nodes) {
      if (node.position.x < 0 || node.position.y < 0) {
        needsNormalization = true;
        break;
      }
    }
    if (needsNormalization) {
      // Find minimum coordinates
      let minX = 0, minY = 0;
      for (const node of nodes) {
        minX = Math.min(minX, node.position.x);
        minY = Math.min(minY, node.position.y);
      }
      // Offset all nodes to make minimum SIDE_PAD/TOP_PAD
      const offsetX = SIDE_PAD - minX;
      const offsetY = TOP_PAD - minY;
      for (const node of nodes) {
        node.position.x += offsetX;
        node.position.y += offsetY;
      }
    }
  });

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

  // ── Patch 1: World bounds (accounts for negative coords + padding) ──
  const PAD_L = 40;
  const PAD_R = 80;
  const PAD_T = 32;
  const PAD_B = 40;

  // FIX #1/#4/#5: Stable world origin (always 0,0) - prevents visual rebasing during drag
  const worldBounds = $derived.by(() => {
    if (nodes.length === 0) {
      return { minX: 0, minY: 0, maxX: 400, maxY: 180 };
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const p = nodes[i].position;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + NODE_W);
      maxY = Math.max(maxY, p.y + NODE_H);
    }

    // Always use 0,0 origin (stable), calculate extent from rightmost/bottommost nodes
    return {
      minX: 0,
      minY: 0,
      maxX: Math.max(400, maxX + PAD_R),
      maxY: Math.max(180, maxY + PAD_B),
    };
  });

  const canvasW = $derived(worldBounds.maxX - worldBounds.minX);
  const canvasH = $derived(worldBounds.maxY - worldBounds.minY);

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

  // ── Patch 2: Canonical coordinate transform functions ──
  function worldToScreen(wx: number, wy: number) {
    return { x: wx * zoom + translateX, y: wy * zoom + translateY };
  }

  function screenToWorld(sx: number, sy: number) {
    return { x: (sx - translateX) / zoom, y: (sy - translateY) / zoom };
  }

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

  // ── Patch 2: Terminal definition (screen space, viewport-anchored) ──
  const terminalScreen = $derived({
    in: { x: 16, y: viewportH / 2 },
    out: { x: viewportW - 16, y: viewportH / 2 },
  });

  // Viewport middle Y for IN/OUT overlay
  const viewportMidY = $derived(viewportH / 2);

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
    if (nodes.length === 0 || connections.length === 0) return result;

    // Patch 2: Convert terminals from screen to world space
    const inW = screenToWorld(terminalScreen.in.x, terminalScreen.in.y);
    const outW = screenToWorld(terminalScreen.out.x, terminalScreen.out.y);

    // Build node lookup map
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    // Render each connection as a wire
    for (const conn of connections) {
      let x1: number, y1: number, x2: number, y2: number;
      let active = true;

      // Determine start point
      if (conn.from === "input") {
        x1 = inW.x;
        y1 = inW.y;
      } else {
        const fromNode = nodeMap.get(conn.from);
        if (!fromNode) continue; // Skip if node not found
        x1 = fromNode.position.x + NODE_W;  // Output connector on right side
        y1 = fromNode.position.y + NODE_H / 2;
        active = !fromNode.bypass && hasActiveChanges(fromNode.state);
      }

      // Determine end point
      if (conn.to === "output") {
        x2 = outW.x;
        y2 = outW.y;
      } else {
        const toNode = nodeMap.get(conn.to);
        if (!toNode) continue; // Skip if node not found
        x2 = toNode.position.x;  // Input connector on left side
        y2 = toNode.position.y + NODE_H / 2;
      }

      result.push({ d: bezierPath(x1, y1, x2, y2), active });
    }

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
    
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    draggingNodeId = nodeId;
    dragStartMouse = { x: e.clientX, y: e.clientY };
    dragStartPos = { x: node.position.x, y: node.position.y };

    // Lock zoom during drag (prevent auto-fit from changing zoom as canvas expands)
    if (isAutoFit) {
      userZoom = fitZoom;
      panX = autoTX;
      panY = autoTY;
    }

    const onMove = (ev: MouseEvent) => {
      if (!draggingNodeId) return;
      const draggingNode = nodes.find(n => n.id === draggingNodeId);
      if (!draggingNode) return;
      
      const dx = (ev.clientX - dragStartMouse.x) / zoom;
      const dy = (ev.clientY - dragStartMouse.y) / zoom;
      
      // FIX #4: Dynamic drag bounds (not hard-coded), ensure positive coords for stable origin
      const maxX = Math.max(3000, canvasW + 500); // Generous max, extends beyond current canvas
      const maxY = Math.max(1500, canvasH + 500);
      
      draggingNode.position.x = Math.max(SIDE_PAD, Math.min(maxX, dragStartPos.x + dx));
      draggingNode.position.y = Math.max(TOP_PAD, Math.min(maxY, dragStartPos.y + dy));
    };

    const onUp = (ev: MouseEvent) => {
      const dist = Math.abs(ev.clientX - dragStartMouse.x) + Math.abs(ev.clientY - dragStartMouse.y);
      
      if (dist < 5) {
        // Click (no drag) → select node
        developManager.selectNode(nodeId);
      } else if (draggingNodeId) {
        // Drag completed → commit position with validation
        const draggedNode = nodes.find(n => n.id === draggingNodeId);
        if (draggedNode) {
          // FIX #4: Dynamic bounds (viewport-aware)
          const maxX = Math.max(3000, canvasW + 500);
          const maxY = Math.max(1500, canvasH + 500);
          
          const x = Number.isFinite(draggedNode.position.x) 
            ? Math.max(SIDE_PAD, Math.min(maxX, draggedNode.position.x))
            : dragStartPos.x;
          const y = Number.isFinite(draggedNode.position.y)
            ? Math.max(TOP_PAD, Math.min(maxY, draggedNode.position.y))
            : dragStartPos.y;
          
          // Commit final position (single authoritative write)
          draggedNode.position = { x, y };
          
          // Trigger save (positions are part of graph state)
          developManager.scheduleAutoSave();
        }
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
    
    // Create new node (addNode handles positioning and connections internally)
    developManager.addNode(afterId || undefined);
    
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

  <!-- IN/OUT connectors (viewport-anchored, not transformed) -->
  <svg
    width={viewportW}
    height={viewportH}
    style="position: absolute; top: 0; left: 0; pointer-events: none;"
    class="io-overlay"
  >
    <!-- IN connector (left edge, viewport middle) -->
    <circle cx={16} cy={viewportMidY} r={IO_R} fill="#333" stroke="#888" stroke-width="1.5" style="pointer-events: auto;" />
    <text x={16} y={viewportMidY - 12} fill="#888" font-size="9" font-weight="600" text-anchor="middle">IN</text>
    
    <!-- OUT connector (right edge, viewport middle) -->
    <circle cx={viewportW - 16} cy={viewportMidY} r={IO_R} fill="#333" stroke="#888" stroke-width="1.5" style="pointer-events: auto;" />
    <text x={viewportW - 16} y={viewportMidY - 12} fill="#888" font-size="9" font-weight="600" text-anchor="middle">OUT</text>
  </svg>

  <!-- SVG canvas (zoomable/pannable) -->
  <!-- FIX #5: Stable viewBox origin (always 0,0) - prevents visual rebasing when nodes move -->
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

    <!-- Nodes -->
    {#each nodes as node, i (node.id)}
      {@const nx = node.position.x}
      {@const ny = node.position.y}
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
  <div class="node-count">{nodes.length} node{nodes.length !== 1 ? 's' : ''} {#if nodes.length > 0}(ids: {nodes.map(n => n.label || n.id.slice(-2)).join(', ')}){/if}</div>
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
