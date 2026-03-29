/**
 * export-pipeline.ts — Full-resolution export pipeline for develop edits.
 *
 * Uses export-worker.ts (RapidRAW-quality linear-space processing) for
 * all per-pixel adjustments, then applies geometry transforms and encodes.
 *
 * Pipeline:
 * 1. Load full-res original
 * 2. Extract raw sRGB pixels
 * 3. Send to export-worker (linear-space processing: CA → NR → Dehaze →
 *    Local Contrast → WB → Exposure → Tonals → HSL → ColorGrade →
 *    Saturation → ToneMap → Curves → Grain → Vignette → Dither)
 * 4. Apply geometry transform (rotation, perspective, distortion)
 * 5. Encode as JPEG/PNG blob
 * 6. Upload back to Immich via replaceAsset
 */

import { buildCurveLUT } from './develop-tool/curve-engine';
import type { ExportWorkerRequest, ExportWorkerResponse } from './export-worker';

export interface ExportOptions {
  /** URL of the full-resolution original image */
  originalUrl: string;
  /** All develop parameters from developManager.params */
  params: {
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
    sharpness: number;
    noiseReduction: number;
    clarity: number;
    dehaze: number;
    caCorrection: number;
    toneMapper: 'none' | 'filmic';
    vignette: number;
    vignetteMidpoint: number;
    vignetteRoundness: number;
    vignetteFeather: number;
    vignetteHighlights: number;
    grain: number;
    grainSize: number;
    grainRoughness: number;
    fade: number;
    geoRotation: number;
    geoDistortion: number;
    geoVertical: number;
    geoHorizontal: number;
    geoScale: number;
  };
  /** Tone curves */
  curves: {
    master: Array<{x: number; y: number}>;
    red: Array<{x: number; y: number}>;
    green: Array<{x: number; y: number}>;
    blue: Array<{x: number; y: number}>;
  };
  /** Curve endpoints */
  curveEndpoints: {
    master: { black: {x: number; y: number}; white: {x: number; y: number} };
    red: { black: {x: number; y: number}; white: {x: number; y: number} };
    green: { black: {x: number; y: number}; white: {x: number; y: number} };
    blue: { black: {x: number; y: number}; white: {x: number; y: number} };
  };
  /** HSL adjustments */
  hsl: Record<string, { h: number; s: number; l: number }>;
  /** Color grading wheels */
  colorWheels: {
    shadows: { hue: number; sat: number; lum: number };
    midtones: { hue: number; sat: number; lum: number };
    highlights: { hue: number; sat: number; lum: number };
  };
  /** Output format */
  format?: 'jpeg' | 'png';
  /** JPEG quality (0-1, default 0.95) */
  quality?: number;
  /** Progress callback */
  onProgress?: (stage: string, percent: number) => void;
}

/**
 * Run the full export pipeline at original resolution.
 * Returns a Blob of the processed image.
 */
export async function exportDevelopedImage(options: ExportOptions): Promise<Blob> {
  const { params: p, curves, curveEndpoints: ep, hsl, colorWheels: cw, onProgress } = options;
  const format = options.format ?? 'jpeg';
  const quality = options.quality ?? 0.95;

  // ── Stage 1: Load full-res original ──
  onProgress?.('Loading original...', 5);

  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load original image'));
    img.src = options.originalUrl;
  });

  const fullW = img.naturalWidth;
  const fullH = img.naturalHeight;

  onProgress?.(`Processing ${fullW}×${fullH}...`, 15);

  // ── Stage 2: Extract raw sRGB pixels ──
  const canvas = document.createElement('canvas');
  canvas.width = fullW;
  canvas.height = fullH;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, fullW, fullH);
  const imageData = ctx.getImageData(0, 0, fullW, fullH);

  // ── Stage 3: Build curve LUTs ──
  const hasCurves = Object.values(curves).some(ch => ch.length > 0);
  const hasEndpoints = Object.values(ep).some(
    e => e.black.x !== 0 || e.black.y !== 0 || e.white.x !== 1 || e.white.y !== 1,
  );
  const masterLUT = buildCurveLUT(curves.master, ep.master);
  const redLUT = buildCurveLUT(curves.red, ep.red);
  const greenLUT = buildCurveLUT(curves.green, ep.green);
  const blueLUT = buildCurveLUT(curves.blue, ep.blue);

  const hasHSL = Object.values(hsl).some(ch => ch.h !== 0 || ch.s !== 0 || ch.l !== 0);
  const hasColorGrading = Object.values(cw).some(w => w.hue !== 0 || w.sat !== 0 || w.lum !== 0);

  onProgress?.('Rendering...', 25);

  // ── Stage 4: Send to export worker (linear-space RapidRAW pipeline) ──
  const workerUrl = new URL('./export-worker.ts', import.meta.url);
  const worker = new Worker(workerUrl, { type: 'module' });

  const processedData = await new Promise<ImageData>((resolve, reject) => {
    // Generous timeout for full-res (could be 50MP+ images)
    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new Error('Export timed out (120s). Image may be too large.'));
    }, 120_000);

    worker.onmessage = (e: MessageEvent<ExportWorkerResponse>) => {
      clearTimeout(timeout);
      worker.terminate();

      if (e.data.type === 'exported') {
        resolve(new ImageData(
          new Uint8ClampedArray(e.data.pixels),
          e.data.width,
          e.data.height,
        ));
      } else {
        reject(new Error('Unexpected worker response'));
      }
    };

    worker.onerror = (err) => {
      clearTimeout(timeout);
      worker.terminate();
      reject(new Error(`Export worker error: ${err.message}`));
    };

    // Transfer pixel data to worker (zero-copy)
    const pixelBuf = imageData.data.buffer;
    const mBuf = masterLUT.slice().buffer;
    const rBuf = redLUT.slice().buffer;
    const gBuf = greenLUT.slice().buffer;
    const bBuf = blueLUT.slice().buffer;

    const request: ExportWorkerRequest = {
      type: 'export',
      pixels: pixelBuf,
      width: fullW,
      height: fullH,
      masterLUT: mBuf,
      redLUT: rBuf,
      greenLUT: gBuf,
      blueLUT: bBuf,
      hasCurves: hasCurves || hasEndpoints,
      exposure: p.exposure,
      contrast: p.contrast,
      highlights: p.highlights,
      shadows: p.shadows,
      whites: p.whites,
      blacks: p.blacks,
      brightness: p.brightness,
      saturation: p.saturation,
      temperature: p.temperature,
      tint: p.tint,
      vibrance: p.vibrance,
      texture: p.texture,
      dehaze: p.dehaze,
      clarity: p.clarity,
      sharpness: p.sharpness,
      noiseReduction: p.noiseReduction,
      caCorrection: p.caCorrection,
      toneMapper: p.toneMapper,
      grain: p.grain,
      grainSize: p.grainSize,
      grainRoughness: p.grainRoughness,
      grainSeed: hashString(options.originalUrl),
      fade: p.fade,
      hsl: JSON.parse(JSON.stringify(hsl)),
      hasHSL,
      colorWheels: JSON.parse(JSON.stringify(cw)),
      hasColorGrading,
      vignette: p.vignette,
      vignetteMidpoint: p.vignetteMidpoint,
      vignetteRoundness: p.vignetteRoundness,
      vignetteFeather: p.vignetteFeather,
    };

    worker.postMessage(request, [pixelBuf, mBuf, rBuf, gBuf, bBuf]);
  });

  // Put processed pixels back on canvas
  ctx.putImageData(processedData, 0, 0);

  onProgress?.('Applying geometry...', 80);

  // ── Stage 5: Apply geometry transform ──
  const hasGeo = p.geoRotation !== 0 || p.geoDistortion !== 0
    || p.geoVertical !== 0 || p.geoHorizontal !== 0 || p.geoScale !== 100;

  if (hasGeo) {
    const geoCanvas = document.createElement('canvas');
    geoCanvas.width = fullW;
    geoCanvas.height = fullH;
    const geoCtx = geoCanvas.getContext('2d')!;

    const cx = fullW / 2;
    const cy = fullH / 2;
    const scale = p.geoScale / 100;
    const rotRad = (p.geoRotation * Math.PI) / 180;
    const perspV = p.geoVertical * 0.003;
    const perspH = p.geoHorizontal * 0.003;

    geoCtx.save();
    geoCtx.translate(cx, cy);
    geoCtx.scale(scale, scale);

    if (rotRad !== 0) {
      geoCtx.rotate(rotRad);
    }

    if (perspV !== 0 || perspH !== 0) {
      geoCtx.transform(
        1 - Math.abs(perspH) * 0.1,
        perspH * 0.5,
        perspV * 0.5,
        1 - Math.abs(perspV) * 0.1,
        0, 0,
      );
    }

    geoCtx.drawImage(canvas, -cx, -cy);
    geoCtx.restore();

    // Barrel/pincushion distortion (pixel-level inverse warp)
    if (p.geoDistortion !== 0) {
      applyBarrelDistortion(geoCtx, geoCanvas, fullW, fullH, p.geoDistortion);
    }

    ctx.clearRect(0, 0, fullW, fullH);
    ctx.drawImage(geoCanvas, 0, 0);
  }

  onProgress?.('Encoding...', 90);

  // ── Stage 6: Encode to Blob ──
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('Canvas toBlob failed'));
      },
      format === 'jpeg' ? 'image/jpeg' : 'image/png',
      format === 'jpeg' ? quality : undefined,
    );
  });

  onProgress?.('Done', 100);
  return blob;
}


// ═══════════════════════════════════════════════════════════════
// Helper functions
// ═══════════════════════════════════════════════════════════════

/**
 * Apply barrel/pincushion distortion via pixel remapping.
 * Uses inverse mapping with bilinear interpolation.
 */
function applyBarrelDistortion(
  ctx: CanvasRenderingContext2D,
  _canvas: HTMLCanvasElement,
  w: number,
  h: number,
  distortion: number,
): void {
  const src = ctx.getImageData(0, 0, w, h);
  const dst = ctx.createImageData(w, h);
  const srcData = src.data;
  const dstData = dst.data;

  const cx = w / 2;
  const cy = h / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy);
  const k = distortion / 100 * 0.5;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x - cx) / maxR;
      const ny = (y - cy) / maxR;
      const r2 = nx * nx + ny * ny;
      const factor = 1 + k * r2;
      const srcX = cx + nx * factor * maxR;
      const srcY = cy + ny * factor * maxR;

      const x0 = Math.floor(srcX);
      const y0 = Math.floor(srcY);
      const x1 = x0 + 1;
      const y1 = y0 + 1;
      const fx = srcX - x0;
      const fy = srcY - y0;

      const dstIdx = (y * w + x) * 4;

      if (x0 >= 0 && x1 < w && y0 >= 0 && y1 < h) {
        const i00 = (y0 * w + x0) * 4;
        const i10 = (y0 * w + x1) * 4;
        const i01 = (y1 * w + x0) * 4;
        const i11 = (y1 * w + x1) * 4;

        for (let c = 0; c < 4; c++) {
          const top = srcData[i00 + c] * (1 - fx) + srcData[i10 + c] * fx;
          const bot = srcData[i01 + c] * (1 - fx) + srcData[i11 + c] * fx;
          dstData[dstIdx + c] = Math.round(top * (1 - fy) + bot * fy);
        }
      } else {
        dstData[dstIdx + 3] = 0;
      }
    }
  }

  ctx.putImageData(dst, 0, 0);
}


function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
