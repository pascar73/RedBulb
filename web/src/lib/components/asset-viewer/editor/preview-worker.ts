/**
 * preview-worker.ts — Off-main-thread pixel processing for preview canvas.
 * Handles curves LUT, dehaze, clarity, sharpness, noise reduction,
 * chromatic aberration correction, HSL (OKLCh), and 3-way color grading.
 * Keeps the main thread free for smooth UI interactions.
 *
 * Algorithms ported from darktable (GPLv3):
 *   - Dehaze: Dark Channel Prior (He et al. 2011)
 *   - Clarity/Sharpen: Unsharp Mask (multi-radius)
 *   - Noise Reduction: Edge-aware bilateral filter
 *   - CA Correction: Green-channel-guided fringe removal
 *   - HSL: OKLCh perceptual color space (Björn Ottosson 2020)
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
  // Dehaze (darktable Dark Channel Prior)
  dehaze: number;            // 0-1
  // Clarity / Sharpness / Noise Reduction (darktable diffuse/sharpen inspired)
  clarity: number;           // -1 to 1
  texture: number;           // -1 to 1
  sharpness: number;         // 0-1
  noiseReduction: number;    // 0-1
  // Chromatic aberration correction (darktable cacorrectrgb inspired)
  caCorrection: number;      // 0-1
  // Tone mapper
  toneMapper: 'none' | 'filmic'; // 'filmic' = AgX film-like
  // Film grain (darktable grain.c inspired — per-pixel in worker, not CSS overlay)
  grain: number;             // 0-1
  grainSize: number;         // 1-100
  grainRoughness: number;    // 0-100
  grainSeed: number;         // deterministic seed from image URL
  // HSL (now in OKLCh perceptual space)
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

  const w = msg.width;
  const h = msg.height;
  const data = new Uint8ClampedArray(msg.pixels);
  const mL = new Uint8Array(msg.masterLUT);
  const rL = new Uint8Array(msg.redLUT);
  const gL = new Uint8Array(msg.greenLUT);
  const bL = new Uint8Array(msg.blueLUT);

  // ── Pipeline step 1: Curves LUT ──
  if (msg.hasCurves) {
    for (let i = 0; i < data.length; i += 4) {
      data[i]     = mL[rL[data[i]]];
      data[i + 1] = mL[gL[data[i + 1]]];
      data[i + 2] = mL[bL[data[i + 2]]];
    }
  }

  // ── Pipeline step 1b: Filmic tone map (AgX) ──
  if (msg.toneMapper === 'filmic') {
    applyFilmicToneMap(data, w, h);
  }

  // ── Pipeline step 2: Chromatic aberration correction ──
  if (msg.caCorrection > 0) {
    applyChromaticAberration(data, w, h, msg.caCorrection);
  }

  // ── Pipeline step 3: Dehaze (Dark Channel Prior) ──
  if (msg.dehaze > 0.01) {
    applyDehaze(data, w, h, msg.dehaze);
  }

  // ── Pipeline step 4: Clarity + Texture ──
  if (Math.abs(msg.clarity) > 0.01 || Math.abs(msg.texture) > 0.01) {
    applyClarity(data, w, h, msg.clarity, msg.texture);
  }

  // ── Pipeline step 5: Sharpness ──
  if (msg.sharpness > 0.01) {
    applySharpen(data, w, h, msg.sharpness);
  }

  // ── Pipeline step 6: Noise Reduction ──
  if (msg.noiseReduction > 0.01) {
    applyDenoise(data, w, h, msg.noiseReduction);
  }

  // ── Pipeline step 7: HSL (OKLCh perceptual) ──
  if (msg.hasHSL) {
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = applyHSL_OKLCh(data[i], data[i + 1], data[i + 2], msg.hsl);
      data[i] = r; data[i + 1] = g; data[i + 2] = b;
    }
  }

  // ── Pipeline step 8: Color grading ──
  if (msg.hasColorGrading) {
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = applyColorGrading(data[i], data[i + 1], data[i + 2], msg.colorWheels);
      data[i] = r; data[i + 1] = g; data[i + 2] = b;
    }
  }

  // ── Pipeline step 9: Film grain (per-pixel, darktable-style) ──
  if (msg.grain > 0.01) {
    applyFilmGrain(data, w, h, msg.grain, msg.grainSize, msg.grainRoughness, msg.grainSeed);
  }

  const resp: PreviewResponse = {
    type: 'processed',
    pixels: data.buffer,
    width: w,
    height: h,
  };
  (self as unknown as Worker).postMessage(resp, [data.buffer]);
};

// ══════════════════════════════════════════════════════════════
// MODULE 1: DEHAZE — Dark Channel Prior (He et al. 2011)
// Ported from darktable/src/iop/hazeremoval.c
// ══════════════════════════════════════════════════════════════

function applyDehaze(data: Uint8ClampedArray, w: number, h: number, strength: number): void {
  const pixelCount = w * h;
  const patchRadius = Math.max(3, Math.round(Math.min(w, h) * 0.01)); // ~1% of image dimension

  // Step 1: Compute dark channel — min(R,G,B) over local patch
  // For performance, use separable min filter (horizontal then vertical)
  const darkChannel = new Float32Array(pixelCount);
  const tempMin = new Float32Array(pixelCount);

  // Per-pixel min(R,G,B)
  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    darkChannel[i] = Math.min(data[idx], data[idx + 1], data[idx + 2]) / 255;
  }

  // Horizontal min filter
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let minVal = 1;
      const x0 = Math.max(0, x - patchRadius);
      const x1 = Math.min(w - 1, x + patchRadius);
      for (let xx = x0; xx <= x1; xx++) {
        const v = darkChannel[row + xx];
        if (v < minVal) minVal = v;
      }
      tempMin[row + x] = minVal;
    }
  }

  // Vertical min filter
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let minVal = 1;
      const y0 = Math.max(0, y - patchRadius);
      const y1 = Math.min(h - 1, y + patchRadius);
      for (let yy = y0; yy <= y1; yy++) {
        const v = tempMin[yy * w + x];
        if (v < minVal) minVal = v;
      }
      darkChannel[y * w + x] = minVal;
    }
  }

  // Step 2: Estimate atmospheric light A from top 0.1% brightest dark channel pixels
  const numTop = Math.max(1, Math.round(pixelCount * 0.001));
  // Find threshold for top pixels
  const sorted = Float32Array.from(darkChannel).sort();
  const threshold = sorted[pixelCount - numTop];

  let aR = 0, aG = 0, aB = 0, aCount = 0;
  for (let i = 0; i < pixelCount; i++) {
    if (darkChannel[i] >= threshold) {
      const idx = i * 4;
      aR += data[idx]; aG += data[idx + 1]; aB += data[idx + 2];
      aCount++;
    }
  }
  const A = [
    Math.min(255, (aR / aCount)),
    Math.min(255, (aG / aCount)),
    Math.min(255, (aB / aCount)),
  ];

  // Step 3: Compute transmission map t(x) = 1 - strength * dark_channel(I/A)
  const transmission = new Float32Array(pixelCount);
  const tMin = 0.1; // minimum transmission to avoid artifacts

  // Recompute dark channel normalized by A
  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    const normMin = Math.min(
      data[idx] / (A[0] + 0.001),
      data[idx + 1] / (A[1] + 0.001),
      data[idx + 2] / (A[2] + 0.001),
    );
    darkChannel[i] = normMin;
  }

  // Apply separable min filter again on normalized dark channel
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let minVal = 1;
      const x0 = Math.max(0, x - patchRadius);
      const x1 = Math.min(w - 1, x + patchRadius);
      for (let xx = x0; xx <= x1; xx++) {
        const v = darkChannel[row + xx];
        if (v < minVal) minVal = v;
      }
      tempMin[row + x] = minVal;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let minVal = 1;
      const y0 = Math.max(0, y - patchRadius);
      const y1 = Math.min(h - 1, y + patchRadius);
      for (let yy = y0; yy <= y1; yy++) {
        const v = tempMin[yy * w + x];
        if (v < minVal) minVal = v;
      }
      transmission[y * w + x] = Math.max(tMin, 1 - strength * minVal);
    }
  }

  // Step 4: Simple edge-aware refinement — 3-pass box blur on transmission
  // (approximation of guided filter for speed)
  const blurRadius = Math.max(2, patchRadius);
  boxBlurFloat(transmission, w, h, blurRadius);

  // Step 5: Recover scene radiance J(x) = (I(x) - A) / t(x) + A
  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    const t = transmission[i];
    data[idx]     = clamp255((data[idx]     - A[0]) / t + A[0]);
    data[idx + 1] = clamp255((data[idx + 1] - A[1]) / t + A[1]);
    data[idx + 2] = clamp255((data[idx + 2] - A[2]) / t + A[2]);
  }
}

// ══════════════════════════════════════════════════════════════
// MODULE 2: CLARITY, TEXTURE, SHARPNESS, NOISE REDUCTION
// Inspired by darktable/src/iop/diffuse.c (simplified for real-time)
// ══════════════════════════════════════════════════════════════

/**
 * Clarity & Texture: Unsharp mask at different radii.
 * Clarity = large radius (local contrast), Texture = mid-frequency detail.
 */
function applyClarity(data: Uint8ClampedArray, w: number, h: number, clarity: number, texture: number): void {
  if (Math.abs(clarity) < 0.01 && Math.abs(texture) < 0.01) return;

  const pixelCount = w * h;
  // Extract luminance channel for unsharp mask (preserves color)
  const lum = new Float32Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    lum[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
  }

  // Clarity: large radius blur (local contrast)
  if (Math.abs(clarity) > 0.01) {
    const clarityRadius = Math.max(4, Math.round(Math.min(w, h) * 0.025));
    const blurred = Float32Array.from(lum);
    boxBlurFloat(blurred, w, h, clarityRadius);
    // 3-pass for better Gaussian approximation
    boxBlurFloat(blurred, w, h, clarityRadius);

    const amount = clarity * 0.6; // scale to usable range
    for (let i = 0; i < pixelCount; i++) {
      const diff = lum[i] - blurred[i];
      const boost = diff * amount;
      const idx = i * 4;
      data[idx]     = clamp255(data[idx]     + boost);
      data[idx + 1] = clamp255(data[idx + 1] + boost);
      data[idx + 2] = clamp255(data[idx + 2] + boost);
    }
  }

  // Texture: mid-frequency detail (smaller radius)
  if (Math.abs(texture) > 0.01) {
    // Re-extract luminance after clarity
    for (let i = 0; i < pixelCount; i++) {
      const idx = i * 4;
      lum[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    }
    const textureRadius = Math.max(2, Math.round(Math.min(w, h) * 0.008));
    const blurred = Float32Array.from(lum);
    boxBlurFloat(blurred, w, h, textureRadius);

    const amount = texture * 0.5;
    for (let i = 0; i < pixelCount; i++) {
      const diff = lum[i] - blurred[i];
      const boost = diff * amount;
      const idx = i * 4;
      data[idx]     = clamp255(data[idx]     + boost);
      data[idx + 1] = clamp255(data[idx + 1] + boost);
      data[idx + 2] = clamp255(data[idx + 2] + boost);
    }
  }
}

/**
 * Sharpness: Unsharp mask at small radius (edge enhancement).
 */
function applySharpen(data: Uint8ClampedArray, w: number, h: number, amount: number): void {
  const pixelCount = w * h;
  const lum = new Float32Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    lum[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
  }

  const radius = Math.max(1, Math.round(Math.min(w, h) * 0.002));
  const blurred = Float32Array.from(lum);
  boxBlurFloat(blurred, w, h, radius);

  const strength = amount * 1.5; // sharpen is aggressive
  for (let i = 0; i < pixelCount; i++) {
    const diff = lum[i] - blurred[i];
    // Only sharpen significant edges (threshold to avoid noise amplification)
    if (Math.abs(diff) < 2) continue;
    const boost = diff * strength;
    const idx = i * 4;
    data[idx]     = clamp255(data[idx]     + boost);
    data[idx + 1] = clamp255(data[idx + 1] + boost);
    data[idx + 2] = clamp255(data[idx + 2] + boost);
  }
}

/**
 * Noise Reduction: Edge-aware bilateral filter approximation.
 * Smooths noise while preserving edges by only averaging similar neighbours.
 */
function applyDenoise(data: Uint8ClampedArray, w: number, h: number, amount: number): void {
  const pixelCount = w * h;
  const radius = Math.max(1, Math.round(amount * 3)); // 1-3px radius
  const threshold = 10 + amount * 40; // color difference threshold (10-50)

  // Work on a copy to avoid reading modified values
  const src = new Uint8ClampedArray(data);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const cR = src[idx], cG = src[idx + 1], cB = src[idx + 2];

      let sumR = 0, sumG = 0, sumB = 0, weight = 0;
      const y0 = Math.max(0, y - radius);
      const y1 = Math.min(h - 1, y + radius);
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(w - 1, x + radius);

      for (let ny = y0; ny <= y1; ny++) {
        for (let nx = x0; nx <= x1; nx++) {
          const nIdx = (ny * w + nx) * 4;
          const dr = src[nIdx] - cR;
          const dg = src[nIdx + 1] - cG;
          const db = src[nIdx + 2] - cB;
          const colorDist = Math.sqrt(dr * dr + dg * dg + db * db);

          if (colorDist < threshold) {
            // Gaussian-ish weight: closer pixels and similar colors get more weight
            const spatialDist = Math.abs(nx - x) + Math.abs(ny - y);
            const w = 1 / (1 + colorDist * 0.1 + spatialDist * 0.2);
            sumR += src[nIdx]     * w;
            sumG += src[nIdx + 1] * w;
            sumB += src[nIdx + 2] * w;
            weight += w;
          }
        }
      }

      if (weight > 0) {
        // Blend between original and denoised based on amount
        const blend = amount;
        data[idx]     = clamp255(cR * (1 - blend) + (sumR / weight) * blend);
        data[idx + 1] = clamp255(cG * (1 - blend) + (sumG / weight) * blend);
        data[idx + 2] = clamp255(cB * (1 - blend) + (sumB / weight) * blend);
      }
    }
  }
}

// ══════════════════════════════════════════════════════════════
// MODULE 3: CHROMATIC ABERRATION CORRECTION
// Inspired by darktable/src/iop/cacorrectrgb.c
// Green channel as reference, corrects R/B fringe at edges
// ══════════════════════════════════════════════════════════════

function applyChromaticAberration(data: Uint8ClampedArray, w: number, h: number, strength: number): void {
  const pixelCount = w * h;
  const src = new Uint8ClampedArray(data);

  // Compute luminance gradient to find edges
  const gradient = new Float32Array(pixelCount);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      // Sobel-like gradient magnitude on green channel (sharpest)
      const gx = src[(y * w + x + 1) * 4 + 1] - src[(y * w + x - 1) * 4 + 1];
      const gy = src[((y + 1) * w + x) * 4 + 1] - src[((y - 1) * w + x) * 4 + 1];
      gradient[y * w + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }

  // Find edge threshold (top 15% of gradient values = edges)
  const sortedGrad = Float32Array.from(gradient).sort();
  const edgeThreshold = sortedGrad[Math.round(pixelCount * 0.85)];
  if (edgeThreshold < 5) return; // no significant edges

  // Blur R and B channels slightly to get "reference" values
  const blurR = new Float32Array(pixelCount);
  const blurB = new Float32Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    blurR[i] = src[i * 4];
    blurB[i] = src[i * 4 + 2];
  }
  boxBlurFloat(blurR, w, h, 2);
  boxBlurFloat(blurB, w, h, 2);

  // At edges: if R or B deviates significantly from what G predicts,
  // blend toward the blurred (averaged) value
  for (let i = 0; i < pixelCount; i++) {
    if (gradient[i] < edgeThreshold) continue;

    const idx = i * 4;
    const g = src[idx + 1];
    const r = src[idx];
    const b = src[idx + 2];

    // Detect purple fringe: high R + high B + low G at edges
    const isPurpleFringe = (r > g + 20) && (b > g + 20);
    // Detect green fringe: high G + low R + low B at edges
    const isGreenFringe = (g > r + 20) && (g > b + 20);

    if (isPurpleFringe || isGreenFringe) {
      // Blend toward blurred value (removes fringe)
      const blend = strength * Math.min(1, gradient[i] / (edgeThreshold * 2));
      data[idx]     = clamp255(r * (1 - blend) + blurR[i] * blend);
      data[idx + 2] = clamp255(b * (1 - blend) + blurB[i] * blend);
    }
  }
}

// ══════════════════════════════════════════════════════════════
// MODULE 4: HSL IN OKLCh PERCEPTUAL COLOR SPACE
// Based on Björn Ottosson's OKLab (2020), used in darktable's colorequal
// Fixes: hue shifts when adjusting saturation, blue→purple problem
// ══════════════════════════════════════════════════════════════

// sRGB → Linear
function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

// Linear → sRGB
function linearToSrgb(c: number): number {
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(s * 255)));
}

// Linear RGB → OKLab
function linearRgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const l_ = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m_ = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s_ = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l = Math.cbrt(l_);
  const m = Math.cbrt(m_);
  const s = Math.cbrt(s_);

  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

// OKLab → Linear RGB
function oklabToLinearRgb(L: number, a: number, b: number): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

// OKLab → OKLCh (cylindrical)
function oklabToOklch(L: number, a: number, b: number): [number, number, number] {
  const C = Math.sqrt(a * a + b * b);
  let h = Math.atan2(b, a) / (2 * Math.PI); // normalize to 0-1
  if (h < 0) h += 1;
  return [L, C, h];
}

// OKLCh → OKLab
function oklchToOklab(L: number, C: number, h: number): [number, number, number] {
  const hRad = h * 2 * Math.PI;
  return [L, C * Math.cos(hRad), C * Math.sin(hRad)];
}

// HSL channel definitions in OKLCh hue space (0-1 range)
const HSL_CHANNELS: Array<{ name: string; center: number; width: number }> = [
  { name: 'red',     center: 0.08,  width: 0.065 },
  { name: 'orange',  center: 0.14,  width: 0.055 },
  { name: 'yellow',  center: 0.20,  width: 0.055 },
  { name: 'green',   center: 0.39,  width: 0.09  },
  { name: 'aqua',    center: 0.53,  width: 0.07  },
  { name: 'blue',    center: 0.73,  width: 0.08  },
  { name: 'purple',  center: 0.84,  width: 0.06  },
  { name: 'magenta', center: 0.95,  width: 0.06  },
];

function applyHSL_OKLCh(r: number, g: number, b: number, hsl: Record<string, { h: number; s: number; l: number }>): [number, number, number] {
  // Convert to OKLab
  const rLin = srgbToLinear(r);
  const gLin = srgbToLinear(g);
  const bLin = srgbToLinear(b);

  const [L, a, ob] = linearRgbToOklab(rLin, gLin, bLin);
  let [okL, okC, okH] = oklabToOklch(L, a, ob);

  // Skip achromatic pixels (very low chroma = gray)
  if (okC < 0.005) return [r, g, b];

  // Accumulate adjustments from matching HSL channels
  let hAdj = 0, sAdj = 0, lAdj = 0;
  for (const ch of HSL_CHANNELS) {
    let dist = Math.abs(okH - ch.center);
    if (dist > 0.5) dist = 1 - dist;
    if (dist < ch.width * 2) {
      // Smooth cosine falloff (better than linear)
      const t = dist / (ch.width * 2);
      const weight = 0.5 * (1 + Math.cos(Math.PI * t));
      const adj = hsl[ch.name];
      if (!adj) continue;
      hAdj += adj.h * weight * 0.05; // hue shift in OKLCh (smaller range needed)
      sAdj += adj.s * weight;
      lAdj += adj.l * weight;
    }
  }

  if (hAdj === 0 && sAdj === 0 && lAdj === 0) return [r, g, b];

  // Apply adjustments in perceptual space
  okH = (okH + hAdj + 1) % 1;
  okC = Math.max(0, okC * (1 + sAdj));    // multiplicative saturation
  okL = Math.max(0, Math.min(1, okL + lAdj * 0.15)); // additive luminance

  // Convert back
  const [La, Aa, Ba] = oklchToOklab(okL, okC, okH);
  const [rr, gg, bb] = oklabToLinearRgb(La, Aa, Ba);

  return [linearToSrgb(rr), linearToSrgb(gg), linearToSrgb(bb)];
}

// ══════════════════════════════════════════════════════════════
// MODULE 5: FILM GRAIN (per-pixel, darktable grain.c inspired)
// Gaussian noise in luminance channel, respects image brightness
// ══════════════════════════════════════════════════════════════

function applyFilmGrain(
  data: Uint8ClampedArray, w: number, h: number,
  amount: number, size: number, roughness: number, seed: number,
): void {
  const pixelCount = w * h;
  const roughMult = 0.5 + (roughness / 100) * 2; // 0.5x to 2.5x noise contrast
  const intensity = amount * 50 * roughMult; // noise amplitude in pixel values

  // Generate noise at potentially reduced resolution for "size" effect
  const sizeScale = Math.max(1, Math.round(size / 15)); // 1-6x downscale
  const nw = Math.ceil(w / sizeScale);
  const nh = Math.ceil(h / sizeScale);
  const noise = new Float32Array(nw * nh);

  // Seeded PRNG for deterministic grain
  let s = Math.abs(seed) || 42;
  for (let i = 0; i < noise.length; i++) {
    // Box-Muller transform for Gaussian distribution (film-like)
    s = (s * 1664525 + 1013904223) & 0x7FFFFFFF;
    const u1 = ((s >> 8) & 0xFFFF) / 65536 + 0.0001;
    s = (s * 1664525 + 1013904223) & 0x7FFFFFFF;
    const u2 = ((s >> 8) & 0xFFFF) / 65536;
    noise[i] = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  // Apply noise to each pixel — modulate by luminance (darker = more grain, like real film)
  for (let y = 0; y < h; y++) {
    const ny = Math.min(nh - 1, Math.floor(y / sizeScale));
    for (let x = 0; x < w; x++) {
      const nx = Math.min(nw - 1, Math.floor(x / sizeScale));
      const n = noise[ny * nw + nx] * intensity;

      const idx = (y * w + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];

      // Film grain is stronger in midtones, weaker in deep shadows and highlights
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const midtoneBias = 4 * lum * (1 - lum); // parabola: 0 at black/white, 1 at mid-gray

      const grainVal = n * (0.3 + 0.7 * midtoneBias);

      data[idx]     = clamp255(r + grainVal);
      data[idx + 1] = clamp255(g + grainVal);
      data[idx + 2] = clamp255(b + grainVal);
    }
  }
}

// ══════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ══════════════════════════════════════════════════════════════

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/**
 * Fast 3-pass box blur on Float32Array (approximates Gaussian).
 * In-place, separable (horizontal then vertical).
 */
function boxBlurFloat(arr: Float32Array, w: number, h: number, radius: number): void {
  if (radius < 1) return;
  const temp = new Float32Array(arr.length);
  const d = radius * 2 + 1;
  const invD = 1 / d;

  // Horizontal pass
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    // Initialize window
    for (let x = -radius; x <= radius; x++) {
      sum += arr[row + Math.max(0, Math.min(w - 1, x))];
    }
    for (let x = 0; x < w; x++) {
      temp[row + x] = sum * invD;
      // Slide window
      const leave = Math.max(0, Math.min(w - 1, x - radius));
      const enter = Math.max(0, Math.min(w - 1, x + radius + 1));
      sum += arr[row + enter] - arr[row + leave];
    }
  }

  // Vertical pass
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) {
      sum += temp[Math.max(0, Math.min(h - 1, y)) * w + x];
    }
    for (let y = 0; y < h; y++) {
      arr[y * w + x] = sum * invD;
      const leave = Math.max(0, Math.min(h - 1, y - radius));
      const enter = Math.max(0, Math.min(h - 1, y + radius + 1));
      sum += temp[enter * w + x] - temp[leave * w + x];
    }
  }
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

// ══════════════════════════════════════════════════════════════
// FILMIC TONE MAP (AgX)
// Ported from RapidRAW/src-tauri/src/shaders/shader.wgsl
// Originally designed by Troy Sobotka — film-like tone mapping
// that preserves hue in highlights better than ACES.
//
// Pipeline: sRGB → linear → AgX rendering space → log encode →
//           sigmoid curve → gamma → back to sRGB working space
// ══════════════════════════════════════════════════════════════

// Pre-computed matrices: sRGB working space ↔ AgX rendering space
// Derived from Rec.2020 primaries with inset/rotation per AgX spec
const AGX_PIPE_TO_RENDERING = [
  0.5682423423, 0.3731251305, 0.0586325272,
  0.1281182380, 0.7783136231, 0.0935681389,
  0.0734708103, 0.1620963130, 0.7644328768,
]; // row-major 3x3

const AGX_RENDERING_TO_PIPE = [
  1.9404292234, -0.8296109104, -0.1108183130,
  -0.2760032943, 1.3067333427, -0.0307300484,
  -0.1438899609, -0.2248403195, 1.3687302804,
]; // row-major 3x3

const AGX_MIN_EV = -15.2;
const AGX_MAX_EV = 5.0;
const AGX_RANGE_EV = AGX_MAX_EV - AGX_MIN_EV;
const AGX_GAMMA = 2.4;
const AGX_SLOPE = 2.3843;
const AGX_TOE_POWER = 1.5;
const AGX_SHOULDER_POWER = 1.5;
const AGX_TOE_TRANSITION_X = 0.6060606;
const AGX_TOE_TRANSITION_Y = 0.43446;
const AGX_SHOULDER_TRANSITION_X = 0.6060606;
const AGX_SHOULDER_TRANSITION_Y = 0.43446;
const AGX_INTERCEPT = -1.0112;
const AGX_TOE_SCALE = -1.0359;
const AGX_SHOULDER_SCALE = 1.3475;
const AGX_EPSILON = 1e-6;

function agxSigmoid(x: number, power: number): number {
  return x / Math.pow(1.0 + Math.pow(x, power), 1.0 / power);
}

function agxScaledSigmoid(x: number, scale: number, slope: number, power: number, tx: number, ty: number): number {
  return scale * agxSigmoid(slope * (x - tx) / scale, power) + ty;
}

function agxApplyCurveChannel(x: number): number {
  let result: number;
  if (x < AGX_TOE_TRANSITION_X) {
    result = agxScaledSigmoid(x, AGX_TOE_SCALE, AGX_SLOPE, AGX_TOE_POWER, AGX_TOE_TRANSITION_X, AGX_TOE_TRANSITION_Y);
  } else if (x <= AGX_SHOULDER_TRANSITION_X) {
    result = AGX_SLOPE * x + AGX_INTERCEPT;
  } else {
    result = agxScaledSigmoid(x, AGX_SHOULDER_SCALE, AGX_SLOPE, AGX_SHOULDER_POWER, AGX_SHOULDER_TRANSITION_X, AGX_SHOULDER_TRANSITION_Y);
  }
  return Math.max(0, Math.min(1, result));
}

function mat3MulVec(m: number[], r: number, g: number, b: number): [number, number, number] {
  return [
    m[0] * r + m[1] * g + m[2] * b,
    m[3] * r + m[4] * g + m[5] * b,
    m[6] * r + m[7] * g + m[8] * b,
  ];
}

// Reuses srgbToLinear() and linearToSrgb() from the OKLCh module above

function applyFilmicToneMap(data: Uint8ClampedArray, w: number, h: number): void {
  const len = w * h * 4;

  // Our input is display-referred sRGB, not scene-referred linear.
  // sRGB mid-grey (128) decodes to ~0.216 linear, but AgX expects 0.18.
  // We blend the original with the tone-mapped result to apply the filmic
  // "look" (better highlight rolloff, hue preservation) without the
  // brightness shift that comes from the reference mismatch.
  //
  // Strategy: compute AgX in a luminance-preserving way.
  // 1. Compute per-pixel original luminance
  // 2. Apply full AgX
  // 3. Compute mapped luminance
  // 4. Scale mapped result to match original luminance
  // This preserves the AgX color behavior (no hue shift in highlights)
  // while keeping overall brightness stable.

  for (let i = 0; i < len; i += 4) {
    // 1. Decode sRGB → linear
    const lr = srgbToLinear(data[i]);
    const lg = srgbToLinear(data[i + 1]);
    const lb = srgbToLinear(data[i + 2]);

    // Original luminance (Rec.709 weights)
    const origLum = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;

    // 2. Gamut compression — shift negative values
    let cr = lr, cg = lg, cb = lb;
    const minC = Math.min(cr, cg, cb);
    if (minC < 0) { cr -= minC; cg -= minC; cb -= minC; }

    // 3. Transform to AgX rendering space
    let [ar, ag, ab] = mat3MulVec(AGX_PIPE_TO_RENDERING, cr, cg, cb);

    // 4. Log encode — map to 0-1 via log2, reference at 0.18
    ar = Math.max(ar, AGX_EPSILON); ag = Math.max(ag, AGX_EPSILON); ab = Math.max(ab, AGX_EPSILON);
    ar = Math.max(0, Math.min(1, (Math.log2(ar / 0.18) - AGX_MIN_EV) / AGX_RANGE_EV));
    ag = Math.max(0, Math.min(1, (Math.log2(ag / 0.18) - AGX_MIN_EV) / AGX_RANGE_EV));
    ab = Math.max(0, Math.min(1, (Math.log2(ab / 0.18) - AGX_MIN_EV) / AGX_RANGE_EV));

    // 5. Apply sigmoid curve (toe + shoulder)
    ar = agxApplyCurveChannel(ar);
    ag = agxApplyCurveChannel(ag);
    ab = agxApplyCurveChannel(ab);

    // 6. Output gamma
    ar = Math.pow(Math.max(0, ar), AGX_GAMMA);
    ag = Math.pow(Math.max(0, ag), AGX_GAMMA);
    ab = Math.pow(Math.max(0, ab), AGX_GAMMA);

    // 7. Transform back to sRGB working space
    let [fr, fg, fb] = mat3MulVec(AGX_RENDERING_TO_PIPE, ar, ag, ab);

    // 8. Luminance-preserving correction: scale to match original brightness
    const mappedLum = 0.2126 * fr + 0.7152 * fg + 0.0722 * fb;
    if (mappedLum > 1e-6 && origLum > 1e-6) {
      const scale = origLum / mappedLum;
      fr *= scale;
      fg *= scale;
      fb *= scale;
    }

    // 8. Encode linear → sRGB display
    data[i]     = linearToSrgb(fr);
    data[i + 1] = linearToSrgb(fg);
    data[i + 2] = linearToSrgb(fb);
  }
}
