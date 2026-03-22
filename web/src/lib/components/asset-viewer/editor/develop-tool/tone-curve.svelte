<script lang="ts">
  import { developManager } from '$lib/managers/edit/develop-manager.svelte';
  import { editManager } from '$lib/managers/edit/edit-manager.svelte';
  import { buildCurveLUT, buildCurveSVGPath, LUTCache } from './curve-engine';

  type Channel = 'master' | 'red' | 'green' | 'blue';

  // ── UI state ──────────────────────────────────────────────
  let activeChannel = $state<Channel>('master');
  let draggingIndex = $state<number | null>(null);
  let draggingEndpoint = $state<number | null>(null); // -1 = black, -2 = white
  let pointClicked = $state(false);
  let svgElement = $state<SVGSVGElement | undefined>(undefined);
  let scopeCanvas = $state<HTMLCanvasElement | undefined>(undefined);

  // ── Scope settings ────────────────────────────────────────
  type ScopeType = 'histogram' | 'parade' | 'waveform' | 'vectorscope' | 'cie';
  let activeScopeType = $state<ScopeType>('histogram');
  let scopeBrightness = $state(1.0);
  let graticuleOpacity = $state(0.4);
  let showRefLevels = $state(true);
  let refLow = $state(10);
  let refHigh = $state(235);
  let colorizeWaveform = $state(true);
  let scopeControlsOpen = $state(false);

  const scopeTypes: { id: ScopeType; label: string }[] = [
    { id: 'histogram', label: 'Histogram' },
    { id: 'parade', label: 'Parade' },
    { id: 'waveform', label: 'Waveform' },
    { id: 'vectorscope', label: 'Vectorscope' },
    { id: 'cie', label: 'CIE Chromaticity' },
  ];

  // ── Constants ─────────────────────────────────────────────
  const MAX_POINTS = 16;
  const POINT_RADIUS_PX = 6;
  const SVG_SIZE = 256;

  // ── Derived sizing ────────────────────────────────────────
  let svgRenderedWidth = $state(256);
  let pointRadius = $derived(POINT_RADIUS_PX * (SVG_SIZE / svgRenderedWidth));
  let strokeScale = $derived(SVG_SIZE / svgRenderedWidth);

  // ── Image data cache for scopes ───────────────────────────
  let rawPixelData: Uint8ClampedArray | null = null;
  let imgWidth = 0;
  let imgHeight = 0;

  // ── LUT cache (avoid rebuilding on every scope frame) ─────
  const lutCache = new LUTCache();

  // ── rAF scope throttle ────────────────────────────────────
  let scopeRafId: number | null = null;
  let scopeDirty = false;

  function requestScopeUpdate() {
    scopeDirty = true;
    if (scopeRafId === null) {
      scopeRafId = requestAnimationFrame(() => {
        scopeRafId = null;
        if (scopeDirty) {
          scopeDirty = false;
          renderScope();
        }
      });
    }
  }

  // ── Channels config ───────────────────────────────────────
  const channels: { id: Channel; label: string; color: string }[] = [
    { id: 'master', label: 'Master', color: '#ffffff' },
    { id: 'red', label: 'Red', color: '#ef4444' },
    { id: 'green', label: 'Green', color: '#22c55e' },
    { id: 'blue', label: 'Blue', color: '#3b82f6' },
  ];

  function channelColor(ch: Channel): string {
    return channels.find(c => c.id === ch)?.color ?? '#fff';
  }

  // ══════════════════════════════════════════════════════════
  // State accessors — read directly from developManager for
  // proper Svelte 5 fine-grained reactivity
  // ══════════════════════════════════════════════════════════

  function getPoints(): Array<{ x: number; y: number }> {
    return developManager.curves[activeChannel];
  }

  function setPoints(points: Array<{ x: number; y: number }>) {
    developManager.curves[activeChannel] = points;
  }

  function getEp() {
    return developManager.curveEndpoints[activeChannel];
  }

  function setEndpoint(channel: Channel, point: 'black' | 'white', value: number) {
    developManager.curveEndpoints[channel] = {
      ...developManager.curveEndpoints[channel],
      [point]: value,
    };
  }

  // ══════════════════════════════════════════════════════════
  // SVG path — delegates to curve-engine (same math as LUT)
  // ══════════════════════════════════════════════════════════

  function getCurvePath(): string {
    return buildCurveSVGPath(getPoints(), getEp(), SVG_SIZE);
  }

  // ══════════════════════════════════════════════════════════
  // Effects
  // ══════════════════════════════════════════════════════════

  // Track SVG rendered size for constant-pixel-size control points
  $effect(() => {
    if (!svgElement) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) svgRenderedWidth = entry.contentRect.width || 256;
    });
    ro.observe(svgElement);
    return () => ro.disconnect();
  });

  // Re-render scope when scope controls change
  $effect(() => {
    void activeScopeType;
    void scopeBrightness;
    void graticuleOpacity;
    void showRefLevels;
    void refLow;
    void refHigh;
    void colorizeWaveform;
    if (rawPixelData) requestScopeUpdate();
  });

  // Load image data once when asset changes
  $effect(() => {
    const asset = editManager.currentAsset;
    if (asset) loadImageData(asset.id);
  });

  // Recompute scope when curves/endpoints change
  $effect(() => {
    // Deep-read to track mutations
    const curves = developManager.curves;
    void [
      curves.master.length, curves.master.map(p => p.x + p.y).join(),
      curves.red.length, curves.red.map(p => p.x + p.y).join(),
      curves.green.length, curves.green.map(p => p.x + p.y).join(),
      curves.blue.length, curves.blue.map(p => p.x + p.y).join(),
    ];
    const ep = developManager.curveEndpoints;
    void [
      ep.master.black, ep.master.white,
      ep.red.black, ep.red.white,
      ep.green.black, ep.green.white,
      ep.blue.black, ep.blue.white,
    ];
    if (rawPixelData) requestScopeUpdate();
  });

  // ══════════════════════════════════════════════════════════
  // Image loading
  // ══════════════════════════════════════════════════════════

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
      imgWidth = canvas.width;
      imgHeight = canvas.height;
      requestScopeUpdate();
    } catch {
      // Silently fail — scopes are optional
    }
  }

  // ══════════════════════════════════════════════════════════
  // Interaction handlers
  // ══════════════════════════════════════════════════════════

  function handleSvgClick(event: MouseEvent) {
    if (pointClicked) { pointClicked = false; return; }
    const svg = event.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = 1 - (event.clientY - rect.top) / rect.height;

    const points = getPoints();
    if (points.length >= MAX_POINTS) return;

    // Check proximity to existing points (including endpoints)
    const ep = getEp();
    const allPts = [{ x: 0, y: ep.black }, ...points, { x: 1, y: ep.white }];
    const tooClose = allPts.some(p => {
      const dx = (p.x - x) * SVG_SIZE, dy = (p.y - y) * SVG_SIZE;
      return Math.sqrt(dx * dx + dy * dy) < pointRadius * 2;
    });
    if (tooClose) return;

    setPoints([...points, { x, y }].sort((a, b) => a.x - b.x));
  }

  function handlePointMouseDown(index: number, e: MouseEvent) {
    e.stopPropagation(); e.preventDefault();
    pointClicked = true;
    draggingIndex = index;
  }

  function handlePointTouchStart(index: number, e: TouchEvent) {
    e.stopPropagation(); e.preventDefault();
    pointClicked = true;
    draggingIndex = index;
  }

  function handlePointDblClick(index: number, e: MouseEvent) {
    e.stopPropagation(); e.preventDefault();
    pointClicked = true;
    draggingIndex = null;
    setPoints(getPoints().filter((_, i) => i !== index));
  }

  function handleEndpointDown(which: -1 | -2, e: MouseEvent | TouchEvent) {
    e.stopPropagation(); e.preventDefault();
    pointClicked = true;
    draggingEndpoint = which;
  }

  function handleEndpointDblClick(which: 'black' | 'white', e: MouseEvent) {
    e.stopPropagation(); e.preventDefault();
    pointClicked = true;
    setEndpoint(activeChannel, which, which === 'black' ? 0 : 1);
  }

  function updateDragPosition(clientX: number, clientY: number) {
    if (!svgElement) return;
    const rect = svgElement.getBoundingClientRect();
    const y = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));

    if (draggingEndpoint === -1) { setEndpoint(activeChannel, 'black', y); return; }
    if (draggingEndpoint === -2) { setEndpoint(activeChannel, 'white', y); return; }
    if (draggingIndex === null) return;

    const x = Math.max(0.01, Math.min(0.99, (clientX - rect.left) / rect.width));
    const points = [...getPoints()];
    points[draggingIndex] = { x, y };
    points.sort((a, b) => a.x - b.x);
    // Track the moved point after sort
    draggingIndex = points.findIndex(p => p.x === x && p.y === y);
    setPoints(points);
  }

  function handleMouseMove(e: MouseEvent) {
    if (draggingIndex !== null || draggingEndpoint !== null) updateDragPosition(e.clientX, e.clientY);
  }
  function handleTouchMove(e: TouchEvent) {
    if ((draggingIndex !== null || draggingEndpoint !== null) && e.touches.length > 0) {
      e.preventDefault();
      updateDragPosition(e.touches[0].clientX, e.touches[0].clientY);
    }
  }
  function handleMouseUp() { draggingIndex = null; draggingEndpoint = null; pointClicked = false; }
  function handleTouchEnd() { draggingIndex = null; draggingEndpoint = null; pointClicked = false; }

  // ══════════════════════════════════════════════════════════
  // Scope rendering (rAF-throttled)
  // ══════════════════════════════════════════════════════════

  function getLUTs() {
    const c = developManager.curves;
    const ep = developManager.curveEndpoints;
    return {
      master: lutCache.get(c.master, ep.master),
      red: lutCache.get(c.red, ep.red),
      green: lutCache.get(c.green, ep.green),
      blue: lutCache.get(c.blue, ep.blue),
    };
  }

  function renderScope() {
    if (!rawPixelData || !scopeCanvas) return;
    const ctx = scopeCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, scopeCanvas.width, scopeCanvas.height);
    switch (activeScopeType) {
      case 'histogram': renderHistogram(ctx); break;
      case 'parade': renderParade(ctx); break;
      case 'waveform': renderWaveform(ctx); break;
      case 'vectorscope': renderVectorscope(ctx); break;
      case 'cie': renderCIE(ctx); break;
    }
    drawGraticule(ctx);
  }

  function applyLUTs(r: number, g: number, b: number, luts: ReturnType<typeof getLUTs>): [number, number, number] {
    return [luts.master[luts.red[r]], luts.master[luts.green[g]], luts.master[luts.blue[b]]];
  }

  // ── Histogram ─────────────────────────────────────────────
  function renderHistogram(ctx: CanvasRenderingContext2D) {
    if (!rawPixelData) return;
    const data = rawPixelData;
    const luts = getLUTs();
    const W = scopeCanvas!.width, H = scopeCanvas!.height;
    const rH = new Uint32Array(256), gH = new Uint32Array(256), bH = new Uint32Array(256), lH = new Uint32Array(256);

    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = applyLUTs(data[i], data[i + 1], data[i + 2], luts);
      rH[r]++; gH[g]++; bH[b]++;
      lH[Math.round(0.299 * r + 0.587 * g + 0.114 * b)]++;
    }

    const maxVal = Math.max(...rH, ...gH, ...bH, ...lH) || 1;
    const gain = scopeBrightness;
    const drawCh = (hist: Uint32Array, color: string, alpha: number) => {
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      ctx.beginPath(); ctx.moveTo(0, H);
      for (let i = 0; i < 256; i++) ctx.lineTo((i / 255) * W, H - (hist[i] / maxVal) * H * 0.85);
      ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    };
    drawCh(lH, '#9ca3af', 0.15 * gain);
    drawCh(rH, '#ef4444', 0.3 * gain);
    drawCh(gH, '#22c55e', 0.3 * gain);
    drawCh(bH, '#3b82f6', 0.3 * gain);
    ctx.globalAlpha = 1;
  }

  // ── Parade ────────────────────────────────────────────────
  function renderParade(ctx: CanvasRenderingContext2D) {
    if (!rawPixelData || !imgWidth || !imgHeight) return;
    const data = rawPixelData;
    const luts = getLUTs();
    const W = scopeCanvas!.width, H = scopeCanvas!.height;
    const gain = scopeBrightness;
    const sW = Math.floor(W / 3), gap = 2;
    const rB = new Uint16Array(sW * H), gB = new Uint16Array(sW * H), bB = new Uint16Array(sW * H);

    for (let row = 0; row < imgHeight; row++) {
      for (let col = 0; col < imgWidth; col++) {
        const i = (row * imgWidth + col) * 4;
        const [r, g, b] = applyLUTs(data[i], data[i + 1], data[i + 2], luts);
        const xBin = Math.floor(col / imgWidth * sW);
        rB[Math.floor((1 - r / 255) * (H - 1)) * sW + xBin]++;
        gB[Math.floor((1 - g / 255) * (H - 1)) * sW + xBin]++;
        bB[Math.floor((1 - b / 255) * (H - 1)) * sW + xBin]++;
      }
    }

    let maxVal = 1;
    for (let i = 0; i < rB.length; i++) maxVal = Math.max(maxVal, rB[i], gB[i], bB[i]);

    for (const { buf, color, ox } of [
      { buf: rB, color: [239, 68, 68], ox: 0 },
      { buf: gB, color: [34, 197, 94], ox: sW + gap },
      { buf: bB, color: [59, 130, 246], ox: 2 * (sW + gap) },
    ]) {
      const img = ctx.createImageData(sW, H);
      const px = img.data;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < sW; x++) {
          const d = buf[y * sW + x] / maxVal;
          if (d > 0) {
            const idx = (y * sW + x) * 4;
            const a = Math.min(255, Math.round(d * 600 * gain));
            px[idx] = color[0]; px[idx + 1] = color[1]; px[idx + 2] = color[2]; px[idx + 3] = a;
          }
        }
      }
      ctx.putImageData(img, ox, 0);
    }

    ctx.font = '10px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('R', 4, 12);
    ctx.fillText('G', sW + gap + 4, 12);
    ctx.fillText('B', 2 * (sW + gap) + 4, 12);
  }

  // ── Waveform ──────────────────────────────────────────────
  function renderWaveform(ctx: CanvasRenderingContext2D) {
    if (!rawPixelData || !imgWidth || !imgHeight) return;
    const data = rawPixelData;
    const luts = getLUTs();
    const W = scopeCanvas!.width, H = scopeCanvas!.height;
    const gain = scopeBrightness;
    const rB = new Uint16Array(W * H), gB = new Uint16Array(W * H), bB = new Uint16Array(W * H);

    for (let row = 0; row < imgHeight; row++) {
      for (let col = 0; col < imgWidth; col++) {
        const i = (row * imgWidth + col) * 4;
        const [r, g, b] = applyLUTs(data[i], data[i + 1], data[i + 2], luts);
        const xBin = Math.floor(col / imgWidth * W);
        rB[Math.floor((1 - r / 255) * (H - 1)) * W + xBin]++;
        gB[Math.floor((1 - g / 255) * (H - 1)) * W + xBin]++;
        bB[Math.floor((1 - b / 255) * (H - 1)) * W + xBin]++;
      }
    }

    let maxVal = 1;
    for (let i = 0; i < rB.length; i++) maxVal = Math.max(maxVal, rB[i], gB[i], bB[i]);

    const img = ctx.createImageData(W, H);
    const px = img.data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = (y * W + x) * 4, bi = y * W + x;
        const rd = rB[bi] / maxVal, gd = gB[bi] / maxVal, bd = bB[bi] / maxVal;
        if (rd > 0 || gd > 0 || bd > 0) {
          const g600 = 600 * gain;
          if (colorizeWaveform) {
            px[idx] = Math.min(255, Math.round(rd * g600));
            px[idx + 1] = Math.min(255, Math.round(gd * g600));
            px[idx + 2] = Math.min(255, Math.round(bd * g600));
          } else {
            const v = Math.min(255, Math.round(Math.max(rd, gd, bd) * g600));
            px[idx] = v; px[idx + 1] = v; px[idx + 2] = v;
          }
          px[idx + 3] = Math.min(255, Math.round(Math.max(rd, gd, bd) * g600));
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  // ── Vectorscope ───────────────────────────────────────────
  function renderVectorscope(ctx: CanvasRenderingContext2D) {
    if (!rawPixelData || !imgWidth || !imgHeight) return;
    const data = rawPixelData;
    const luts = getLUTs();
    const W = scopeCanvas!.width, H = scopeCanvas!.height;
    const gain = scopeBrightness;
    const cx = W / 2, cy = H / 2, radius = Math.min(cx, cy) - 8;

    // SMPTE target markers
    const targets = [
      { label: 'R', angle: 103.5, color: '#ef4444' },
      { label: 'YL', angle: 167, color: '#eab308' },
      { label: 'G', angle: 241, color: '#22c55e' },
      { label: 'CY', angle: 283.5, color: '#06b6d4' },
      { label: 'B', angle: 347, color: '#3b82f6' },
      { label: 'MG', angle: 61, color: '#d946ef' },
    ];
    ctx.font = '8px sans-serif';
    for (const t of targets) {
      const rad = t.angle * Math.PI / 180;
      const tx = cx + Math.cos(rad) * radius * 0.75;
      const ty = cy - Math.sin(rad) * radius * 0.75;
      ctx.fillStyle = t.color;
      ctx.beginPath(); ctx.arc(tx, ty, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillText(t.label, tx + 5, ty + 3);
    }

    const buf = new Uint16Array(W * H);
    for (let pix = 0; pix < imgWidth * imgHeight; pix++) {
      const i = pix * 4;
      const [r, g, b] = applyLUTs(data[i], data[i + 1], data[i + 2], luts);
      const rf = r / 255, gf = g / 255, bf = b / 255;
      const cb = -0.169 * rf - 0.331 * gf + 0.5 * bf;
      const cr = 0.5 * rf - 0.419 * gf - 0.081 * bf;
      const px = Math.round(cx + cr * radius * 2);
      const py = Math.round(cy - cb * radius * 2);
      if (px >= 0 && px < W && py >= 0 && py < H) buf[py * W + px]++;
    }

    let maxVal = 1;
    for (let i = 0; i < buf.length; i++) maxVal = Math.max(maxVal, buf[i]);

    const img = ctx.createImageData(W, H);
    const px = img.data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const d = buf[y * W + x] / maxVal;
        if (d > 0) {
          const idx = (y * W + x) * 4;
          const normX = (x - cx) / radius, normY = (cy - y) / radius;
          const hue = Math.atan2(normY, normX) / (Math.PI * 2) + 0.5;
          const [hr, hg, hb] = hueToRgb(hue);
          const intensity = Math.min(1, d * 8 * gain);
          px[idx] = Math.round(hr * 255 * intensity);
          px[idx + 1] = Math.round(hg * 255 * intensity);
          px[idx + 2] = Math.round(hb * 255 * intensity);
          px[idx + 3] = Math.min(255, Math.round(d * 800 * gain));
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function hueToRgb(h: number): [number, number, number] {
    const s = 0.8, l = 0.6;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const f = (t: number) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    return [f(h + 1/3), f(h), f(h - 1/3)];
  }

  // ── CIE Chromaticity ──────────────────────────────────────
  function renderCIE(ctx: CanvasRenderingContext2D) {
    if (!rawPixelData || !imgWidth || !imgHeight) return;
    const data = rawPixelData;
    const luts = getLUTs();
    const W = scopeCanvas!.width, H = scopeCanvas!.height;

    const horseshoe = [
      [0.175, 0.005], [0.174, 0.015], [0.174, 0.045], [0.171, 0.090],
      [0.160, 0.150], [0.144, 0.214], [0.120, 0.297], [0.091, 0.378],
      [0.068, 0.431], [0.045, 0.462], [0.023, 0.482], [0.008, 0.490],
      [0.004, 0.514], [0.012, 0.546], [0.035, 0.580], [0.073, 0.616],
      [0.117, 0.647], [0.170, 0.673], [0.230, 0.694], [0.295, 0.710],
      [0.355, 0.714], [0.420, 0.710], [0.480, 0.695], [0.535, 0.667],
      [0.585, 0.630], [0.625, 0.590], [0.655, 0.550], [0.680, 0.510],
      [0.700, 0.465], [0.715, 0.420], [0.725, 0.370], [0.734, 0.320],
      [0.735, 0.265], [0.735, 0.265],
    ];
    const sx = (x: number) => 10 + (x / 0.8) * (W - 20);
    const sy = (y: number) => H - 10 - (y / 0.9) * (H - 20);

    ctx.strokeStyle = 'rgba(100,100,100,0.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(sx(horseshoe[0][0]), sy(horseshoe[0][1]));
    for (const [x, y] of horseshoe) ctx.lineTo(sx(x), sy(y));
    ctx.closePath(); ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.arc(sx(0.3127), sy(0.3290), 3, 0, Math.PI * 2); ctx.fill();
    ctx.font = '8px sans-serif'; ctx.fillText('D65', sx(0.3127) + 5, sy(0.3290) - 5);

    const buf = new Uint16Array(W * H);
    for (let pix = 0; pix < imgWidth * imgHeight; pix += 3) {
      const i = pix * 4;
      if (i + 2 >= data.length) break;
      const [r, g, b] = applyLUTs(data[i], data[i + 1], data[i + 2], luts);
      const rf = r / 255, gf = g / 255, bf = b / 255;
      const rl = rf <= 0.04045 ? rf / 12.92 : Math.pow((rf + 0.055) / 1.055, 2.4);
      const gl = gf <= 0.04045 ? gf / 12.92 : Math.pow((gf + 0.055) / 1.055, 2.4);
      const bl = bf <= 0.04045 ? bf / 12.92 : Math.pow((bf + 0.055) / 1.055, 2.4);
      const X = 0.4124 * rl + 0.3576 * gl + 0.1805 * bl;
      const Y = 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
      const Z = 0.0193 * rl + 0.1192 * gl + 0.9505 * bl;
      const sum = X + Y + Z;
      if (sum < 0.001) continue;
      const cxv = X / sum, cyv = Y / sum;
      const px = Math.round(sx(cxv)), py = Math.round(sy(cyv));
      if (px >= 0 && px < W && py >= 0 && py < H) buf[py * W + px]++;
    }

    let maxVal = 1;
    for (let i = 0; i < buf.length; i++) maxVal = Math.max(maxVal, buf[i]);
    const img = ctx.createImageData(W, H);
    const px = img.data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const d = buf[y * W + x] / maxVal;
        if (d > 0) {
          const idx = (y * W + x) * 4;
          const intensity = Math.min(1, d * 10);
          px[idx] = Math.round(200 * intensity);
          px[idx + 1] = Math.round(220 * intensity);
          px[idx + 2] = Math.round(255 * intensity);
          px[idx + 3] = Math.min(255, Math.round(d * 1000));
        }
      }
    }
    ctx.putImageData(img, 0, 0);

    // Redraw outline on top
    ctx.strokeStyle = 'rgba(100,100,100,0.4)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(sx(horseshoe[0][0]), sy(horseshoe[0][1]));
    for (const [hx, hy] of horseshoe) ctx.lineTo(sx(hx), sy(hy));
    ctx.closePath(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.arc(sx(0.3127), sy(0.3290), 2, 0, Math.PI * 2); ctx.fill();
  }

  // ── Graticule overlay ─────────────────────────────────────
  function drawGraticule(ctx: CanvasRenderingContext2D) {
    if (!scopeCanvas) return;
    const W = scopeCanvas.width, H = scopeCanvas.height;

    if (activeScopeType === 'vectorscope') {
      const cx = W / 2, cy = H / 2, radius = Math.min(cx, cy) - 8;
      ctx.strokeStyle = `rgba(75, 85, 99, ${graticuleOpacity})`; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy - radius); ctx.lineTo(cx, cy + radius); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - radius, cy); ctx.lineTo(cx + radius, cy); ctx.stroke();
    } else {
      ctx.strokeStyle = `rgba(75, 85, 99, ${graticuleOpacity})`; ctx.lineWidth = 0.5;
      for (const frac of [0.25, 0.5, 0.75]) {
        const lineY = H * (1 - frac);
        ctx.beginPath(); ctx.moveTo(0, lineY); ctx.lineTo(W, lineY); ctx.stroke();
      }
      if (showRefLevels) {
        const lowY = H * (1 - refLow / 255), highY = H * (1 - refHigh / 255);
        ctx.strokeStyle = `rgba(59, 130, 246, ${graticuleOpacity * 0.8})`;
        ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(0, lowY); ctx.lineTo(W, lowY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, highY); ctx.lineTo(W, highY); ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = '9px sans-serif';
        ctx.fillStyle = `rgba(59, 130, 246, ${Math.min(1, graticuleOpacity + 0.2)})`;
        ctx.fillText(`${refLow}`, 3, lowY - 3);
        ctx.fillText(`${refHigh}`, 3, highY + 11);
      }
    }
  }
</script>

<svelte:window
  onmousemove={handleMouseMove}
  onmouseup={handleMouseUp}
  ontouchmove={handleTouchMove}
  ontouchend={handleTouchEnd}
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

  <!-- Scope controls -->
  <div class="flex items-center gap-2 mb-1">
    <select
      class="text-xs bg-gray-800 text-gray-300 border border-gray-700 rounded px-2 py-1 cursor-pointer focus:outline-none focus:border-gray-500"
      bind:value={activeScopeType}
    >
      {#each scopeTypes as scope}
        <option value={scope.id}>{scope.label}</option>
      {/each}
    </select>
    <input type="range" min="0.2" max="3" step="0.1" bind:value={scopeBrightness}
      class="scope-intensity-slider" title="Scope intensity" />
    <span class="text-xs text-gray-500 font-mono" style="min-width:28px">{scopeBrightness.toFixed(1)}×</span>
    <button
      class="text-xs px-1.5 py-0.5 rounded transition-colors"
      class:bg-gray-700={scopeControlsOpen}
      class:text-gray-400={!scopeControlsOpen}
      class:text-white={scopeControlsOpen}
      onclick={() => scopeControlsOpen = !scopeControlsOpen}
      title="More scope settings"
    >⚙</button>
  </div>

  {#if scopeControlsOpen}
    <div class="scope-controls">
      <div class="ctrl-row">
        <label>Brightness</label>
        <input type="range" min="0.2" max="3" step="0.1" bind:value={scopeBrightness} />
        <span>{scopeBrightness.toFixed(1)}×</span>
      </div>
      <div class="ctrl-row">
        <label>Graticule</label>
        <input type="range" min="0" max="1" step="0.05" bind:value={graticuleOpacity} />
        <span>{Math.round(graticuleOpacity * 100)}%</span>
      </div>
      <div class="ctrl-row">
        <label class="flex items-center gap-1">
          <input type="checkbox" bind:checked={colorizeWaveform} class="accent-indigo-500" />
          Colorize
        </label>
      </div>
      <div class="ctrl-row">
        <label class="flex items-center gap-1">
          <input type="checkbox" bind:checked={showRefLevels} class="accent-indigo-500" />
          Ref Levels
        </label>
        {#if showRefLevels}
          <div class="ref-inputs">
            <span>Lo</span>
            <input type="number" min="0" max="255" bind:value={refLow} class="ref-num" />
            <span>Hi</span>
            <input type="number" min="0" max="255" bind:value={refHigh} class="ref-num" />
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Curve editor -->
  <div class="relative">
    <canvas bind:this={scopeCanvas} width={256} height={256}
      class="absolute inset-0 w-full h-full rounded"
      style="z-index: 0; pointer-events: none; opacity: 0.6;" />

    <svg bind:this={svgElement}
      viewBox="0 0 {SVG_SIZE} {SVG_SIZE}"
      class="w-full aspect-square rounded cursor-crosshair select-none"
      role="img" aria-label="Tone curve editor"
      style="touch-action: none; position: relative; z-index: 1; background: rgba(23, 23, 23, 0.3); overflow: visible;"
      onclick={handleSvgClick}
    >
      <!-- Grid -->
      {#each [0, 64, 128, 192, 256] as pos}
        <line x1={pos} y1="0" x2={pos} y2={SVG_SIZE} stroke="#374151" stroke-width="1" />
        <line x1="0" y1={pos} x2={SVG_SIZE} y2={pos} stroke="#374151" stroke-width="1" />
      {/each}

      <!-- Identity diagonal -->
      <line x1="0" y1={SVG_SIZE} x2={SVG_SIZE} y2="0" stroke="#4b5563" stroke-width="1" stroke-dasharray="4 4" />

      <!-- Active curve (same spline as LUT) -->
      <path d={getCurvePath()} stroke={channelColor(activeChannel)} stroke-width={strokeScale * 2} fill="none" />

      <!-- Black point endpoint -->
      <circle
        cx={pointRadius * 0.8}
        cy={(1 - getEp().black) * SVG_SIZE}
        r={pointRadius}
        fill={getEp().black !== 0 ? channelColor(activeChannel) : 'rgba(128,128,128,0.3)'}
        stroke={channelColor(activeChannel)}
        stroke-width={strokeScale * 1.5}
        role="slider" aria-label="Black point" aria-valuenow={Math.round(getEp().black * 100)}
        class="cursor-ns-resize"
        onmousedown={(e) => handleEndpointDown(-1, e)}
        ontouchstart={(e) => handleEndpointDown(-1, e)}
        ondblclick={(e) => handleEndpointDblClick('black', e)}
      />
      <!-- White point endpoint -->
      <circle
        cx={SVG_SIZE - pointRadius * 0.8}
        cy={(1 - getEp().white) * SVG_SIZE}
        r={pointRadius}
        fill={getEp().white !== 1 ? channelColor(activeChannel) : 'rgba(128,128,128,0.3)'}
        stroke={channelColor(activeChannel)}
        stroke-width={strokeScale * 1.5}
        role="slider" aria-label="White point" aria-valuenow={Math.round(getEp().white * 100)}
        class="cursor-ns-resize"
        onmousedown={(e) => handleEndpointDown(-2, e)}
        ontouchstart={(e) => handleEndpointDown(-2, e)}
        ondblclick={(e) => handleEndpointDblClick('white', e)}
      />

      <!-- Control points -->
      {#each getPoints() as point, index}
        {@const svgX = point.x * SVG_SIZE}
        {@const svgY = (1 - point.y) * SVG_SIZE}
        <circle
          cx={svgX} cy={svgY} r={pointRadius}
          fill={channelColor(activeChannel)} stroke="#000" stroke-width={strokeScale * 1.5}
          role="slider" aria-label="Control point {index + 1}"
          class="cursor-move"
          onmousedown={(e) => handlePointMouseDown(index, e)}
          ontouchstart={(e) => handlePointTouchStart(index, e)}
          ondblclick={(e) => handlePointDblClick(index, e)}
        />
      {/each}
    </svg>

    <div class="absolute top-2 right-2 text-xs text-gray-400 bg-black/50 px-2 py-1 rounded">
      {getPoints().length}/{MAX_POINTS} points
    </div>
  </div>

  <div class="text-xs text-gray-400">
    Click to add control points • Drag to adjust • Double-click to remove
  </div>
</div>

<style>
  .scope-controls {
    display: flex; flex-direction: column; gap: 4px;
    padding: 6px 8px; margin-bottom: 4px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px; font-size: 10px; color: #9ca3af;
  }
  .ctrl-row { display: flex; align-items: center; gap: 6px; }
  .ctrl-row label { min-width: 60px; font-size: 10px; color: #9ca3af; }
  .ctrl-row input[type="range"] {
    flex: 1; height: 3px; -webkit-appearance: none; appearance: none;
    background: rgba(255, 255, 255, 0.15); border-radius: 2px; outline: none; cursor: pointer;
  }
  .ctrl-row input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none; width: 10px; height: 10px; border-radius: 50%;
    background: #9ca3af; border: 1px solid #6b7280; cursor: pointer;
  }
  .ctrl-row input[type="range"]::-moz-range-thumb {
    width: 10px; height: 10px; border-radius: 50%;
    background: #9ca3af; border: 1px solid #6b7280; cursor: pointer;
  }
  .ctrl-row span { min-width: 28px; text-align: right; font-size: 10px; font-family: 'SF Mono', monospace; color: #6b7280; }
  .ref-inputs { display: flex; align-items: center; gap: 4px; margin-left: auto; font-size: 10px; }
  .ref-inputs span { color: #6b7280; min-width: auto; }
  .ref-num {
    width: 36px; padding: 1px 3px; font-size: 10px; font-family: 'SF Mono', monospace;
    color: #d1d5db; background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 3px; outline: none; text-align: center;
  }
  .ref-num:focus { border-color: rgba(99, 102, 241, 0.5); }
  .scope-intensity-slider {
    width: 60px; height: 3px; -webkit-appearance: none; appearance: none;
    background: linear-gradient(to right, rgba(255,255,255,0.1), rgba(255,255,255,0.4));
    border-radius: 2px; outline: none; cursor: pointer; flex-shrink: 0;
  }
  .scope-intensity-slider::-webkit-slider-thumb {
    -webkit-appearance: none; width: 10px; height: 10px; border-radius: 50%;
    background: #9ca3af; border: 1px solid #6b7280; cursor: pointer;
  }
  .scope-intensity-slider::-moz-range-thumb {
    width: 10px; height: 10px; border-radius: 50%;
    background: #9ca3af; border: 1px solid #6b7280; cursor: pointer;
  }
</style>
