/**
 * export-worker.ts — Full-resolution export processing pipeline.
 *
 * Based on RapidRAW's WGSL shader pipeline (proven Lightroom-quality processing order)
 * combined with darktable's algorithms (dehaze, OKLCh HSL, bilateral NR).
 *
 * KEY DIFFERENCES from preview-worker.ts:
 * 1. Works in LINEAR LIGHT space (sRGB→linear before processing, linear→sRGB after)
 * 2. Uses pre-computed blur textures for tonal adjustments (like Lightroom/RapidRAW)
 * 3. Full-res — no scale limits
 * 4. Proper processing order (RapidRAW pipeline):
 *    CA → Linear → NR → Dehaze → Local Contrast → Exposure → Tonals → HSL →
 *    ColorGrade → Saturation → ToneMap → Curves → Grain → Vignette → Dither → sRGB
 * 5. Dithering on output (anti-banding)
 */

export interface ExportWorkerRequest {
  type: 'export';
  pixels: ArrayBuffer;       // RGBA sRGB pixel data
  width: number;
  height: number;
  // Curves LUTs (pre-built)
  masterLUT: ArrayBuffer;
  redLUT: ArrayBuffer;
  greenLUT: ArrayBuffer;
  blueLUT: ArrayBuffer;
  hasCurves: boolean;
  // All adjustments
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  brightness: number;
  saturation: number;
  temperature: number;
  tint: number;
  vibrance: number;
  texture: number;
  dehaze: number;
  clarity: number;
  sharpness: number;
  noiseReduction: number;
  caCorrection: number;
  toneMapper: 'none' | 'filmic';
  grain: number;
  grainSize: number;
  grainRoughness: number;
  grainSeed: number;
  fade: number;
  // HSL + color grading
  hsl: Record<string, { h: number; s: number; l: number }>;
  hasHSL: boolean;
  colorWheels: {
    shadows: { hue: number; sat: number; lum: number };
    midtones: { hue: number; sat: number; lum: number };
    highlights: { hue: number; sat: number; lum: number };
  };
  hasColorGrading: boolean;
  // Vignette
  vignette: number;
  vignetteMidpoint: number;
  vignetteRoundness: number;
  vignetteFeather: number;
}

export interface ExportWorkerResponse {
  type: 'exported';
  pixels: ArrayBuffer;
  width: number;
  height: number;
  stage?: string;
}

// ═══════════════════════════════════════════════════════════════
// COLOR SPACE CONVERSION (sRGB ↔ Linear)
// ═══════════════════════════════════════════════════════════════

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(255, s * 255)));
}

// ═══════════════════════════════════════════════════════════════
// GAUSSIAN BLUR (for tonal/clarity/sharpness reference textures)
// RapidRAW uses 4 blur levels: sharpness (small), tonal (medium),
// clarity (large), structure (very large)
// ═══════════════════════════════════════════════════════════════

function gaussianBlurF32(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  const dst = new Float32Array(src.length);
  const temp = new Float32Array(src.length);
  const r = Math.max(1, Math.round(radius));

  // Horizontal pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0, count = 0;
      for (let dx = -r; dx <= r; dx++) {
        const sx = Math.min(w - 1, Math.max(0, x + dx));
        sum += src[y * w + sx];
        count++;
      }
      temp[y * w + x] = sum / count;
    }
  }

  // Vertical pass
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let sum = 0, count = 0;
      for (let dy = -r; dy <= r; dy++) {
        const sy = Math.min(h - 1, Math.max(0, y + dy));
        sum += temp[sy * w + x];
        count++;
      }
      dst[y * w + x] = sum / count;
    }
  }

  return dst;
}

/** Extract luminance channel from linear RGB float buffer */
function extractLuminance(linear: Float32Array, w: number, h: number): Float32Array {
  const luma = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const idx = i * 3;
    luma[i] = 0.2126 * linear[idx] + 0.7152 * linear[idx + 1] + 0.0722 * linear[idx + 2];
  }
  return luma;
}


// ═══════════════════════════════════════════════════════════════
// OKLab / OKLCh COLOR SPACE (perceptual, for HSL adjustments)
// ═══════════════════════════════════════════════════════════════

function linearRgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const l_ = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m_ = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s_ = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l = Math.cbrt(l_); const m = Math.cbrt(m_); const s = Math.cbrt(s_);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

function oklabToLinearRgb(L: number, a: number, b: number): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_; const m = m_ * m_ * m_; const s = s_ * s_ * s_;
  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}


// ═══════════════════════════════════════════════════════════════
// AgX TONE MAPPING (ported from RapidRAW)
// ═══════════════════════════════════════════════════════════════

const AGX_MIN_EV = -15.2;
const AGX_MAX_EV = 5.0;
const AGX_SLOPE = 2.3843;
const AGX_TOE_POWER = 1.5;
const AGX_SHOULDER_POWER = 1.5;

const AGX_PIPE_TO_RENDERING = [
  0.5682423423, 0.3731251305, 0.0586325272,
  0.1281182380, 0.7783136231, 0.0935681389,
  0.0734708103, 0.1620963130, 0.7644328768,
];
const AGX_RENDERING_TO_PIPE = [
  1.9404292234, -0.8296109104, -0.1108183130,
  -0.2760032943, 1.3067333427, -0.0307300484,
  -0.1438899609, -0.2248403195, 1.3687302804,
];

function mat3MulVec(m: number[], r: number, g: number, b: number): [number, number, number] {
  return [
    m[0] * r + m[1] * g + m[2] * b,
    m[3] * r + m[4] * g + m[5] * b,
    m[6] * r + m[7] * g + m[8] * b,
  ];
}

function agxSigmoid(x: number, power: number): number {
  const xp = Math.pow(x, power);
  return xp / (xp + Math.pow(1 - x, power));
}

function agxApplyCurveChannel(x: number): number {
  const pivot = Math.log2(0.18);
  const minEv = AGX_MIN_EV, maxEv = AGX_MAX_EV;
  const logVal = Math.max(minEv, Math.min(maxEv, Math.log2(Math.max(x, 1e-10))));
  let t = (logVal - minEv) / (maxEv - minEv);
  const transitionX = (pivot - minEv) / (maxEv - minEv);
  const transitionY = agxSigmoid(transitionX, AGX_TOE_POWER);
  if (t < transitionX) {
    t = agxSigmoid(t, AGX_TOE_POWER);
  } else {
    const remapped = (t - transitionX) / (1 - transitionX);
    t = transitionY + (1 - transitionY) * agxSigmoid(remapped, AGX_SHOULDER_POWER);
  }
  return t * AGX_SLOPE;
}

function agxToneMap(r: number, g: number, b: number): [number, number, number] {
  // Original luminance
  const origLuma = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  // Transform to AgX rendering space
  let [ar, ag, ab] = mat3MulVec(AGX_PIPE_TO_RENDERING, r, g, b);

  // Apply S-curve per channel
  ar = agxApplyCurveChannel(Math.max(ar, 0));
  ag = agxApplyCurveChannel(Math.max(ag, 0));
  ab = agxApplyCurveChannel(Math.max(ab, 0));

  // Transform back
  let [fr, fg, fb] = mat3MulVec(AGX_RENDERING_TO_PIPE, ar, ag, ab);

  // Luminance preservation
  const mappedLuma = 0.2126 * fr + 0.7152 * fg + 0.0722 * fb;
  if (mappedLuma > 1e-6 && origLuma > 1e-6) {
    const targetLuma = agxApplyCurveChannel(origLuma);
    const ratio = targetLuma / mappedLuma;
    fr *= ratio; fg *= ratio; fb *= ratio;
  }

  return [Math.max(0, fr), Math.max(0, fg), Math.max(0, fb)];
}


// ═══════════════════════════════════════════════════════════════
// FILM GRAIN (RapidRAW-style gradient noise)
// ═══════════════════════════════════════════════════════════════

function hashF(x: number, y: number): number {
  let h = (x * 127.1 + y * 311.7) * 43758.5453;
  h = h - Math.floor(h);
  return h * 2 - 1;
}

function gradientNoise(px: number, py: number): number {
  const ix = Math.floor(px), iy = Math.floor(py);
  const fx = px - ix, fy = py - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);

  const n00 = hashF(ix, iy) * fx + hashF(ix + 0.1, iy) * fy;
  const n10 = hashF(ix + 1, iy) * (fx - 1) + hashF(ix + 1.1, iy) * fy;
  const n01 = hashF(ix, iy + 1) * fx + hashF(ix + 0.1, iy + 1) * (fy - 1);
  const n11 = hashF(ix + 1, iy + 1) * (fx - 1) + hashF(ix + 1.1, iy + 1) * (fy - 1);

  return (n00 * (1 - ux) + n10 * ux) * (1 - uy) + (n01 * (1 - ux) + n11 * ux) * uy;
}


// ═══════════════════════════════════════════════════════════════
// MAIN EXPORT PIPELINE (RapidRAW processing order)
// ═══════════════════════════════════════════════════════════════

self.onmessage = (e: MessageEvent<ExportWorkerRequest>) => {
  const msg = e.data;
  if (msg.type !== 'export') return;

  const w = msg.width;
  const h = msg.height;
  const srgbData = new Uint8ClampedArray(msg.pixels);
  const pixelCount = w * h;

  // Reference dimension for scale-aware processing (RapidRAW normalizes to 1080p)
  const refDim = 1080;
  const scale = Math.max(0.1, Math.min(w, h) / refDim);

  // ── Step 0: Convert sRGB → Linear Float32 (RGB, no alpha) ──
  const linear = new Float32Array(pixelCount * 3);
  const alpha = new Uint8Array(pixelCount); // preserve alpha
  for (let i = 0; i < pixelCount; i++) {
    const si = i * 4;
    const di = i * 3;
    linear[di]     = srgbToLinear(srgbData[si]);
    linear[di + 1] = srgbToLinear(srgbData[si + 1]);
    linear[di + 2] = srgbToLinear(srgbData[si + 2]);
    alpha[i] = srgbData[si + 3];
  }

  // ── Step 1: Pre-compute blur textures (RapidRAW uses 4 levels) ──
  // We compute 2: tonal blur (for shadows/highlights) and detail blur (for clarity/sharpness)
  const luma = extractLuminance(linear, w, h);
  const tonalBlurRadius = Math.round(32 * scale); // medium blur for tonal adjustments
  const detailBlurRadius = Math.round(8 * scale); // small blur for sharpness/clarity

  let tonalBlur: Float32Array | null = null;
  let detailBlur: Float32Array | null = null;

  if (msg.highlights !== 0 || msg.shadows !== 0 || msg.whites !== 0 || msg.blacks !== 0) {
    tonalBlur = gaussianBlurF32(luma, w, h, tonalBlurRadius);
  }
  if (msg.sharpness > 0.01 || Math.abs(msg.clarity) > 0.01 || Math.abs(msg.texture) > 0.01) {
    detailBlur = gaussianBlurF32(luma, w, h, detailBlurRadius);
  }

  // ── Step 2: Chromatic Aberration correction (before other processing) ──
  if (msg.caCorrection > 0) {
    // Shift red and blue channels relative to green
    const strength = msg.caCorrection * 2;
    const tempR = new Float32Array(pixelCount);
    const tempB = new Float32Array(pixelCount);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = (x - w / 2) / (w / 2);
        const dy = (y - h / 2) / (h / 2);
        const r2 = dx * dx + dy * dy;
        const shift = r2 * strength;

        // Red: shift outward
        const rsx = Math.round(x + dx * shift);
        const rsy = Math.round(y + dy * shift);
        if (rsx >= 0 && rsx < w && rsy >= 0 && rsy < h) {
          tempR[y * w + x] = linear[(rsy * w + rsx) * 3];
        } else {
          tempR[y * w + x] = linear[(y * w + x) * 3];
        }

        // Blue: shift outward (opposite direction from red for TCA)
        const bsx = Math.round(x - dx * shift * 0.5);
        const bsy = Math.round(y - dy * shift * 0.5);
        if (bsx >= 0 && bsx < w && bsy >= 0 && bsy < h) {
          tempB[y * w + x] = linear[(bsy * w + bsx) * 3 + 2];
        } else {
          tempB[y * w + x] = linear[(y * w + x) * 3 + 2];
        }
      }
    }
    // Apply shifted channels
    for (let i = 0; i < pixelCount; i++) {
      linear[i * 3] = tempR[i];
      linear[i * 3 + 2] = tempB[i];
    }
  }

  // ── Step 3: Noise Reduction (before other processing — RapidRAW order) ──
  if (msg.noiseReduction > 0.01) {
    // Edge-aware bilateral filter in linear space
    const nr = msg.noiseReduction;
    const radius = Math.max(1, Math.round(3 * scale));
    const sigmaS = radius * 0.5;
    const sigmaR = nr * 0.15;

    const result = new Float32Array(linear.length);
    result.set(linear);

    for (let y = radius; y < h - radius; y++) {
      for (let x = radius; x < w - radius; x++) {
        const ci = (y * w + x) * 3;
        let sumR = 0, sumG = 0, sumB = 0, wSum = 0;

        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const ni = ((y + dy) * w + (x + dx)) * 3;
            const spatialW = Math.exp(-(dx * dx + dy * dy) / (2 * sigmaS * sigmaS));
            const dr = linear[ci] - linear[ni];
            const dg = linear[ci + 1] - linear[ni + 1];
            const db = linear[ci + 2] - linear[ni + 2];
            const rangeW = Math.exp(-(dr * dr + dg * dg + db * db) / (2 * sigmaR * sigmaR));
            const weight = spatialW * rangeW;
            sumR += linear[ni] * weight;
            sumG += linear[ni + 1] * weight;
            sumB += linear[ni + 2] * weight;
            wSum += weight;
          }
        }

        if (wSum > 0) {
          result[ci] = sumR / wSum;
          result[ci + 1] = sumG / wSum;
          result[ci + 2] = sumB / wSum;
        }
      }
    }
    linear.set(result);
  }

  // ── Step 4: Dehaze (Dark Channel Prior in linear space) ──
  if (msg.dehaze > 0.01) {
    const strength = msg.dehaze;
    // Simplified DCP: estimate atmospheric light from darkest regions
    const patchSize = Math.max(3, Math.round(7 * scale));
    const darkChannel = new Float32Array(pixelCount);

    // Build dark channel
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let minVal = 1;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ny = Math.min(h - 1, Math.max(0, y + dy));
            const nx = Math.min(w - 1, Math.max(0, x + dx));
            const idx = (ny * w + nx) * 3;
            minVal = Math.min(minVal, linear[idx], linear[idx + 1], linear[idx + 2]);
          }
        }
        darkChannel[y * w + x] = minVal;
      }
    }

    // Estimate atmospheric light (brightest 0.1% of dark channel)
    const sorted = Array.from(darkChannel).sort((a, b) => b - a);
    const topIdx = Math.max(1, Math.floor(pixelCount * 0.001));
    const atmLight = Math.min(1, sorted[topIdx]);

    // Recover scene radiance
    for (let i = 0; i < pixelCount; i++) {
      const t = Math.max(0.1, 1 - strength * darkChannel[i] / Math.max(atmLight, 0.01));
      const idx = i * 3;
      linear[idx] = (linear[idx] - atmLight * (1 - t)) / t;
      linear[idx + 1] = (linear[idx + 1] - atmLight * (1 - t)) / t;
      linear[idx + 2] = (linear[idx + 2] - atmLight * (1 - t)) / t;
    }
  }

  // ── Step 5: Local Contrast (Sharpness + Clarity + Texture) ──
  // RapidRAW approach: unsharp mask = original - blurred, then add/subtract
  if (detailBlur) {
    for (let i = 0; i < pixelCount; i++) {
      const idx = i * 3;
      const l = luma[i];
      const bl = detailBlur[i];
      const detail = l - bl; // high-frequency component

      // Sharpness: add detail back (like RapidRAW's apply_local_contrast)
      if (msg.sharpness > 0.01) {
        const sharpAmount = detail * msg.sharpness * 2;
        linear[idx] += sharpAmount;
        linear[idx + 1] += sharpAmount;
        linear[idx + 2] += sharpAmount;
      }

      // Clarity: boost mid-frequency contrast
      if (Math.abs(msg.clarity) > 0.01) {
        const clarityAmount = detail * msg.clarity * 1.5;
        linear[idx] += clarityAmount;
        linear[idx + 1] += clarityAmount;
        linear[idx + 2] += clarityAmount;
      }

      // Texture: fine-detail boost (narrower than clarity)
      if (Math.abs(msg.texture) > 0.01) {
        const texAmount = detail * msg.texture * 0.8;
        linear[idx] += texAmount;
        linear[idx + 1] += texAmount;
        linear[idx + 2] += texAmount;
      }
    }
  }

  // ── Step 6: White Balance (temperature + tint in linear space) ──
  if (msg.temperature !== 0 || msg.tint !== 0) {
    const temp = msg.temperature;
    const tnt = msg.tint;
    // RapidRAW: direct RGB channel scaling for WB
    for (let i = 0; i < pixelCount; i++) {
      const idx = i * 3;
      // Warm: boost red, reduce blue. Cool: opposite.
      linear[idx]     *= 1 + temp * 0.3;   // Red
      linear[idx + 2] *= 1 - temp * 0.3;   // Blue
      // Tint: green-magenta axis
      linear[idx + 1] *= 1 + tnt * 0.15;   // Green
    }
  }

  // ── Step 7: Exposure (in linear space — multiplicative, physically correct) ──
  if (msg.exposure !== 0 || msg.brightness !== 0) {
    const expMul = Math.pow(2, msg.exposure);
    const brightMul = 1 + msg.brightness * 0.5;
    const totalMul = expMul * brightMul;
    for (let i = 0; i < linear.length; i++) {
      linear[i] *= totalMul;
    }
  }

  // ── Step 8: Tonal adjustments (with blur reference — RapidRAW approach) ──
  {
    const { contrast, highlights, shadows, whites, blacks } = msg;
    for (let i = 0; i < pixelCount; i++) {
      const idx = i * 3;
      const origLuma = 0.2126 * linear[idx] + 0.7152 * linear[idx + 1] + 0.0722 * linear[idx + 2];
      // Use blurred luminance for local adaptation (like RapidRAW)
      const refLuma = tonalBlur ? tonalBlur[i] : origLuma;

      let adjust = 1.0;

      // Contrast (S-curve around midpoint)
      if (contrast !== 0) {
        const mid = 0.18; // standard 18% grey
        const factor = 1 + contrast;
        adjust *= (origLuma > 0.001) ?
          Math.pow(origLuma / mid, factor - 1) : 1;
      }

      // Highlights (reduce bright areas using blur reference)
      if (highlights !== 0) {
        const highlightMask = Math.max(0, Math.min(1, (refLuma - 0.5) * 2));
        adjust *= 1 - highlights * 0.3 * highlightMask;
      }

      // Shadows (lift dark areas using blur reference)
      if (shadows !== 0) {
        const shadowMask = Math.max(0, Math.min(1, 1 - refLuma * 2));
        adjust *= 1 + shadows * 0.4 * shadowMask;
      }

      // Whites
      if (whites !== 0) {
        const whiteMask = Math.max(0, Math.min(1, (refLuma - 0.7) * 3.33));
        adjust *= 1 + whites * 0.3 * whiteMask;
      }

      // Blacks
      if (blacks !== 0) {
        const blackMask = Math.max(0, Math.min(1, 1 - refLuma * 3.33));
        adjust *= 1 + blacks * 0.3 * blackMask;
      }

      linear[idx] *= adjust;
      linear[idx + 1] *= adjust;
      linear[idx + 2] *= adjust;
    }
  }

  // ── Step 9: HSL adjustments (OKLCh perceptual space — from darktable) ──
  if (msg.hasHSL) {
    const hslChannels = msg.hsl;
    for (let i = 0; i < pixelCount; i++) {
      const idx = i * 3;
      let [L, a, b] = linearRgbToOklab(linear[idx], linear[idx + 1], linear[idx + 2]);

      let C = Math.sqrt(a * a + b * b);
      let h = Math.atan2(b, a) * 180 / Math.PI;
      if (h < 0) h += 360;

      // Apply per-channel adjustments
      for (const [_key, adj] of Object.entries(hslChannels)) {
        if (adj.h === 0 && adj.s === 0 && adj.l === 0) continue;

        // Determine influence based on hue proximity
        const channelHues: Record<string, number> = {
          red: 30, orange: 60, yellow: 90, green: 150,
          aqua: 195, blue: 270, purple: 315, magenta: 345,
        };
        const centerHue = channelHues[_key] ?? 0;
        let hueDiff = Math.abs(h - centerHue);
        if (hueDiff > 180) hueDiff = 360 - hueDiff;
        const influence = Math.max(0, 1 - hueDiff / 45);

        if (influence > 0) {
          h += adj.h * 30 * influence;
          C *= 1 + adj.s * influence;
          L *= 1 + adj.l * 0.3 * influence;
        }
      }

      // Convert back
      if (h < 0) h += 360;
      if (h >= 360) h -= 360;
      const hRad = h * Math.PI / 180;
      const [nr, ng, nb] = oklabToLinearRgb(L, C * Math.cos(hRad), C * Math.sin(hRad));
      linear[idx] = Math.max(0, nr);
      linear[idx + 1] = Math.max(0, ng);
      linear[idx + 2] = Math.max(0, nb);
    }
  }

  // ── Step 10: Color Grading (3-way in linear space) ──
  if (msg.hasColorGrading) {
    const cw = msg.colorWheels;
    for (let i = 0; i < pixelCount; i++) {
      const idx = i * 3;
      const l = 0.2126 * linear[idx] + 0.7152 * linear[idx + 1] + 0.0722 * linear[idx + 2];

      // Shadow/midtone/highlight masks
      const shadowW = Math.max(0, 1 - l * 4);
      const highlightW = Math.max(0, (l - 0.25) * 2);
      const midtoneW = Math.max(0, 1 - Math.abs(l - 0.5) * 4);

      for (const [zone, weight] of [['shadows', shadowW], ['midtones', midtoneW], ['highlights', highlightW]] as const) {
        const wheel = cw[zone];
        if (wheel.hue === 0 && wheel.sat === 0 && wheel.lum === 0) continue;
        const w = weight as number;
        if (w < 0.001) continue;

        const hRad = wheel.hue * Math.PI / 180;
        const tintR = Math.cos(hRad) * wheel.sat * 0.02 * w;
        const tintB = Math.sin(hRad) * wheel.sat * 0.02 * w;
        const lumAdj = 1 + wheel.lum * 0.02 * w;

        linear[idx] = (linear[idx] + tintR) * lumAdj;
        linear[idx + 1] = linear[idx + 1] * lumAdj;
        linear[idx + 2] = (linear[idx + 2] + tintB) * lumAdj;
      }
    }
  }

  // ── Step 11: Saturation + Vibrance ──
  if (msg.saturation !== 0 || msg.vibrance !== 0) {
    for (let i = 0; i < pixelCount; i++) {
      const idx = i * 3;
      const l = 0.2126 * linear[idx] + 0.7152 * linear[idx + 1] + 0.0722 * linear[idx + 2];

      // Vibrance: boost low-saturation areas more (like RapidRAW)
      const currentSat = Math.max(Math.abs(linear[idx] - l), Math.abs(linear[idx + 1] - l), Math.abs(linear[idx + 2] - l));
      const vibBoost = msg.vibrance * (1 - Math.min(1, currentSat * 3));
      const totalSat = 1 + msg.saturation + vibBoost;

      linear[idx] = l + (linear[idx] - l) * totalSat;
      linear[idx + 1] = l + (linear[idx + 1] - l) * totalSat;
      linear[idx + 2] = l + (linear[idx + 2] - l) * totalSat;
    }
  }

  // ── Step 12: Tone Map (AgX or linear→sRGB) + convert back to sRGB uint8 ──
  const output = new Uint8ClampedArray(pixelCount * 4);

  if (msg.toneMapper === 'filmic') {
    for (let i = 0; i < pixelCount; i++) {
      const idx = i * 3;
      const [mr, mg, mb] = agxToneMap(
        Math.max(0, linear[idx]),
        Math.max(0, linear[idx + 1]),
        Math.max(0, linear[idx + 2]),
      );
      // AgX output is already in display space
      const oi = i * 4;
      output[oi]     = Math.round(Math.max(0, Math.min(255, mr * 255)));
      output[oi + 1] = Math.round(Math.max(0, Math.min(255, mg * 255)));
      output[oi + 2] = Math.round(Math.max(0, Math.min(255, mb * 255)));
      output[oi + 3] = alpha[i];
    }
  } else {
    for (let i = 0; i < pixelCount; i++) {
      const idx = i * 3;
      const oi = i * 4;
      output[oi]     = linearToSrgb(linear[idx]);
      output[oi + 1] = linearToSrgb(linear[idx + 1]);
      output[oi + 2] = linearToSrgb(linear[idx + 2]);
      output[oi + 3] = alpha[i];
    }
  }

  // ── Step 13: Curves LUT (in sRGB/display space — after tone map, like RapidRAW) ──
  if (msg.hasCurves) {
    const mL = new Uint8Array(msg.masterLUT);
    const rL = new Uint8Array(msg.redLUT);
    const gL = new Uint8Array(msg.greenLUT);
    const bL = new Uint8Array(msg.blueLUT);

    for (let i = 0; i < output.length; i += 4) {
      output[i]     = mL[rL[output[i]]];
      output[i + 1] = mL[gL[output[i + 1]]];
      output[i + 2] = mL[bL[output[i + 2]]];
    }
  }

  // ── Step 14: Fade (lift blacks toward grey) ──
  if (msg.fade > 0.01) {
    const fadeAmount = msg.fade * 60;
    for (let i = 0; i < output.length; i += 4) {
      output[i]     = Math.min(255, output[i] + fadeAmount * (1 - output[i] / 255));
      output[i + 1] = Math.min(255, output[i + 1] + fadeAmount * (1 - output[i + 1] / 255));
      output[i + 2] = Math.min(255, output[i + 2] + fadeAmount * (1 - output[i + 2] / 255));
    }
  }

  // ── Step 15: Film Grain (RapidRAW-style gradient noise, scale-aware) ──
  if (msg.grain > 0.01) {
    const amount = msg.grain * 0.5;
    const freq = (1 / Math.max(msg.grainSize, 0.1)) / scale;
    const roughness = msg.grainRoughness / 100;
    const seed = msg.grainSeed;

    for (let i = 0; i < pixelCount; i++) {
      const x = i % w, y = Math.floor(i / w);
      const oi = i * 4;
      const l = (output[oi] * 0.2126 + output[oi + 1] * 0.7152 + output[oi + 2] * 0.0722) / 255;
      const lumaMask = Math.max(0, Math.min(1, l * 6.67)) * (1 - Math.max(0, Math.min(1, (l - 0.6) * 2.5)));

      const baseCoordX = (x + seed) * freq;
      const baseCoordY = (y + seed * 0.7) * freq;
      const noiseBase = gradientNoise(baseCoordX, baseCoordY);
      const noiseRough = gradientNoise(baseCoordX * 0.6 + 5.2, baseCoordY * 0.6 + 1.3);
      const noise = ((1 - roughness) * noiseBase + roughness * noiseRough) * amount * lumaMask * 255;

      output[oi]     = Math.max(0, Math.min(255, output[oi] + noise));
      output[oi + 1] = Math.max(0, Math.min(255, output[oi + 1] + noise));
      output[oi + 2] = Math.max(0, Math.min(255, output[oi + 2] + noise));
    }
  }

  // ── Step 16: Vignette ──
  if (msg.vignette !== 0) {
    const vAmount = Math.abs(msg.vignette);
    const isDark = msg.vignette < 0;
    const vMid = msg.vignetteMidpoint / 100;
    const vFeather = msg.vignetteFeather / 100;
    const vRound = 1 - msg.vignetteRoundness / 100;
    const aspect = h / w;

    for (let i = 0; i < pixelCount; i++) {
      const x = i % w, y = Math.floor(i / w);
      const ux = ((x / w) - 0.5) * 2;
      const uy = ((y / h) - 0.5) * 2;
      const uxr = Math.sign(ux) * Math.pow(Math.abs(ux), vRound);
      const uyr = Math.sign(uy) * Math.pow(Math.abs(uy), vRound);
      const d = Math.sqrt(uxr * uxr + uyr * uyr * aspect * aspect) * 0.5;

      const vigMask = smoothstep(vMid - vFeather * 0.5, vMid + vFeather * 0.5, d);
      const oi = i * 4;

      if (isDark) {
        const factor = 1 - vAmount * vigMask;
        output[oi]     = Math.round(output[oi] * factor);
        output[oi + 1] = Math.round(output[oi + 1] * factor);
        output[oi + 2] = Math.round(output[oi + 2] * factor);
      } else {
        output[oi]     = Math.round(output[oi] + (255 - output[oi]) * vAmount * vigMask);
        output[oi + 1] = Math.round(output[oi + 1] + (255 - output[oi + 1]) * vAmount * vigMask);
        output[oi + 2] = Math.round(output[oi + 2] + (255 - output[oi + 2]) * vAmount * vigMask);
      }
    }
  }

  // ── Step 17: Dithering (anti-banding — from RapidRAW) ──
  // Ordered dither to prevent visible banding in smooth gradients
  for (let i = 0; i < pixelCount; i++) {
    const x = i % w, y = Math.floor(i / w);
    // 8x8 Bayer matrix approximation
    const ditherVal = ((x * 127 + y * 311) & 0xFF) / 255.0 - 0.5;
    const oi = i * 4;
    output[oi]     = Math.max(0, Math.min(255, output[oi] + ditherVal));
    output[oi + 1] = Math.max(0, Math.min(255, output[oi + 1] + ditherVal));
    output[oi + 2] = Math.max(0, Math.min(255, output[oi + 2] + ditherVal));
  }

  const resp: ExportWorkerResponse = {
    type: 'exported',
    pixels: output.buffer,
    width: w,
    height: h,
  };
  (self as unknown as Worker).postMessage(resp, [output.buffer]);
};


function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
