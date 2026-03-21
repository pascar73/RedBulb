<script lang="ts">
  import { developManager } from '$lib/managers/edit/develop-manager.svelte';
  import { editManager } from '$lib/managers/edit/edit-manager.svelte';

  type Channel = 'master' | 'red' | 'green' | 'blue';
  
  let activeChannel = $state<Channel>('master');
  let draggingIndex = $state<number | null>(null);
  let pointClicked = false; // prevents SVG background click when clicking a point
  let histogramPaths = $state<{ master: string; red: string; green: string; blue: string }>({
    master: '', red: '', green: '', blue: ''
  });
  let scopeCanvas = $state<HTMLCanvasElement | undefined>(undefined);
  type ScopeType = 'parade' | 'waveform' | 'vectorscope' | 'histogram' | 'cie';
  let activeScopeType = $state<ScopeType>('parade');
  const scopeTypes: { id: ScopeType; label: string }[] = [
    { id: 'parade', label: 'Parade' },
    { id: 'waveform', label: 'Waveform' },
    { id: 'vectorscope', label: 'Vectorscope' },
    { id: 'histogram', label: 'Histogram' },
    { id: 'cie', label: 'CIE Chromaticity' },
  ];

  const MAX_POINTS = 16;
  const POINT_RADIUS = 8; // larger hit target for easier clicking
  const SVG_SIZE = 256;
  const HISTOGRAM_BINS = 256;

  // Cached raw pixel data from the original image
  let rawPixelData: Uint8ClampedArray | null = null;
  let imgWidth = 0;
  let imgHeight = 0;
  let histTimeout: ReturnType<typeof setTimeout> | undefined;

  // Re-render scope when type changes
  $effect(() => {
    const _type = activeScopeType;
    if (rawPixelData) renderScope();
  });

  // Load image data once when asset changes
  $effect(() => {
    const asset = editManager.currentAsset;
    if (asset) {
      loadImageData(asset.id);
    }
  });

  // Recompute histogram when curves change
  $effect(() => {
    // Deep-read curves arrays so Svelte 5 tracks point mutations
    const curves = developManager.curves;
    const _track = [
      curves.master.length, curves.master.map(p => p.x + p.y).join(),
      curves.red.length, curves.red.map(p => p.x + p.y).join(),
      curves.green.length, curves.green.map(p => p.x + p.y).join(),
      curves.blue.length, curves.blue.map(p => p.x + p.y).join(),
    ];
    if (rawPixelData) {
      if (histTimeout) clearTimeout(histTimeout);
      histTimeout = setTimeout(() => { updateHistogram(); renderScope(); }, 80);
    }
  });

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
      updateHistogram();
      renderScope();
    } catch {
      // Silently fail — histogram is optional
    }
  }

  function buildCurveLUT(points: Array<{ x: number; y: number }>): Uint8Array {
    const lut = new Uint8Array(256);
    if (points.length === 0) {
      // Identity — no curve adjustment
      for (let i = 0; i < 256; i++) lut[i] = i;
      return lut;
    }

    // Full control points including endpoints
    const allPoints = [{ x: 0, y: 0 }, ...points, { x: 1, y: 1 }];

    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      // Find segment
      let seg = 0;
      for (let s = 0; s < allPoints.length - 1; s++) {
        if (t >= allPoints[s].x && t <= allPoints[s + 1].x) { seg = s; break; }
      }
      const p0 = allPoints[seg];
      const p1 = allPoints[seg + 1];
      const frac = p1.x === p0.x ? 0 : (t - p0.x) / (p1.x - p0.x);
      const val = p0.y + frac * (p1.y - p0.y);
      lut[i] = Math.max(0, Math.min(255, Math.round(val * 255)));
    }
    return lut;
  }

  function renderScope() {
    if (!rawPixelData || !scopeCanvas) return;
    switch (activeScopeType) {
      case 'parade': renderParade(); break;
      case 'waveform': renderWaveform(); break;
      case 'vectorscope': renderVectorscope(); break;
      case 'histogram': renderHistogramScope(); break;
      case 'cie': renderCIE(); break;
    }
  }

  function renderParade() {
    if (!rawPixelData || !scopeCanvas) return;
    const data = rawPixelData;
    const curves = developManager.curves;
    const masterLUT = buildCurveLUT(curves.master);
    const redLUT = buildCurveLUT(curves.red);
    const greenLUT = buildCurveLUT(curves.green);
    const blueLUT = buildCurveLUT(curves.blue);

    const canvasW = scopeCanvas.width;
    const canvasH = scopeCanvas.height;
    const ctx = scopeCanvas.getContext('2d')!;

    // Clear
    ctx.fillStyle = '#171717';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Draw 10%/90% reference lines
    ctx.strokeStyle = 'rgba(75,85,99,0.4)';
    ctx.lineWidth = 0.5;
    for (const frac of [0.25, 0.5, 0.75]) {
      const lineY = canvasH * (1 - frac);
      ctx.beginPath();
      ctx.moveTo(0, lineY);
      ctx.lineTo(canvasW, lineY);
      ctx.stroke();
    }

    const imgW = imgWidth;
    const imgH = imgHeight;
    if (imgW === 0 || imgH === 0) return;

    const sectionW = Math.floor(canvasW / 3);
    const gap = 2;

    // For each column of image, count intensity distribution per channel
    // Use accumulation buffers for density
    const rBuf = new Uint16Array(sectionW * canvasH);
    const gBuf = new Uint16Array(sectionW * canvasH);
    const bBuf = new Uint16Array(sectionW * canvasH);

    for (let row = 0; row < imgH; row++) {
      for (let col = 0; col < imgW; col++) {
        const i = (row * imgW + col) * 4;
        const r = masterLUT[redLUT[data[i]]];
        const g = masterLUT[greenLUT[data[i + 1]]];
        const b = masterLUT[blueLUT[data[i + 2]]];

        const xBin = Math.floor(col / imgW * sectionW);
        const rY = Math.floor((1 - r / 255) * (canvasH - 1));
        const gY = Math.floor((1 - g / 255) * (canvasH - 1));
        const bY = Math.floor((1 - b / 255) * (canvasH - 1));

        rBuf[rY * sectionW + xBin]++;
        gBuf[gY * sectionW + xBin]++;
        bBuf[bY * sectionW + xBin]++;
      }
    }

    // Find max for normalization
    let maxVal = 1;
    for (let i = 0; i < rBuf.length; i++) {
      maxVal = Math.max(maxVal, rBuf[i], gBuf[i], bBuf[i]);
    }

    // Render each channel section
    const sections: Array<{ buf: Uint16Array; color: [number, number, number]; offsetX: number }> = [
      { buf: rBuf, color: [239, 68, 68], offsetX: 0 },
      { buf: gBuf, color: [34, 197, 94], offsetX: sectionW + gap },
      { buf: bBuf, color: [59, 130, 246], offsetX: 2 * (sectionW + gap) },
    ];

    for (const { buf, color, offsetX } of sections) {
      const imgData = ctx.createImageData(sectionW, canvasH);
      const pixels = imgData.data;
      for (let y = 0; y < canvasH; y++) {
        for (let x = 0; x < sectionW; x++) {
          const density = buf[y * sectionW + x] / maxVal;
          if (density > 0) {
            const idx = (y * sectionW + x) * 4;
            const alpha = Math.min(255, Math.round(density * 600));
            pixels[idx] = color[0];
            pixels[idx + 1] = color[1];
            pixels[idx + 2] = color[2];
            pixels[idx + 3] = alpha;
          }
        }
      }
      ctx.putImageData(imgData, offsetX, 0);
    }

    // Section labels
    ctx.font = '10px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('R', 4, 12);
    ctx.fillText('G', sectionW + gap + 4, 12);
    ctx.fillText('B', 2 * (sectionW + gap) + 4, 12);
  }

  function renderWaveform() {
    if (!rawPixelData || !scopeCanvas) return;
    const data = rawPixelData;
    const curves = developManager.curves;
    const masterLUT = buildCurveLUT(curves.master);
    const redLUT = buildCurveLUT(curves.red);
    const greenLUT = buildCurveLUT(curves.green);
    const blueLUT = buildCurveLUT(curves.blue);
    const W = scopeCanvas.width, H = scopeCanvas.height;
    const ctx = scopeCanvas.getContext('2d')!;
    ctx.fillStyle = '#171717';
    ctx.fillRect(0, 0, W, H);

    // Reference lines
    ctx.strokeStyle = 'rgba(75,85,99,0.4)';
    ctx.lineWidth = 0.5;
    for (const frac of [0.25, 0.5, 0.75]) {
      ctx.beginPath(); ctx.moveTo(0, H * (1 - frac)); ctx.lineTo(W, H * (1 - frac)); ctx.stroke();
    }

    // All 3 channels overlaid on same graph
    const rBuf = new Uint16Array(W * H);
    const gBuf = new Uint16Array(W * H);
    const bBuf = new Uint16Array(W * H);
    const imgW = imgWidth, imgH = imgHeight;
    if (!imgW || !imgH) return;

    for (let row = 0; row < imgH; row++) {
      for (let col = 0; col < imgW; col++) {
        const i = (row * imgW + col) * 4;
        const r = masterLUT[redLUT[data[i]]];
        const g = masterLUT[greenLUT[data[i + 1]]];
        const b = masterLUT[blueLUT[data[i + 2]]];
        const xBin = Math.floor(col / imgW * W);
        rBuf[Math.floor((1 - r / 255) * (H - 1)) * W + xBin]++;
        gBuf[Math.floor((1 - g / 255) * (H - 1)) * W + xBin]++;
        bBuf[Math.floor((1 - b / 255) * (H - 1)) * W + xBin]++;
      }
    }

    let maxVal = 1;
    for (let i = 0; i < rBuf.length; i++) maxVal = Math.max(maxVal, rBuf[i], gBuf[i], bBuf[i]);

    const imgData = ctx.createImageData(W, H);
    const px = imgData.data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = (y * W + x) * 4;
        const bi = y * W + x;
        const rd = rBuf[bi] / maxVal, gd = gBuf[bi] / maxVal, bd = bBuf[bi] / maxVal;
        if (rd > 0 || gd > 0 || bd > 0) {
          px[idx] = Math.min(255, Math.round(rd * 600));
          px[idx + 1] = Math.min(255, Math.round(gd * 600));
          px[idx + 2] = Math.min(255, Math.round(bd * 600));
          px[idx + 3] = Math.min(255, Math.round(Math.max(rd, gd, bd) * 600));
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }

  function renderVectorscope() {
    if (!rawPixelData || !scopeCanvas) return;
    const data = rawPixelData;
    const curves = developManager.curves;
    const masterLUT = buildCurveLUT(curves.master);
    const redLUT = buildCurveLUT(curves.red);
    const greenLUT = buildCurveLUT(curves.green);
    const blueLUT = buildCurveLUT(curves.blue);
    const W = scopeCanvas.width, H = scopeCanvas.height;
    const ctx = scopeCanvas.getContext('2d')!;
    ctx.fillStyle = '#171717';
    ctx.fillRect(0, 0, W, H);

    const cx = W / 2, cy = H / 2, radius = Math.min(cx, cy) - 8;

    // Draw graticule (circle + crosshair)
    ctx.strokeStyle = 'rgba(75,85,99,0.5)';
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - radius); ctx.lineTo(cx, cy + radius); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - radius, cy); ctx.lineTo(cx + radius, cy); ctx.stroke();

    // Color target markers (SMPTE: R, G, B, Cy, Mg, Yl)
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

    // Plot pixels — convert RGB to Cb/Cr (simplified)
    const buf = new Uint16Array(W * H);
    const imgW = imgWidth, imgH = imgHeight;
    if (!imgW || !imgH) return;

    for (let pix = 0; pix < imgW * imgH; pix++) {
      const i = pix * 4;
      const r = masterLUT[redLUT[data[i]]] / 255;
      const g = masterLUT[greenLUT[data[i + 1]]] / 255;
      const b = masterLUT[blueLUT[data[i + 2]]] / 255;
      // YCbCr conversion
      const cb = -0.169 * r - 0.331 * g + 0.5 * b;
      const cr = 0.5 * r - 0.419 * g - 0.081 * b;
      const px = Math.round(cx + cr * radius * 2);
      const py = Math.round(cy - cb * radius * 2);
      if (px >= 0 && px < W && py >= 0 && py < H) {
        buf[py * W + px]++;
      }
    }

    let maxVal = 1;
    for (let i = 0; i < buf.length; i++) maxVal = Math.max(maxVal, buf[i]);

    const imgData = ctx.createImageData(W, H);
    const px = imgData.data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const d = buf[y * W + x] / maxVal;
        if (d > 0) {
          const idx = (y * W + x) * 4;
          // Color based on position (Cb/Cr → approximate hue)
          const normX = (x - cx) / radius, normY = (cy - y) / radius;
          const hue = Math.atan2(normY, normX) / (Math.PI * 2) + 0.5;
          const [hr, hg, hb] = hueToRgb(hue);
          const intensity = Math.min(1, d * 8);
          px[idx] = Math.round(hr * 255 * intensity);
          px[idx + 1] = Math.round(hg * 255 * intensity);
          px[idx + 2] = Math.round(hb * 255 * intensity);
          px[idx + 3] = Math.min(255, Math.round(d * 800));
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);

    // Redraw graticule on top
    ctx.strokeStyle = 'rgba(75,85,99,0.3)';
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2); ctx.stroke();
  }

  function hueToRgb(h: number): [number, number, number] {
    const s = 0.8, l = 0.6;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hue2rgb = (t: number) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    return [hue2rgb(h + 1/3), hue2rgb(h), hue2rgb(h - 1/3)];
  }

  function renderHistogramScope() {
    if (!rawPixelData || !scopeCanvas) return;
    const data = rawPixelData;
    const curves = developManager.curves;
    const masterLUT = buildCurveLUT(curves.master);
    const redLUT = buildCurveLUT(curves.red);
    const greenLUT = buildCurveLUT(curves.green);
    const blueLUT = buildCurveLUT(curves.blue);
    const W = scopeCanvas.width, H = scopeCanvas.height;
    const ctx = scopeCanvas.getContext('2d')!;
    ctx.fillStyle = '#171717';
    ctx.fillRect(0, 0, W, H);

    const rH = new Uint32Array(256), gH = new Uint32Array(256), bH = new Uint32Array(256), lH = new Uint32Array(256);
    for (let i = 0; i < data.length; i += 4) {
      const r = masterLUT[redLUT[data[i]]], g = masterLUT[greenLUT[data[i + 1]]], b = masterLUT[blueLUT[data[i + 2]]];
      rH[r]++; gH[g]++; bH[b]++;
      lH[Math.round(0.299 * r + 0.587 * g + 0.114 * b)]++;
    }

    const maxVal = Math.max(...rH, ...gH, ...bH, ...lH) || 1;

    // Draw filled histograms with transparency
    const drawChannel = (hist: Uint32Array, color: string, alpha: number) => {
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let i = 0; i < 256; i++) {
        const x = (i / 255) * W;
        const h = (hist[i] / maxVal) * H * 0.9;
        ctx.lineTo(x, H - h);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();
    };

    drawChannel(lH, '#9ca3af', 0.2);
    drawChannel(rH, '#ef4444', 0.35);
    drawChannel(gH, '#22c55e', 0.35);
    drawChannel(bH, '#3b82f6', 0.35);
    ctx.globalAlpha = 1;

    // Reference lines
    ctx.strokeStyle = 'rgba(75,85,99,0.3)';
    ctx.lineWidth = 0.5;
    for (const frac of [0.25, 0.5, 0.75]) {
      ctx.beginPath(); ctx.moveTo(W * frac, 0); ctx.lineTo(W * frac, H); ctx.stroke();
    }
  }

  function renderCIE() {
    if (!rawPixelData || !scopeCanvas) return;
    const data = rawPixelData;
    const curves = developManager.curves;
    const masterLUT = buildCurveLUT(curves.master);
    const redLUT = buildCurveLUT(curves.red);
    const greenLUT = buildCurveLUT(curves.green);
    const blueLUT = buildCurveLUT(curves.blue);
    const W = scopeCanvas.width, H = scopeCanvas.height;
    const ctx = scopeCanvas.getContext('2d')!;
    ctx.fillStyle = '#171717';
    ctx.fillRect(0, 0, W, H);

    // Draw CIE 1931 horseshoe outline (simplified)
    const horseshoe = [
      [0.175, 0.005], [0.174, 0.015], [0.174, 0.045], [0.171, 0.090],
      [0.160, 0.150], [0.144, 0.214], [0.120, 0.297], [0.091, 0.378],
      [0.068, 0.431], [0.045, 0.462], [0.023, 0.482], [0.008, 0.490],
      [0.004, 0.514], [0.012, 0.546], [0.035, 0.580], [0.073, 0.616],
      [0.117, 0.647], [0.170, 0.673], [0.230, 0.694], [0.295, 0.710],
      [0.355, 0.714], [0.420, 0.710], [0.480, 0.695], [0.535, 0.667],
      [0.585, 0.630], [0.625, 0.590], [0.655, 0.550], [0.680, 0.510],
      [0.700, 0.465], [0.715, 0.420], [0.725, 0.370], [0.734, 0.320],
      [0.735, 0.265], [0.735, 0.265]
    ];

    // Scale to canvas (x: 0-0.8 → 10-W-10, y: 0-0.9 → H-10 to 10)
    const scaleX = (x: number) => 10 + (x / 0.8) * (W - 20);
    const scaleY = (y: number) => H - 10 - (y / 0.9) * (H - 20);

    ctx.strokeStyle = 'rgba(100,100,100,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(scaleX(horseshoe[0][0]), scaleY(horseshoe[0][1]));
    for (const [x, y] of horseshoe) ctx.lineTo(scaleX(x), scaleY(y));
    ctx.closePath();
    ctx.stroke();

    // D65 white point
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.arc(scaleX(0.3127), scaleY(0.3290), 3, 0, Math.PI * 2); ctx.fill();
    ctx.font = '8px sans-serif';
    ctx.fillText('D65', scaleX(0.3127) + 5, scaleY(0.3290) - 5);

    // Plot image pixels in CIE xy space
    const buf = new Uint16Array(W * H);
    const imgW = imgWidth, imgH = imgHeight;
    if (!imgW || !imgH) return;

    for (let pix = 0; pix < imgW * imgH; pix += 3) { // Sample every 3rd pixel for speed
      const i = pix * 4;
      if (i + 2 >= data.length) break;
      const r = masterLUT[redLUT[data[i]]] / 255;
      const g = masterLUT[greenLUT[data[i + 1]]] / 255;
      const b = masterLUT[blueLUT[data[i + 2]]] / 255;

      // Linear sRGB → XYZ (D65)
      const rl = r <= 0.04045 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
      const gl = g <= 0.04045 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
      const bl = b <= 0.04045 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);

      const X = 0.4124 * rl + 0.3576 * gl + 0.1805 * bl;
      const Y = 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
      const Z = 0.0193 * rl + 0.1192 * gl + 0.9505 * bl;
      const sum = X + Y + Z;
      if (sum < 0.001) continue;

      const cx = X / sum;
      const cy = Y / sum;
      const px = Math.round(scaleX(cx));
      const py = Math.round(scaleY(cy));
      if (px >= 0 && px < W && py >= 0 && py < H) buf[py * W + px]++;
    }

    let maxVal = 1;
    for (let i = 0; i < buf.length; i++) maxVal = Math.max(maxVal, buf[i]);

    const imgData = ctx.createImageData(W, H);
    const px = imgData.data;
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
    ctx.putImageData(imgData, 0, 0);

    // Redraw outline on top
    ctx.strokeStyle = 'rgba(100,100,100,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(scaleX(horseshoe[0][0]), scaleY(horseshoe[0][1]));
    for (const [hx, hy] of horseshoe) ctx.lineTo(scaleX(hx), scaleY(hy));
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.arc(scaleX(0.3127), scaleY(0.3290), 2, 0, Math.PI * 2); ctx.fill();
  }

  function updateHistogram() {
    if (!rawPixelData) return;
    const data = rawPixelData;
    const curves = developManager.curves;

    // Build LUTs for each channel
    const masterLUT = buildCurveLUT(curves.master);
    const redLUT = buildCurveLUT(curves.red);
    const greenLUT = buildCurveLUT(curves.green);
    const blueLUT = buildCurveLUT(curves.blue);

    const rHist = new Uint32Array(HISTOGRAM_BINS);
    const gHist = new Uint32Array(HISTOGRAM_BINS);
    const bHist = new Uint32Array(HISTOGRAM_BINS);
    const lHist = new Uint32Array(HISTOGRAM_BINS);

    for (let i = 0; i < data.length; i += 4) {
      // Apply curves: channel-specific then master
      const r = masterLUT[redLUT[data[i]]];
      const g = masterLUT[greenLUT[data[i + 1]]];
      const b = masterLUT[blueLUT[data[i + 2]]];
      rHist[r]++;
      gHist[g]++;
      bHist[b]++;
      lHist[Math.round(0.299 * r + 0.587 * g + 0.114 * b)]++;
    }

    histogramPaths = {
      master: buildHistogramPath(lHist),
      red: buildHistogramPath(rHist),
      green: buildHistogramPath(gHist),
      blue: buildHistogramPath(bHist),
    };
  }

  function buildHistogramPath(hist: Uint32Array): string {
    const max = Math.max(...hist) || 1;
    const points: string[] = [`M 0,${SVG_SIZE}`];
    for (let i = 0; i < HISTOGRAM_BINS; i++) {
      const x = (i / 255) * SVG_SIZE;
      const h = (hist[i] / max) * SVG_SIZE * 0.8; // 80% max height
      points.push(`L ${x.toFixed(1)},${(SVG_SIZE - h).toFixed(1)}`);
    }
    points.push(`L ${SVG_SIZE},${SVG_SIZE} Z`);
    return points.join(' ');
  }

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
    // Don't add a point if we just clicked on an existing point
    if (pointClicked) {
      pointClicked = false;
      return;
    }

    const svg = event.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = 1 - (event.clientY - rect.top) / rect.height;

    const points = getPoints();
    if (points.length >= MAX_POINTS) return;

    // Check if click is near an existing point (within POINT_RADIUS)
    const clickNearPoint = points.some(p => {
      const dx = (p.x - x) * SVG_SIZE;
      const dy = (p.y - y) * SVG_SIZE;
      return Math.sqrt(dx * dx + dy * dy) < POINT_RADIUS * 2;
    });
    if (clickNearPoint) return;

    // Add new point and sort by x
    const newPoints = [...points, { x, y }].sort((a, b) => a.x - b.x);
    setPoints(newPoints);
  }

  function handlePointMouseDown(index: number, event: MouseEvent) {
    event.stopPropagation();
    event.preventDefault();
    pointClicked = true;
    draggingIndex = index;
  }

  function handlePointTouchStart(index: number, event: TouchEvent) {
    event.stopPropagation();
    event.preventDefault();
    pointClicked = true;
    draggingIndex = index;
  }

  function handlePointDblClick(index: number, event: MouseEvent) {
    event.stopPropagation();
    event.preventDefault();
    pointClicked = true;
    draggingIndex = null;
    const points = getPoints();
    const newPoints = points.filter((_, i) => i !== index);
    setPoints(newPoints);
  }

  let svgElement = $state<SVGSVGElement | undefined>(undefined);

  function updateDragPosition(clientX: number, clientY: number) {
    if (draggingIndex === null || !svgElement) return;

    const rect = svgElement.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));

    const points = getPoints();
    const newPoints = [...points];
    newPoints[draggingIndex] = { x, y };
    newPoints.sort((a, b) => a.x - b.x);
    const movedPoint = { x, y };
    const newIndex = newPoints.findIndex(p => p.x === movedPoint.x && p.y === movedPoint.y);
    if (newIndex !== -1) draggingIndex = newIndex;
    setPoints(newPoints);
  }

  function handleMouseMove(event: MouseEvent) {
    updateDragPosition(event.clientX, event.clientY);
  }

  function handleTouchMove(event: TouchEvent) {
    if (draggingIndex !== null && event.touches.length > 0) {
      event.preventDefault();
      updateDragPosition(event.touches[0].clientX, event.touches[0].clientY);
    }
  }

  function handleMouseUp() {
    draggingIndex = null;
    pointClicked = false;
  }

  function handleTouchEnd() {
    draggingIndex = null;
    pointClicked = false;
  }

  // Monotone cubic spline interpolation (Fritsch-Carlson)
  function getCurvePath(): string {
    const points = getPoints();
    if (points.length === 0) {
      return `M 0,${SVG_SIZE} L ${SVG_SIZE},0`;
    }

    // Include endpoints
    const allPoints = [
      { x: 0, y: 0 },
      ...points,
      { x: 1, y: 1 }
    ].sort((a, b) => a.x - b.x);

    const n = allPoints.length;
    if (n < 2) return `M 0,${SVG_SIZE} L ${SVG_SIZE},0`;
    if (n === 2) {
      const p0 = allPoints[0], p1 = allPoints[1];
      return `M ${p0.x * SVG_SIZE},${(1 - p0.y) * SVG_SIZE} L ${p1.x * SVG_SIZE},${(1 - p1.y) * SVG_SIZE}`;
    }

    // Compute tangents using Catmull-Rom style
    const tangents: number[] = [];
    for (let i = 0; i < n; i++) {
      if (i === 0) {
        tangents.push((allPoints[1].y - allPoints[0].y) / (allPoints[1].x - allPoints[0].x || 1));
      } else if (i === n - 1) {
        tangents.push((allPoints[n - 1].y - allPoints[n - 2].y) / (allPoints[n - 1].x - allPoints[n - 2].x || 1));
      } else {
        const d0 = (allPoints[i].y - allPoints[i - 1].y) / (allPoints[i].x - allPoints[i - 1].x || 1);
        const d1 = (allPoints[i + 1].y - allPoints[i].y) / (allPoints[i + 1].x - allPoints[i].x || 1);
        // Average tangent, clamped for monotonicity
        tangents.push((d0 + d1) / 2);
      }
    }

    // Build cubic bezier path segments
    let path = `M ${allPoints[0].x * SVG_SIZE},${(1 - allPoints[0].y) * SVG_SIZE}`;
    for (let i = 0; i < n - 1; i++) {
      const p0 = allPoints[i];
      const p1 = allPoints[i + 1];
      const dx = p1.x - p0.x;
      // Control points for cubic bezier
      const cp1x = p0.x + dx / 3;
      const cp1y = p0.y + tangents[i] * dx / 3;
      const cp2x = p1.x - dx / 3;
      const cp2y = p1.y - tangents[i + 1] * dx / 3;
      path += ` C ${cp1x * SVG_SIZE},${(1 - cp1y) * SVG_SIZE} ${cp2x * SVG_SIZE},${(1 - cp2y) * SVG_SIZE} ${p1.x * SVG_SIZE},${(1 - p1.y) * SVG_SIZE}`;
    }

    return path;
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

  <!-- Scope type selector (moved above curves) -->
  <div class="flex items-center gap-2 mb-1">
    <select
      class="text-xs bg-gray-800 text-gray-300 border border-gray-700 rounded px-2 py-1 cursor-pointer focus:outline-none focus:border-gray-500"
      bind:value={activeScopeType}
    >
      {#each scopeTypes as scope}
        <option value={scope.id}>{scope.label}</option>
      {/each}
    </select>
    <span class="text-xs text-gray-500">backdrop</span>
  </div>

  <!-- Curve editor with scope backdrop -->
  <div class="relative">
    <!-- Scope canvas as background -->
    <canvas
      bind:this={scopeCanvas}
      width={256}
      height={256}
      class="absolute inset-0 w-full h-full rounded opacity-50"
      style="z-index: 0; pointer-events: none;"
    ></canvas>

    <svg
      bind:this={svgElement}
      viewBox="0 0 {SVG_SIZE} {SVG_SIZE}"
      class="w-full aspect-square rounded cursor-crosshair select-none"
      style="touch-action: none; position: relative; z-index: 1; background: rgba(23, 23, 23, 0.4);"
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

      <!-- Histogram overlay — all channels visible simultaneously (DaVinci-style) -->
      {#if histogramPaths.master}
        <path d={histogramPaths.master} fill="rgba(180,180,180,0.10)" stroke="none" />
      {/if}
      {#if histogramPaths.red}
        <path d={histogramPaths.red} fill="rgba(239,68,68,0.12)" stroke="rgba(239,68,68,0.25)" stroke-width="0.5" />
      {/if}
      {#if histogramPaths.green}
        <path d={histogramPaths.green} fill="rgba(34,197,94,0.12)" stroke="rgba(34,197,94,0.25)" stroke-width="0.5" />
      {/if}
      {#if histogramPaths.blue}
        <path d={histogramPaths.blue} fill="rgba(59,130,246,0.12)" stroke="rgba(59,130,246,0.25)" stroke-width="0.5" />
      {/if}

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

      <!-- Fixed anchor points at (0,0%) and (100,100%) -->
      <circle
        cx="0"
        cy={SVG_SIZE}
        r={POINT_RADIUS - 2}
        fill="none"
        stroke={channels.find(c => c.id === activeChannel)?.color}
        stroke-width="1.5"
        opacity="0.5"
      />
      <circle
        cx={SVG_SIZE}
        cy="0"
        r={POINT_RADIUS - 2}
        fill="none"
        stroke={channels.find(c => c.id === activeChannel)?.color}
        stroke-width="1.5"
        opacity="0.5"
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
          ontouchstart={(e) => handlePointTouchStart(index, e)}
          ondblclick={(e) => handlePointDblClick(index, e)}
        />
      {/each}
    </svg>

    <!-- Point count indicator -->
    <div class="absolute top-2 right-2 text-xs text-gray-400 bg-black/50 px-2 py-1 rounded">
      {getPoints().length}/{MAX_POINTS} points
    </div>
  </div>

  <!-- Instructions -->
  <div class="text-xs text-gray-400">
    Click to add control points • Drag to adjust • Double-click to remove
  </div>


</div>
