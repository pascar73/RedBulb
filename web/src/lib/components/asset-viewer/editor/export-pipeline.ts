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
import ExportWorkerModule from './export-worker?worker';

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
  /** Resize mode */
  resizeMode?: 'original' | 'longEdge' | 'megapixels';
  /** Long edge target in pixels */
  longEdge?: number;
  /** Target megapixels */
  megapixels?: number;
  /** If true, return raw RGBA pixels instead of encoded blob (for TIFF encoding) */
  returnPixels?: boolean;
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

  // Warn about huge images (bilateral filters are O(n²) expensive)
  const megapixels = (fullW * fullH) / 1_000_000;
  if (megapixels > 30 && resizeMode === 'original') {
    console.warn(`[Export] Very large image (${megapixels.toFixed(1)} MP). Export may take several minutes. Consider resizing.`);
  }

  // ── Stage 2: Resize FIRST if needed (before expensive worker processing) ──
  // This dramatically speeds up export by running blur/NR on fewer pixels
  const resizeMode = options.resizeMode ?? 'original';
  let processW = fullW;
  let processH = fullH;
  const aspect = fullW / fullH;

  if (resizeMode === 'longEdge') {
    const edge = options.longEdge ?? 2048;
    if (fullW >= fullH && edge < fullW) {
      processW = edge;
      processH = Math.round(edge / aspect);
    } else if (edge < fullH) {
      processH = edge;
      processW = Math.round(edge * aspect);
    }
  } else if (resizeMode === 'megapixels') {
    const targetPx = (options.megapixels ?? 2) * 1_000_000;
    const currentPx = fullW * fullH;
    if (targetPx < currentPx) {
      const ratio = Math.sqrt(targetPx / currentPx);
      processW = Math.round(fullW * ratio);
      processH = Math.round(fullH * ratio);
    }
  }

  // Draw (and optionally pre-resize) to canvas
  const canvas = document.createElement('canvas');
  canvas.width = processW;
  canvas.height = processH;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, processW, processH);
  const imageData = ctx.getImageData(0, 0, processW, processH);

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

  // Check if ANY develop edits exist
  const hasAnyEdits = p.exposure !== 0 || p.contrast !== 0 || p.highlights !== 0 || p.shadows !== 0
    || p.whites !== 0 || p.blacks !== 0 || p.brightness !== 0 || p.saturation !== 0
    || p.temperature !== 0 || p.tint !== 0 || p.vibrance !== 0 || p.texture !== 0
    || p.sharpness !== 0 || p.noiseReduction !== 0 || p.clarity !== 0 || p.dehaze !== 0
    || p.caCorrection !== 0 || p.toneMapper !== 'none' || p.vignette !== 0
    || p.grain !== 0 || p.fade !== 0 || hasCurves || hasEndpoints || hasHSL || hasColorGrading;

  // ── Fast path: no edits → skip expensive worker processing ──
  if (!hasAnyEdits) {
    onProgress?.('Encoding...', 80);

    // Skip worker — go straight to geometry + output
    const hasGeo = p.geoRotation !== 0 || p.geoDistortion !== 0
      || p.geoVertical !== 0 || p.geoHorizontal !== 0 || p.geoScale !== 100;

    if (hasGeo) {
      applyGeometryToCanvas(ctx, canvas, processW, processH, p);
    }

    // Return pixels or encode
    if (options.returnPixels) {
      const outData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      onProgress?.('Done', 100);
      const fakeBlob = new Blob([]) as any;
      fakeBlob.__tungstenPixels = { pixels: outData.data, width: canvas.width, height: canvas.height };
      return fakeBlob;
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => { if (b) resolve(b); else reject(new Error('Canvas toBlob failed')); },
        format === 'jpeg' ? 'image/jpeg' : 'image/png',
        format === 'jpeg' ? quality : undefined,
      );
    });
    onProgress?.('Done', 100);
    return blob;
  }

  onProgress?.('Rendering...', 25);
  console.log('[Export] Starting worker processing:', { processW, processH, hasAnyEdits });

  // ── Stage 4: Send to export worker (linear-space RapidRAW pipeline) ──
  let worker: Worker;
  try {
    worker = new ExportWorkerModule();
    console.log('[Export] Worker created successfully');
  } catch (err) {
    console.error('[Export] Failed to create worker:', err);
    throw new Error(`Worker creation failed: ${err instanceof Error ? err.message : 'Unknown'}`);
  }

  const processedData = await new Promise<ImageData>((resolve, reject) => {
    console.log('[Export] Worker Promise setup, attaching handlers');
    // Very generous timeout for full-res exports (bilateral filters are expensive)
    const timeoutSec = 300; // 5 minutes for 50MP+ images with heavy processing
    const timeout = setTimeout(() => {
      console.error(`[Export] Worker timeout after ${timeoutSec}s`);
      worker.terminate();
      reject(new Error(`Export timed out (${timeoutSec}s). Try resizing to "Long edge 4096" or "Megapixels 12" for faster export.`));
    }, timeoutSec * 1000);

    worker.onmessage = (e: MessageEvent<ExportWorkerResponse>) => {
      console.log('[Export] Worker response received:', e.data.type);
      clearTimeout(timeout);
      worker.terminate();

      if (e.data.type === 'exported') {
        console.log('[Export] Worker success:', { width: e.data.width, height: e.data.height });
        resolve(new ImageData(
          new Uint8ClampedArray(e.data.pixels),
          e.data.width,
          e.data.height,
        ));
      } else {
        console.error('[Export] Unexpected worker response type:', e.data);
        reject(new Error('Unexpected worker response'));
      }
    };

    worker.onerror = (err) => {
      console.error('[Export] Worker error event:', err);
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
      width: processW,
      height: processH,
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

    console.log('[Export] Sending data to worker:', {
      width: processW,
      height: processH,
      pixelBytes: pixelBuf.byteLength,
      transferables: [pixelBuf, mBuf, rBuf, gBuf, bBuf].map(b => b.byteLength)
    });
    worker.postMessage(request, [pixelBuf, mBuf, rBuf, gBuf, bBuf]);
    console.log('[Export] postMessage complete, waiting for worker response...');
  });

  // Put processed pixels back on canvas
  ctx.putImageData(processedData, 0, 0);

  onProgress?.('Applying geometry...', 80);

  // ── Stage 5: Apply geometry transform ──
  const hasGeo = p.geoRotation !== 0 || p.geoDistortion !== 0
    || p.geoVertical !== 0 || p.geoHorizontal !== 0 || p.geoScale !== 100;

  if (hasGeo) {
    applyGeometryToCanvas(ctx, canvas, processW, processH, p);
  }

  // Resize was already done in Stage 2 (pre-worker), so no Lanczos pass needed
  const outputCanvas: HTMLCanvasElement = canvas;

  onProgress?.('Encoding...', 90);

  // ── Stage 6: Return raw pixels (for TIFF) or encode to Blob ──
  if (options.returnPixels) {
    const outCtx = outputCanvas.getContext('2d')!;
    const outData = outCtx.getImageData(0, 0, outputCanvas.width, outputCanvas.height);
    onProgress?.('Done', 100);
    // Return a Blob-like object with __tungstenPixels attached
    const fakeBlob = new Blob([]) as any;
    fakeBlob.__tungstenPixels = {
      pixels: outData.data,
      width: outputCanvas.width,
      height: outputCanvas.height,
    };
    return fakeBlob;
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    outputCanvas.toBlob(
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
 * Apply geometry transforms (rotation, perspective, scale, barrel distortion) to canvas.
 */
function applyGeometryToCanvas(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  w: number,
  h: number,
  p: { geoRotation: number; geoDistortion: number; geoVertical: number; geoHorizontal: number; geoScale: number },
): void {
  const geoCanvas = document.createElement('canvas');
  geoCanvas.width = w;
  geoCanvas.height = h;
  const geoCtx = geoCanvas.getContext('2d')!;

  const cx = w / 2;
  const cy = h / 2;
  const scale = p.geoScale / 100;
  const rotRad = (p.geoRotation * Math.PI) / 180;
  const perspV = p.geoVertical * 0.003;
  const perspH = p.geoHorizontal * 0.003;

  geoCtx.save();
  geoCtx.translate(cx, cy);
  geoCtx.scale(scale, scale);
  if (rotRad !== 0) geoCtx.rotate(rotRad);
  if (perspV !== 0 || perspH !== 0) {
    geoCtx.transform(
      1 - Math.abs(perspH) * 0.1, perspH * 0.5,
      perspV * 0.5, 1 - Math.abs(perspV) * 0.1,
      0, 0,
    );
  }
  geoCtx.drawImage(canvas, -cx, -cy);
  geoCtx.restore();

  if (p.geoDistortion !== 0) {
    applyBarrelDistortion(geoCtx, geoCanvas, w, h, p.geoDistortion);
  }

  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(geoCanvas, 0, 0);
}

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
