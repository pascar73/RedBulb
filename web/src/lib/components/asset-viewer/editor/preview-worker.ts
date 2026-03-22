/**
 * preview-worker.ts — Off-main-thread pixel processing for preview canvas.
 * Handles curves LUT, HSL adjustments, and 3-way color grading.
 * Keeps the main thread free for smooth UI interactions.
 */

export interface PreviewRequest {
  type: 'process';
  pixels: ArrayBuffer;       // RGBA pixel data (Uint8ClampedArray transferred)
  width: number;
  height: number;
  // Curves
  masterLUT: ArrayBuffer;
  redLUT: ArrayBuffer;
  greenLUT: ArrayBuffer;
  blueLUT: ArrayBuffer;
  hasCurves: boolean;
  // HSL
  hsl: Record<string, { h: number; s: number; l: number }>;
  hasHSL: boolean;
  // Color grading
  colorWheels: {
    shadows: { hue: number; sat: number; lum: number };
    midtones: { hue: number; sat: number; lum: number };
    highlights: { hue: number; sat: number; lum: number };
  };
  hasColorGrading: boolean;
}

export interface PreviewResponse {
  type: 'processed';
  pixels: ArrayBuffer;
  width: number;
  height: number;
}

self.onmessage = (e: MessageEvent<PreviewRequest>) => {
  const msg = e.data;
  if (msg.type !== 'process') return;

  const data = new Uint8ClampedArray(msg.pixels);
  const mL = new Uint8Array(msg.masterLUT);
  const rL = new Uint8Array(msg.redLUT);
  const gL = new Uint8Array(msg.greenLUT);
  const bL = new Uint8Array(msg.blueLUT);

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i], g = data[i + 1], b = data[i + 2];

    // Apply curves
    if (msg.hasCurves) {
      r = mL[rL[r]];
      g = mL[gL[g]];
      b = mL[bL[b]];
    }

    // Apply HSL
    if (msg.hasHSL) {
      [r, g, b] = applyHSL(r, g, b, msg.hsl);
    }

    // Apply color grading
    if (msg.hasColorGrading) {
      [r, g, b] = applyColorGrading(r, g, b, msg.colorWheels);
    }

    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }

  const resp: PreviewResponse = {
    type: 'processed',
    pixels: data.buffer,
    width: msg.width,
    height: msg.height,
  };
  (self as unknown as Worker).postMessage(resp, [data.buffer]);
};

// ── HSL processing ──────────────────────────────────────────
function applyHSL(r: number, g: number, b: number, hsl: Record<string, { h: number; s: number; l: number }>): [number, number, number] {
  const rf = r / 255, gf = g / 255, bf = b / 255;
  const max = Math.max(rf, gf, bf), min = Math.min(rf, gf, bf);
  const l = (max + min) / 2;

  if (max === min) return [r, g, b];

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rf) h = ((gf - bf) / d + (gf < bf ? 6 : 0)) / 6;
  else if (max === gf) h = ((bf - rf) / d + 2) / 6;
  else h = ((rf - gf) / d + 4) / 6;

  const channels: Array<{ name: string; center: number; width: number }> = [
    { name: 'red', center: 0, width: 0.083 },
    { name: 'orange', center: 0.083, width: 0.083 },
    { name: 'yellow', center: 0.167, width: 0.083 },
    { name: 'green', center: 0.333, width: 0.083 },
    { name: 'aqua', center: 0.5, width: 0.083 },
    { name: 'blue', center: 0.667, width: 0.083 },
    { name: 'purple', center: 0.75, width: 0.083 },
    { name: 'magenta', center: 0.917, width: 0.083 },
  ];

  let hAdj = 0, sAdj = 0, lAdj = 0;
  for (const ch of channels) {
    let dist = Math.abs(h - ch.center);
    if (dist > 0.5) dist = 1 - dist;
    if (dist < ch.width * 2) {
      const weight = 1 - dist / (ch.width * 2);
      const adj = hsl[ch.name];
      if (!adj) continue;
      hAdj += adj.h * weight * 0.1;
      sAdj += adj.s * weight;
      lAdj += adj.l * weight;
    }
  }

  const newH = (h + hAdj + 1) % 1;
  const newS = Math.max(0, Math.min(1, s * (1 + sAdj)));
  const newL = Math.max(0, Math.min(1, l + lAdj * 0.3));

  return hslToRgb(newH, newS, newL);
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

// ── Color grading ───────────────────────────────────────────
function applyColorGrading(
  r: number, g: number, b: number,
  cw: { shadows: { hue: number; sat: number; lum: number }; midtones: { hue: number; sat: number; lum: number }; highlights: { hue: number; sat: number; lum: number } },
): [number, number, number] {
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  const shadowW = Math.pow(Math.max(0, 1 - lum * 2), 1.5);
  const highlightW = Math.pow(Math.max(0, lum * 2 - 1), 1.5);
  const midtoneW = 1 - shadowW - highlightW;

  let rOut = r, gOut = g, bOut = b;

  const zones: Array<{ w: { hue: number; sat: number; lum: number }; weight: number }> = [
    { w: cw.shadows, weight: shadowW },
    { w: cw.midtones, weight: midtoneW },
    { w: cw.highlights, weight: highlightW },
  ];

  for (const { w, weight } of zones) {
    if (weight <= 0 || (w.hue === 0 && w.sat === 0 && w.lum === 0)) continue;

    if (w.sat > 0) {
      const hRad = w.hue * Math.PI / 180;
      const tintR = Math.cos(hRad) * 0.5 + 0.5;
      const tintG = Math.cos(hRad - 2.094) * 0.5 + 0.5;
      const tintB = Math.cos(hRad + 2.094) * 0.5 + 0.5;
      const strength = w.sat * weight;
      rOut += (tintR * 255 - rOut) * strength * 0.5;
      gOut += (tintG * 255 - gOut) * strength * 0.5;
      bOut += (tintB * 255 - bOut) * strength * 0.5;
    }

    if (w.lum !== 0) {
      const lumShift = w.lum * weight * 60;
      rOut += lumShift;
      gOut += lumShift;
      bOut += lumShift;
    }
  }

  return [
    Math.max(0, Math.min(255, Math.round(rOut))),
    Math.max(0, Math.min(255, Math.round(gOut))),
    Math.max(0, Math.min(255, Math.round(bOut))),
  ];
}
