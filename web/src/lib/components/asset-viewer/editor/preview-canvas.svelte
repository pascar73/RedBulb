<script lang="ts">
  import { developManager } from '$lib/managers/edit/develop-manager.svelte';
  import { assetViewerManager } from '$lib/managers/asset-viewer-manager.svelte';
  import { buildCurveLUT as buildCurveLUTShared } from './develop-tool/curve-engine';
  import PreviewWorker from './preview-worker?worker';
  
  interface Props {
    imageUrl: string;
    width: number;
    height: number;
  }
  
  let { imageUrl, width, height }: Props = $props();
  let canvas = $state<HTMLCanvasElement | undefined>(undefined);
  let isProcessing = $state(false);

  // Follow the zoom transform applied by @zoom-image/core to the <img> element
  const zoomTransform = $derived.by(() => {
    const { currentZoom, currentPositionX, currentPositionY } = assetViewerManager.zoomState;
    if (currentZoom === 1 && currentPositionX === 0 && currentPositionY === 0) return '';
    return `transform-origin: 0 0; transform: translate(${currentPositionX}px, ${currentPositionY}px) scale(${currentZoom});`;
  });

  // Store original (unmodified) image data for eyedropper sampling
  let originalImageData: ImageData | null = null;
  let origW = 0;
  let origH = 0;

  // Preview worker for off-main-thread pixel processing
  let previewWorker: Worker | null = null;
  let workerBusy = false;
  let pendingRender = false;
  let cachedImg: HTMLImageElement | null = null;
  let cachedImgUrl = '';

  $effect(() => {
    previewWorker = new PreviewWorker();
    previewWorker.onmessage = (e) => {
      if (e.data.type === 'processed' && canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const imgData = new ImageData(
            new Uint8ClampedArray(e.data.pixels),
            e.data.width,
            e.data.height,
          );
          ctx.putImageData(imgData, 0, 0);
        }
      }
      workerBusy = false;
      isProcessing = false;
      if (pendingRender) {
        pendingRender = false;
        void renderPreview();
      }
    };
    return () => { previewWorker?.terminate(); previewWorker = null; };
  });

  /** Handle eyedropper click on the preview canvas */
  function handleEyedropperClick(event: MouseEvent) {
    if (!developManager.eyedropperActive || !canvas || !originalImageData) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = origW / rect.width;
    const scaleY = origH / rect.height;
    const px = Math.round((event.clientX - rect.left) * scaleX);
    const py = Math.round((event.clientY - rect.top) * scaleY);

    if (px < 0 || px >= origW || py < 0 || py >= origH) return;

    // Sample a 5×5 area around the click point for stability
    let rSum = 0, gSum = 0, bSum = 0, count = 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const sx = Math.max(0, Math.min(origW - 1, px + dx));
        const sy = Math.max(0, Math.min(origH - 1, py + dy));
        const idx = (sy * origW + sx) * 4;
        rSum += originalImageData.data[idx];
        gSum += originalImageData.data[idx + 1];
        bSum += originalImageData.data[idx + 2];
        count++;
      }
    }

    const r = rSum / count / 255;
    const g = gSum / count / 255;
    const b = bSum / count / 255;

    // Convert sampled color to temperature/tint correction
    // The idea: a neutral gray should have r≈g≈b. The deviation tells us the color cast.
    // Temperature: blue-yellow axis (b vs r)
    // Tint: green-magenta axis (g vs avg(r,b))
    const avg = (r + g + b) / 3;
    if (avg < 0.01) {
      // Too dark to sample
      developManager.eyedropperActive = false;
      return;
    }

    // Normalize to unit brightness
    const rn = r / avg, gn = g / avg, bn = b / avg;

    // Temperature: negative = warm (too blue, add warmth), positive = cool (too yellow, add blue)
    // Map deviation to -1..1 range
    const tempCorrection = Math.max(-1, Math.min(1, (bn - rn) * -0.8));

    // Tint: negative = magenta tint (too green, add magenta), positive = green tint
    const tintCorrection = Math.max(-1, Math.min(1, (gn - (rn + bn) / 2) * -1.2));

    developManager.temperature = Math.round(tempCorrection * 100) / 100;
    developManager.tint = Math.round(tintCorrection * 100) / 100;
    developManager.eyedropperActive = false;
  }
  
  /** Deterministic hash from string (for grain seed) */
  function hashString(s: string): number {
    let hash = 0;
    for (let i = 0; i < s.length; i++) hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
    return Math.abs(hash) || 42;
  }

  // Debounced render
  let renderTimeout: ReturnType<typeof setTimeout> | undefined;
  
  $effect(() => {
    // Track all params to trigger re-render
    const params = developManager.params;
    // Deep-read curves arrays so Svelte 5 tracks mutations
    const curves = developManager.curves;
    const _trackCurves = [
      curves.master.length, curves.master.map(p => p.x + p.y).join(),
      curves.red.length, curves.red.map(p => p.x + p.y).join(),
      curves.green.length, curves.green.map(p => p.x + p.y).join(),
      curves.blue.length, curves.blue.map(p => p.x + p.y).join(),
    ];
    // Deep-read endpoints too
    const ep = developManager.curveEndpoints;
    void [ep.master.black.x, ep.master.black.y, ep.master.white.x, ep.master.white.y,
          ep.red.black.x, ep.red.black.y, ep.red.white.x, ep.red.white.y,
          ep.green.black.x, ep.green.black.y, ep.green.white.x, ep.green.white.y,
          ep.blue.black.x, ep.blue.black.y, ep.blue.white.x, ep.blue.white.y];
    // Deep-read HSL
    const hsl = developManager.hsl;
    const _trackHsl = Object.values(hsl).map(ch => `${ch.h}${ch.s}${ch.l}`).join();
    // Deep-read color wheels
    const cw = developManager.colorWheels;
    void [cw.shadows.hue, cw.shadows.sat, cw.shadows.lum,
          cw.midtones.hue, cw.midtones.sat, cw.midtones.lum,
          cw.highlights.hue, cw.highlights.sat, cw.highlights.lum];
    
    // Debounce rendering
    if (renderTimeout) clearTimeout(renderTimeout);
    renderTimeout = setTimeout(() => {
      void renderPreview();
    }, 50);
  });
  
  async function renderPreview() {
    if (!canvas || !imageUrl) return;

    // If worker is busy, queue the render
    if (workerBusy) { pendingRender = true; return; }

    isProcessing = true;
    
    try {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      // Cache image — don't reload every render
      if (!cachedImg || cachedImgUrl !== imageUrl) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = reject;
          img.src = imageUrl;
        });
        cachedImg = img;
        cachedImgUrl = imageUrl;
      }
      const img = cachedImg;
      
      // Set canvas size to image size (or max 2000px)
      const scale = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      
      // Save original image data for eyedropper
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      origW = canvas.width;
      origH = canvas.height;

      // Step 1: Apply CSS-compatible filters via ctx.filter (GPU-accelerated by browser)
      const p = developManager.params;
      ctx.filter = buildFilterString(p);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      ctx.filter = 'none';
      
      // Step 2: Per-pixel processing — offloaded to Web Worker
      const curves = developManager.curves;
      const hsl = developManager.hsl;
      const ep = developManager.curveEndpoints;
      const cw = developManager.colorWheels;
      const hasCurves = Object.values(curves).some(ch => ch.length > 0);
      const hasEndpoints = Object.values(ep).some(e => e.black.x !== 0 || e.black.y !== 0 || e.white.x !== 1 || e.white.y !== 1);
      const hasHSL = Object.values(hsl).some(ch => ch.h !== 0 || ch.s !== 0 || ch.l !== 0);
      const hasColorGrading = Object.values(cw).some(w => w.hue !== 0 || w.sat !== 0 || w.lum !== 0);
      const hasWorkerProcessing = hasCurves || hasEndpoints || hasHSL || hasColorGrading
        || p.toneMapper === 'filmic'
        || p.dehaze > 0.01 || Math.abs(p.clarity) > 0.01 || Math.abs(p.texture) > 0.01
        || p.sharpness > 0.01 || p.noiseReduction > 0.01 || p.caCorrection > 0.01
        || p.grain > 0.01;
      
      if (hasWorkerProcessing && previewWorker) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Build LUTs on main thread (fast — just 256-entry tables)
        const masterLUT = buildCurveLUTShared(curves.master, ep.master);
        const redLUT = buildCurveLUTShared(curves.red, ep.red);
        const greenLUT = buildCurveLUTShared(curves.green, ep.green);
        const blueLUT = buildCurveLUTShared(curves.blue, ep.blue);

        // Transfer pixel data to worker (zero-copy)
        const pixelBuf = imageData.data.buffer;
        const mBuf = masterLUT.slice().buffer;
        const rBuf = redLUT.slice().buffer;
        const gBuf = greenLUT.slice().buffer;
        const bBuf = blueLUT.slice().buffer;

        workerBusy = true;
        previewWorker.postMessage({
          type: 'process',
          pixels: pixelBuf,
          width: canvas.width,
          height: canvas.height,
          masterLUT: mBuf,
          redLUT: rBuf,
          greenLUT: gBuf,
          blueLUT: bBuf,
          hasCurves: hasCurves || hasEndpoints,
          // darktable-ported modules
          dehaze: p.dehaze,
          clarity: p.clarity,
          texture: p.texture,
          sharpness: p.sharpness,
          noiseReduction: p.noiseReduction,
          caCorrection: p.caCorrection,
          // Tone mapper
          toneMapper: p.toneMapper,
          // Film grain (per-pixel in worker)
          grain: p.grain,
          grainSize: p.grainSize,
          grainRoughness: p.grainRoughness,
          grainSeed: hashString(imageUrl),
          // HSL + color grading
          hsl: JSON.parse(JSON.stringify(hsl)),
          hasHSL,
          colorWheels: JSON.parse(JSON.stringify(cw)),
          hasColorGrading,
        }, [pixelBuf, mBuf, rBuf, gBuf, bBuf]);
        // Worker will call back via onmessage → putImageData
      } else {
        isProcessing = false;
      }
    } catch (error) {
      console.error('Canvas preview rendering failed:', error);
      isProcessing = false;
    }
  }
  
  function buildFilterString(p: typeof developManager.params): string {
    // Same logic as photo-viewer's cssFilterStyle
    let brightness = Math.pow(2, p.exposure * 0.5);
    let contrast = 1 + p.contrast;
    let saturate = 1 + p.saturation;
    
    // Highlights/shadows/whites/blacks
    if (p.highlights > 0) brightness *= 1 + p.highlights * 0.15;
    if (p.shadows > 0) brightness *= 1 + p.shadows * 0.1;
    brightness *= 1 + p.whites * 0.2;
    brightness *= 1 + p.blacks * 0.15;
    brightness *= 1 + p.brightness * 0.5;
    
    // Vibrance
    saturate *= 1 + p.vibrance * 0.5;
    
    // Clarity/dehaze — now handled by Web Worker (darktable algorithms)
    // Only keep minimal contrast hint for CSS preview responsiveness
    // (the real processing happens in the worker pipeline)
    
    // Fade
    if (p.fade > 0) {
      contrast *= 1 - p.fade * 0.3;
      brightness *= 1 + p.fade * 0.15;
    }
    
    let filters = `brightness(${brightness}) contrast(${contrast}) saturate(${saturate})`;
    
    // Temperature
    if (p.temperature > 0) filters += ` sepia(${p.temperature * 0.3})`;
    if (p.temperature < 0) filters += ` hue-rotate(${p.temperature * 30}deg)`;
    
    // Tint
    if (p.tint !== 0) filters += ` hue-rotate(${p.tint * 30}deg)`;
    
    // Texture, sharpness, noise reduction — now handled by Web Worker (darktable algorithms)
    // No more CSS blur() hacks
    
    return filters;
  }
  
  // Per-pixel processing (curves, HSL, color grading, grain) is now in preview-worker.ts
  // Film grain moved to worker pipeline (Module 5) — no more CSS overlay
</script>

<!-- Wrapper follows the same zoom transform as the <img> element -->
<div class="absolute inset-0 w-full h-full pointer-events-none" style={zoomTransform}>
  <canvas
    bind:this={canvas}
    class="absolute inset-0 w-full h-full object-contain"
    class:pointer-events-auto={developManager.eyedropperActive}
    class:cursor-crosshair={developManager.eyedropperActive}
    style:display={developManager.hasChanges || developManager.eyedropperActive ? 'block' : 'none'}
    onclick={handleEyedropperClick}
  ></canvas>

  <!-- Vignette overlay (CSS radial-gradient, GPU-accelerated) -->
  {#if developManager.vignette !== 0}
    {@const vig = developManager.vignette}
    {@const mid = developManager.vignetteMidpoint}
    {@const round = developManager.vignetteRoundness}
    {@const feather = developManager.vignetteFeather}
    {@const isDark = vig < 0}
    {@const amount = Math.abs(vig)}
    {@const color = isDark ? '0,0,0' : '255,255,255'}
    {@const innerStop = Math.max(5, mid - feather * 0.4)}
    {@const outerStop = Math.min(100, mid + feather * 0.5)}
    {@const rx = 50 + round * 0.3}
    {@const ry = 50 - round * 0.3}
    <div
      class="absolute inset-0 w-full h-full pointer-events-none rounded"
      style="background: radial-gradient({rx}% {ry}% at center,
        transparent {innerStop}%,
        rgba({color},{amount * 0.85}) {outerStop}%);
        mix-blend-mode: {isDark ? 'multiply' : 'screen'};"
    ></div>
  {/if}

  <!-- Grain now rendered per-pixel in Web Worker (Module 5) -->

  {#if isProcessing}
    <div class="absolute top-2 left-2 text-xs text-white bg-black/50 px-2 py-1 rounded pointer-events-none">
      Processing...
    </div>
  {/if}
</div>
