<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    onClose: () => void;
    children: Snippet;
    contentWidth: number;
    contentHeight: number;
    /** Current zoom level reported by node-editor */
    currentZoom?: number;
  }

  let { title, onClose, children, contentWidth, contentHeight, currentZoom = 1 }: Props = $props();

  // Panel position & size — fully unconstrained
  let panelX = $state(60);
  let panelY = $state(60);
  let panelW = $state(900);
  let panelH = $state(350);
  let opacity = $state(0.92);

  const CHROME_H = 72;
  const MIN_W = 200;
  const MIN_H = 100;
  // No max constraints — freely resizable

  // ── Drag ──
  let dragging = $state(false);
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  function startDrag(e: MouseEvent) {
    e.preventDefault();
    dragging = true;
    dragOffsetX = e.clientX - panelX;
    dragOffsetY = e.clientY - panelY;
  }

  function startDragTouch(e: TouchEvent) {
    e.preventDefault();
    dragging = true;
    dragOffsetX = e.touches[0].clientX - panelX;
    dragOffsetY = e.touches[0].clientY - panelY;
  }

  // ── Resize ──
  let resizing = $state<string | null>(null);
  let resizeStartX = 0;
  let resizeStartY = 0;
  let resizeStartW = 0;
  let resizeStartH = 0;
  let resizeStartPX = 0;
  let resizeStartPY = 0;

  function startResize(edge: string, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    resizing = edge;
    resizeStartX = e.clientX;
    resizeStartY = e.clientY;
    resizeStartW = panelW;
    resizeStartH = panelH;
    resizeStartPX = panelX;
    resizeStartPY = panelY;
  }

  function startResizeTouch(edge: string, e: TouchEvent) {
    e.preventDefault();
    e.stopPropagation();
    resizing = edge;
    const t = e.touches[0];
    resizeStartX = t.clientX;
    resizeStartY = t.clientY;
    resizeStartW = panelW;
    resizeStartH = panelH;
    resizeStartPX = panelX;
    resizeStartPY = panelY;
  }

  function handleResize(clientX: number, clientY: number) {
    if (!resizing) return;
    const dx = clientX - resizeStartX;
    const dy = clientY - resizeStartY;

    if (resizing.includes('e')) panelW = Math.max(MIN_W, resizeStartW + dx);
    if (resizing.includes('w')) {
      const newW = Math.max(MIN_W, resizeStartW - dx);
      panelX = resizeStartPX + (resizeStartW - newW);
      panelW = newW;
    }
    if (resizing.includes('s')) panelH = Math.max(MIN_H, resizeStartH + dy);
    if (resizing.includes('n')) {
      const newH = Math.max(MIN_H, resizeStartH - dy);
      panelY = resizeStartPY + (resizeStartH - newH);
      panelH = newH;
    }
  }

  function onMove(e: MouseEvent) {
    if (dragging) {
      panelX = Math.max(0, e.clientX - dragOffsetX);
      panelY = Math.max(0, e.clientY - dragOffsetY);
    }
    if (resizing) handleResize(e.clientX, e.clientY);
  }

  function onMoveTouch(e: TouchEvent) {
    if (e.touches.length === 0) return;
    const t = e.touches[0];
    if (dragging) { e.preventDefault(); panelX = Math.max(0, t.clientX - dragOffsetX); panelY = Math.max(0, t.clientY - dragOffsetY); }
    if (resizing) { e.preventDefault(); handleResize(t.clientX, t.clientY); }
  }

  function onUp() {
    dragging = false;
    resizing = null;
  }

  const nodeCount = $derived(contentWidth > 0 ? Math.round(contentWidth / 106) : 0);
</script>

<svelte:window onmousemove={onMove} onmouseup={onUp} ontouchmove={onMoveTouch} ontouchend={onUp} />

<div
  class="floating-node-panel"
  style="left:{panelX}px; top:{panelY}px; width:{panelW}px; height:{panelH}px; opacity:{opacity};"
>
  <!-- Resize edges -->
  <div class="resize-edge edge-n" onmousedown={(e) => startResize('n', e)} ontouchstart={(e) => startResizeTouch('n', e)}></div>
  <div class="resize-edge edge-s" onmousedown={(e) => startResize('s', e)} ontouchstart={(e) => startResizeTouch('s', e)}></div>
  <div class="resize-edge edge-w" onmousedown={(e) => startResize('w', e)} ontouchstart={(e) => startResizeTouch('w', e)}></div>
  <div class="resize-edge edge-e" onmousedown={(e) => startResize('e', e)} ontouchstart={(e) => startResizeTouch('e', e)}></div>
  <div class="resize-edge edge-nw" onmousedown={(e) => startResize('nw', e)} ontouchstart={(e) => startResizeTouch('nw', e)}></div>
  <div class="resize-edge edge-ne" onmousedown={(e) => startResize('ne', e)} ontouchstart={(e) => startResizeTouch('ne', e)}></div>
  <div class="resize-edge edge-sw" onmousedown={(e) => startResize('sw', e)} ontouchstart={(e) => startResizeTouch('sw', e)}></div>
  <div class="resize-edge edge-se" onmousedown={(e) => startResize('se', e)} ontouchstart={(e) => startResizeTouch('se', e)}>
    <svg class="resize-grip" width="12" height="12" viewBox="0 0 12 12">
      <line x1="10" y1="2" x2="2" y2="10" stroke="rgba(255,255,255,0.25)" stroke-width="1.5"/>
      <line x1="10" y1="6" x2="6" y2="10" stroke="rgba(255,255,255,0.25)" stroke-width="1.5"/>
    </svg>
  </div>

  <!-- Title bar -->
  <div class="title-bar" onmousedown={startDrag} ontouchstart={startDragTouch}>
    <div class="title-left">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:0.5">
        <circle cx="5" cy="12" r="3"/><circle cx="19" cy="12" r="3"/><line x1="8" y1="12" x2="16" y2="12"/>
      </svg>
      <span class="title-text">{title}</span>
    </div>
    <div class="title-right">
      <span class="zoom-label">{Math.round(currentZoom * 100)}%</span>
      <button class="close-btn" onclick={onClose} title="Collapse back to panel">✕</button>
    </div>
  </div>

  <!-- Graph content -->
  <div class="graph-viewport">
    {@render children()}
  </div>

  <!-- Footer -->
  <div class="footer-bar">
    <div class="opacity-control">
      <span class="footer-label">Opacity</span>
      <input type="range" min="0.2" max="1" step="0.01" bind:value={opacity} class="opacity-slider" />
      <span class="footer-value">{Math.round(opacity * 100)}%</span>
    </div>
    <div class="node-count">{nodeCount} nodes</div>
  </div>
</div>

<style>
  .floating-node-panel {
    position: fixed;
    z-index: 100;
    display: flex;
    flex-direction: column;
    background: #1a1a2e;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 10px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3);
    overflow: hidden;
    touch-action: none;
    will-change: transform, opacity;
    transform: translateZ(0);
    contain: layout style;
  }

  .title-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    background: rgba(255, 255, 255, 0.06);
    cursor: move;
    user-select: none;
    -webkit-user-select: none;
    flex-shrink: 0;
  }
  .title-left { display: flex; align-items: center; gap: 6px; }
  .title-right { display: flex; align-items: center; gap: 8px; }
  .title-text { font-size: 12px; font-weight: 600; color: #d1d5db; letter-spacing: 0.03em; }
  .zoom-label { font-size: 10px; color: #6b7280; font-family: 'SF Mono', monospace; }
  .close-btn {
    width: 20px; height: 20px;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; color: #9ca3af;
    background: transparent; border: none; border-radius: 4px;
    cursor: pointer; padding: 0; transition: all 0.15s;
  }
  .close-btn:hover { color: #fff; background: rgba(255, 255, 255, 0.1); }

  .graph-viewport {
    flex: 1 1 0;
    overflow: hidden;
    min-height: 0;
    display: flex;
  }
  .graph-viewport > :global(*) {
    flex: 1 1 0;
    min-height: 0;
    min-width: 0;
  }

  .footer-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 10px;
    background: rgba(255, 255, 255, 0.04);
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    flex-shrink: 0;
  }
  .opacity-control { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
  .footer-label { font-size: 10px; color: #6b7280; white-space: nowrap; }
  .footer-value { font-size: 10px; color: #9ca3af; min-width: 30px; font-family: 'SF Mono', monospace; }
  .node-count { margin-left: auto; font-size: 10px; color: #6b7280; }
  .opacity-slider {
    width: 80px; height: 3px;
    -webkit-appearance: none; appearance: none;
    background: linear-gradient(to right, rgba(255,255,255,0.1), rgba(255,255,255,0.4));
    border-radius: 2px; outline: none; cursor: pointer;
  }
  .opacity-slider::-webkit-slider-thumb {
    -webkit-appearance: none; width: 10px; height: 10px;
    border-radius: 50%; background: #ccc; border: 1px solid #888; cursor: pointer;
  }
  .opacity-slider::-moz-range-thumb {
    width: 10px; height: 10px;
    border-radius: 50%; background: #ccc; border: 1px solid #888; cursor: pointer;
  }

  /* Resize edges */
  .resize-edge { position: absolute; z-index: 2; touch-action: none; }
  .edge-n { top: -3px; left: 8px; right: 8px; height: 6px; cursor: n-resize; }
  .edge-s { bottom: -3px; left: 8px; right: 8px; height: 6px; cursor: s-resize; }
  .edge-w { left: -3px; top: 8px; bottom: 8px; width: 6px; cursor: w-resize; }
  .edge-e { right: -3px; top: 8px; bottom: 8px; width: 6px; cursor: e-resize; }
  .edge-nw { top: -3px; left: -3px; width: 12px; height: 12px; cursor: nw-resize; }
  .edge-ne { top: -3px; right: -3px; width: 12px; height: 12px; cursor: ne-resize; }
  .edge-sw { bottom: -3px; left: -3px; width: 12px; height: 12px; cursor: sw-resize; }
  .edge-se {
    bottom: -2px; right: -2px; width: 18px; height: 18px; cursor: se-resize;
    display: flex; align-items: flex-end; justify-content: flex-end;
  }
  .resize-grip { pointer-events: none; opacity: 0.6; margin: 2px; }
  .edge-se:hover .resize-grip { opacity: 1; }
</style>
