/**
 * scope-worker.ts — Off-main-thread scope rendering.
 * Receives image data + LUTs, computes histogram/waveform/parade/vectorscope/CIE,
 * sends back raw RGBA pixel buffer for the scope canvas.
 *
 * This keeps the main thread free for buttery-smooth curve dragging.
 */

export interface LightParams {
  exposure: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  brightness: number;
  contrast: number;
  saturation: number;
  vibrance: number;
  clarity: number;
  dehaze: number;
  fade: number;
}

export interface ScopeRequest {
  type: 'init' | 'render';
  // init: set raw pixel data
  pixels?: ArrayBuffer;  // Uint8ClampedArray transferred
  imgWidth?: number;
  imgHeight?: number;
  // render: compute scope
  scopeType?: string;
  masterLUT?: ArrayBuffer;
  redLUT?: ArrayBuffer;
  greenLUT?: ArrayBuffer;
  blueLUT?: ArrayBuffer;
  canvasW?: number;
  canvasH?: number;
  brightness?: number;
  colorize?: boolean;
  light?: LightParams;
}

export interface ScopeResponse {
  type: 'rendered';
  imageData: ArrayBuffer; // RGBA pixels, transferred back
  width: number;
  height: number;
}

// Worker state
let pixelData: Uint8ClampedArray | null = null;  // original pixels
let processedPixels: Uint8ClampedArray | null = null;  // light-adjusted pixels
let imgW = 0;
let imgH = 0;
let lastLightKey = '';

/**
 * Apply Light slider adjustments to pixel data (matches preview-canvas CSS filter logic).
 * We simulate brightness/contrast/saturation per-pixel since the scope reads raw data.
 */
function applyLightToPixels(src: Uint8ClampedArray, p: LightParams): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);

  // Compute combined multipliers (same math as buildFilterString in preview-canvas)
  let bright = Math.pow(2, p.exposure * 0.5);
  let contrast = 1 + p.contrast;
  let saturate = 1 + p.saturation;

  if (p.highlights > 0) bright *= 1 + p.highlights * 0.15;
  if (p.shadows > 0) bright *= 1 + p.shadows * 0.1;
  bright *= 1 + p.whites * 0.2;
  bright *= 1 + p.blacks * 0.15;
  bright *= 1 + p.brightness * 0.5;

  saturate *= 1 + p.vibrance * 0.5;
  contrast *= 1 + p.clarity * 0.3;
  contrast *= 1 + p.dehaze * 0.4;
  saturate *= 1 + p.dehaze * 0.2;

  if (p.fade > 0) {
    contrast *= 1 - p.fade * 0.3;
    bright *= 1 + p.fade * 0.15;
  }

  // Apply per-pixel: brightness → contrast → saturation
  for (let i = 0; i < src.length; i += 4) {
    // Brightness
    let r = src[i] * bright;
    let g = src[i + 1] * bright;
    let b = src[i + 2] * bright;

    // Contrast (around 128 midpoint)
    r = (r - 128) * contrast + 128;
    g = (g - 128) * contrast + 128;
    b = (b - 128) * contrast + 128;

    // Saturation (luminance-preserving)
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    r = lum + (r - lum) * saturate;
    g = lum + (g - lum) * saturate;
    b = lum + (b - lum) * saturate;

    out[i] = Math.max(0, Math.min(255, Math.round(r)));
    out[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
    out[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
    out[i + 3] = src[i + 3];
  }
  return out;
}

function lightKey(p?: LightParams): string {
  if (!p) return '';
  return `${p.exposure},${p.highlights},${p.shadows},${p.whites},${p.blacks},${p.brightness},${p.contrast},${p.saturation},${p.vibrance},${p.clarity},${p.dehaze},${p.fade}`;
}

self.onmessage = (e: MessageEvent<ScopeRequest>) => {
  const msg = e.data;

  if (msg.type === 'init' && msg.pixels) {
    pixelData = new Uint8ClampedArray(msg.pixels);
    processedPixels = null;
    lastLightKey = '';
    imgW = msg.imgWidth ?? 0;
    imgH = msg.imgHeight ?? 0;
    return;
  }

  if (msg.type === 'render' && pixelData) {
    const W = msg.canvasW ?? 256;
    const H = msg.canvasH ?? 256;
    const masterLUT = new Uint8Array(msg.masterLUT!);
    const redLUT = new Uint8Array(msg.redLUT!);
    const greenLUT = new Uint8Array(msg.greenLUT!);
    const blueLUT = new Uint8Array(msg.blueLUT!);
    const gain = msg.brightness ?? 1.0;
    const colorize = msg.colorize ?? true;

    // Apply light adjustments (cached — only recompute when params change)
    const lk = lightKey(msg.light);
    if (lk !== lastLightKey || !processedPixels) {
      if (msg.light && lk !== '') {
        processedPixels = applyLightToPixels(pixelData, msg.light);
      } else {
        processedPixels = pixelData;
      }
      lastLightKey = lk;
    }

    const output = new Uint8ClampedArray(W * H * 4);

    switch (msg.scopeType) {
      case 'histogram': renderHistogram(output, W, H, masterLUT, redLUT, greenLUT, blueLUT, gain); break;
      case 'parade': renderParade(output, W, H, masterLUT, redLUT, greenLUT, blueLUT, gain); break;
      case 'waveform': renderWaveform(output, W, H, masterLUT, redLUT, greenLUT, blueLUT, gain, colorize); break;
      case 'vectorscope': renderVectorscope(output, W, H, masterLUT, redLUT, greenLUT, blueLUT, gain); break;
      case 'cie': renderCIE(output, W, H, masterLUT, redLUT, greenLUT, blueLUT); break;
      default: renderHistogram(output, W, H, masterLUT, redLUT, greenLUT, blueLUT, gain);
    }

    const resp: ScopeResponse = {
      type: 'rendered',
      imageData: output.buffer,
      width: W,
      height: H,
    };
    (self as unknown as Worker).postMessage(resp, [output.buffer]);
  }
};

function applyLUT(r: number, g: number, b: number, mL: Uint8Array, rL: Uint8Array, gL: Uint8Array, bL: Uint8Array): [number, number, number] {
  return [mL[rL[r]], mL[gL[g]], mL[bL[b]]];
}

// ── Histogram ──────────────────────────────────────────────
function renderHistogram(out: Uint8ClampedArray, W: number, H: number,
  mL: Uint8Array, rL: Uint8Array, gL: Uint8Array, bL: Uint8Array, gain: number) {
  if (!processedPixels) return;
  const rH = new Uint32Array(256), gH = new Uint32Array(256), bH = new Uint32Array(256), lH = new Uint32Array(256);

  for (let i = 0; i < processedPixels.length; i += 4) {
    const [r, g, b] = applyLUT(processedPixels[i], processedPixels[i + 1], processedPixels[i + 2], mL, rL, gL, bL);
    rH[r]++; gH[g]++; bH[b]++;
    lH[Math.round(0.299 * r + 0.587 * g + 0.114 * b)]++;
  }

  let maxVal = 1;
  for (let i = 0; i < 256; i++) maxVal = Math.max(maxVal, rH[i], gH[i], bH[i], lH[i]);

  // Render each channel into the output buffer (additive blending)
  const channels: Array<{ hist: Uint32Array; color: [number, number, number]; alpha: number }> = [
    { hist: lH, color: [156, 163, 175], alpha: 0.15 * gain },
    { hist: rH, color: [239, 68, 68], alpha: 0.3 * gain },
    { hist: gH, color: [34, 197, 94], alpha: 0.3 * gain },
    { hist: bH, color: [59, 130, 246], alpha: 0.3 * gain },
  ];

  for (const { hist, color, alpha } of channels) {
    for (let x = 0; x < W; x++) {
      const bin = Math.floor(x / W * 256);
      const binVal = bin < 256 ? hist[bin] : 0;
      const h = (binVal / maxVal) * H * 0.85;
      const startY = Math.floor(H - h);
      for (let y = startY; y < H; y++) {
        const idx = (y * W + x) * 4;
        const a = Math.min(255, alpha * 255);
        // Additive blend
        out[idx] = Math.min(255, out[idx] + Math.round(color[0] * a / 255));
        out[idx + 1] = Math.min(255, out[idx + 1] + Math.round(color[1] * a / 255));
        out[idx + 2] = Math.min(255, out[idx + 2] + Math.round(color[2] * a / 255));
        out[idx + 3] = Math.min(255, out[idx + 3] + a);
      }
    }
  }
}

// ── Parade ──────────────────────────────────────────────────
function renderParade(out: Uint8ClampedArray, W: number, H: number,
  mL: Uint8Array, rL: Uint8Array, gL: Uint8Array, bL: Uint8Array, gain: number) {
  if (!processedPixels || !imgW || !imgH) return;
  const sW = Math.floor(W / 3), gap = 2;
  const rB = new Uint16Array(sW * H), gB = new Uint16Array(sW * H), bB = new Uint16Array(sW * H);

  for (let row = 0; row < imgH; row++) {
    for (let col = 0; col < imgW; col++) {
      const i = (row * imgW + col) * 4;
      const [r, g, b] = applyLUT(processedPixels[i], processedPixels[i + 1], processedPixels[i + 2], mL, rL, gL, bL);
      const xBin = Math.floor(col / imgW * sW);
      rB[Math.floor((1 - r / 255) * (H - 1)) * sW + xBin]++;
      gB[Math.floor((1 - g / 255) * (H - 1)) * sW + xBin]++;
      bB[Math.floor((1 - b / 255) * (H - 1)) * sW + xBin]++;
    }
  }

  let maxVal = 1;
  for (let i = 0; i < rB.length; i++) maxVal = Math.max(maxVal, rB[i], gB[i], bB[i]);

  const sections: Array<{ buf: Uint16Array; color: [number, number, number]; ox: number }> = [
    { buf: rB, color: [239, 68, 68], ox: 0 },
    { buf: gB, color: [34, 197, 94], ox: sW + gap },
    { buf: bB, color: [59, 130, 246], ox: 2 * (sW + gap) },
  ];
  for (const { buf, color, ox } of sections) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < sW; x++) {
        const d = buf[y * sW + x] / maxVal;
        if (d > 0) {
          const px = ox + x;
          if (px >= W) continue;
          const idx = (y * W + px) * 4;
          const a = Math.min(255, Math.round(d * 600 * gain));
          out[idx] = color[0]; out[idx + 1] = color[1]; out[idx + 2] = color[2]; out[idx + 3] = a;
        }
      }
    }
  }
}

// ── Waveform ────────────────────────────────────────────────
function renderWaveform(out: Uint8ClampedArray, W: number, H: number,
  mL: Uint8Array, rL: Uint8Array, gL: Uint8Array, bL: Uint8Array, gain: number, colorize: boolean) {
  if (!processedPixels || !imgW || !imgH) return;
  const rB = new Uint16Array(W * H), gB = new Uint16Array(W * H), bB = new Uint16Array(W * H);

  for (let row = 0; row < imgH; row++) {
    for (let col = 0; col < imgW; col++) {
      const i = (row * imgW + col) * 4;
      const [r, g, b] = applyLUT(processedPixels[i], processedPixels[i + 1], processedPixels[i + 2], mL, rL, gL, bL);
      const xBin = Math.floor(col / imgW * W);
      rB[Math.floor((1 - r / 255) * (H - 1)) * W + xBin]++;
      gB[Math.floor((1 - g / 255) * (H - 1)) * W + xBin]++;
      bB[Math.floor((1 - b / 255) * (H - 1)) * W + xBin]++;
    }
  }

  let maxVal = 1;
  for (let i = 0; i < rB.length; i++) maxVal = Math.max(maxVal, rB[i], gB[i], bB[i]);

  const g600 = 600 * gain;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const bi = y * W + x;
      const rd = rB[bi] / maxVal, gd = gB[bi] / maxVal, bd = bB[bi] / maxVal;
      if (rd > 0 || gd > 0 || bd > 0) {
        const idx = bi * 4;
        if (colorize) {
          out[idx] = Math.min(255, Math.round(rd * g600));
          out[idx + 1] = Math.min(255, Math.round(gd * g600));
          out[idx + 2] = Math.min(255, Math.round(bd * g600));
        } else {
          const v = Math.min(255, Math.round(Math.max(rd, gd, bd) * g600));
          out[idx] = v; out[idx + 1] = v; out[idx + 2] = v;
        }
        out[idx + 3] = Math.min(255, Math.round(Math.max(rd, gd, bd) * g600));
      }
    }
  }
}

// ── Vectorscope ─────────────────────────────────────────────
function renderVectorscope(out: Uint8ClampedArray, W: number, H: number,
  mL: Uint8Array, rL: Uint8Array, gL: Uint8Array, bL: Uint8Array, gain: number) {
  if (!processedPixels || !imgW || !imgH) return;
  const cx = W / 2, cy = H / 2, radius = Math.min(cx, cy) - 8;
  const buf = new Uint16Array(W * H);

  for (let pix = 0; pix < imgW * imgH; pix++) {
    const i = pix * 4;
    const [r, g, b] = applyLUT(processedPixels[i], processedPixels[i + 1], processedPixels[i + 2], mL, rL, gL, bL);
    const rf = r / 255, gf = g / 255, bf = b / 255;
    const cb = -0.169 * rf - 0.331 * gf + 0.5 * bf;
    const cr = 0.5 * rf - 0.419 * gf - 0.081 * bf;
    const px = Math.round(cx + cr * radius * 2);
    const py = Math.round(cy - cb * radius * 2);
    if (px >= 0 && px < W && py >= 0 && py < H) buf[py * W + px]++;
  }

  let maxVal = 1;
  for (let i = 0; i < buf.length; i++) maxVal = Math.max(maxVal, buf[i]);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = buf[y * W + x] / maxVal;
      if (d > 0) {
        const idx = (y * W + x) * 4;
        const normX = (x - cx) / radius, normY = (cy - y) / radius;
        const hue = Math.atan2(normY, normX) / (Math.PI * 2) + 0.5;
        const [hr, hg, hb] = hueToRgb(hue);
        const intensity = Math.min(1, d * 8 * gain);
        out[idx] = Math.round(hr * 255 * intensity);
        out[idx + 1] = Math.round(hg * 255 * intensity);
        out[idx + 2] = Math.round(hb * 255 * intensity);
        out[idx + 3] = Math.min(255, Math.round(d * 800 * gain));
      }
    }
  }
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

// ── CIE Chromaticity ────────────────────────────────────────
function renderCIE(out: Uint8ClampedArray, W: number, H: number,
  mL: Uint8Array, rL: Uint8Array, gL: Uint8Array, bL: Uint8Array) {
  if (!processedPixels || !imgW || !imgH) return;
  const sx = (x: number) => Math.round(10 + (x / 0.8) * (W - 20));
  const sy = (y: number) => Math.round(H - 10 - (y / 0.9) * (H - 20));

  const buf = new Uint16Array(W * H);
  for (let pix = 0; pix < imgW * imgH; pix += 3) {
    const i = pix * 4;
    if (i + 2 >= processedPixels.length) break;
    const [r, g, b] = applyLUT(processedPixels[i], processedPixels[i + 1], processedPixels[i + 2], mL, rL, gL, bL);
    const rf = r / 255, gf = g / 255, bf = b / 255;
    const rl = rf <= 0.04045 ? rf / 12.92 : Math.pow((rf + 0.055) / 1.055, 2.4);
    const gl = gf <= 0.04045 ? gf / 12.92 : Math.pow((gf + 0.055) / 1.055, 2.4);
    const bl = bf <= 0.04045 ? bf / 12.92 : Math.pow((bf + 0.055) / 1.055, 2.4);
    const X = 0.4124 * rl + 0.3576 * gl + 0.1805 * bl;
    const Y = 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
    const Z = 0.0193 * rl + 0.1192 * gl + 0.9505 * bl;
    const sum = X + Y + Z;
    if (sum < 0.001) continue;
    const px = sx(X / sum), py = sy(Y / sum);
    if (px >= 0 && px < W && py >= 0 && py < H) buf[py * W + px]++;
  }

  let maxVal = 1;
  for (let i = 0; i < buf.length; i++) maxVal = Math.max(maxVal, buf[i]);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = buf[y * W + x] / maxVal;
      if (d > 0) {
        const idx = (y * W + x) * 4;
        const intensity = Math.min(1, d * 10);
        out[idx] = Math.round(200 * intensity);
        out[idx + 1] = Math.round(220 * intensity);
        out[idx + 2] = Math.round(255 * intensity);
        out[idx + 3] = Math.min(255, Math.round(d * 1000));
      }
    }
  }
}
