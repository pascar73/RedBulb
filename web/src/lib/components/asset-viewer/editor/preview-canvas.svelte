<script lang="ts">
  import { developManager } from '$lib/managers/edit/develop-manager.svelte';
  
  interface Props {
    imageUrl: string;
    width: number;
    height: number;
  }
  
  let { imageUrl, width, height }: Props = $props();
  let canvas = $state<HTMLCanvasElement | undefined>(undefined);
  let isProcessing = $state(false);
  
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
    // Deep-read HSL
    const hsl = developManager.hsl;
    const _trackHsl = Object.values(hsl).map(ch => `${ch.h}${ch.s}${ch.l}`).join();
    
    // Debounce rendering
    if (renderTimeout) clearTimeout(renderTimeout);
    renderTimeout = setTimeout(() => {
      void renderPreview();
    }, 50);
  });
  
  async function renderPreview() {
    if (!canvas || !imageUrl) return;
    isProcessing = true;
    
    try {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      // Load original image
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = imageUrl;
      });
      
      // Set canvas size to image size (or max 2000px)
      const scale = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      
      // Step 1: Apply CSS-compatible filters via ctx.filter
      const p = developManager.params;
      ctx.filter = buildFilterString(p);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      ctx.filter = 'none'; // Reset for pixel operations
      
      // Step 2: Per-pixel processing for curves and HSL
      const curves = developManager.curves;
      const hsl = developManager.hsl;
      const hasCurves = Object.values(curves).some(ch => ch.length > 0);
      const hasHSL = Object.values(hsl).some(ch => ch.h !== 0 || ch.s !== 0 || ch.l !== 0);
      
      if (hasCurves || hasHSL) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // Build lookup tables for curves
        const masterLUT = buildCurveLUT(curves.master);
        const redLUT = buildCurveLUT(curves.red);
        const greenLUT = buildCurveLUT(curves.green);
        const blueLUT = buildCurveLUT(curves.blue);
        
        for (let i = 0; i < data.length; i += 4) {
          let r = data[i], g = data[i+1], b = data[i+2];
          
          // Apply curves
          if (hasCurves) {
            r = masterLUT[redLUT[r]];
            g = masterLUT[greenLUT[g]];
            b = masterLUT[blueLUT[b]];
          }
          
          // Apply HSL adjustments
          if (hasHSL) {
            [r, g, b] = applyHSL(r, g, b, hsl);
          }
          
          data[i] = r;
          data[i+1] = g;
          data[i+2] = b;
        }
        
        ctx.putImageData(imageData, 0, 0);
      }
    } catch (error) {
      console.error('Canvas preview rendering failed:', error);
    } finally {
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
    
    // Clarity/dehaze
    contrast *= 1 + p.clarity * 0.3;
    contrast *= 1 + p.dehaze * 0.4;
    saturate *= 1 + p.dehaze * 0.2;
    
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
    
    // Noise reduction
    if (p.noiseReduction > 0) filters += ` blur(${p.noiseReduction * 0.5}px)`;
    
    return filters;
  }
  
  // Build a 256-entry lookup table from curve control points
  function buildCurveLUT(points: Array<{x: number, y: number}>): Uint8Array {
    const lut = new Uint8Array(256);
    if (points.length === 0) {
      // Identity
      for (let i = 0; i < 256; i++) lut[i] = i;
      return lut;
    }
    
    const allPoints = [{ x: 0, y: 0 }, ...points, { x: 1, y: 1 }].sort((a, b) => a.x - b.x);
    
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      // Find the segment
      let seg = 0;
      for (let s = 0; s < allPoints.length - 1; s++) {
        if (t >= allPoints[s].x && t <= allPoints[s + 1].x) {
          seg = s;
          break;
        }
      }
      const p0 = allPoints[seg];
      const p1 = allPoints[seg + 1];
      const segT = p1.x === p0.x ? 0 : (t - p0.x) / (p1.x - p0.x);
      // Linear interpolation for now (can upgrade to cubic hermite later)
      const val = p0.y + segT * (p1.y - p0.y);
      lut[i] = Math.max(0, Math.min(255, Math.round(val * 255)));
    }
    return lut;
  }
  
  // Apply per-channel HSL adjustments
  function applyHSL(r: number, g: number, b: number, hsl: typeof developManager.hsl): [number, number, number] {
    // Convert RGB to HSL
    const rf = r / 255, gf = g / 255, bf = b / 255;
    const max = Math.max(rf, gf, bf), min = Math.min(rf, gf, bf);
    const l = (max + min) / 2;
    
    if (max === min) return [r, g, b]; // Achromatic
    
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = 0;
    if (max === rf) h = ((gf - bf) / d + (gf < bf ? 6 : 0)) / 6;
    else if (max === gf) h = ((bf - rf) / d + 2) / 6;
    else h = ((rf - gf) / d + 4) / 6;
    
    // Determine which channel this hue belongs to
    const channels: Array<{ name: keyof typeof hsl, center: number, width: number }> = [
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
        hAdj += adj.h * weight * 0.1;
        sAdj += adj.s * weight;
        lAdj += adj.l * weight;
      }
    }
    
    // Apply adjustments
    const newH = (h + hAdj + 1) % 1;
    const newS = Math.max(0, Math.min(1, s * (1 + sAdj)));
    const newL = Math.max(0, Math.min(1, l + lAdj * 0.3));
    
    // Convert back to RGB
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
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [
      Math.round(hue2rgb(p, q, h + 1/3) * 255),
      Math.round(hue2rgb(p, q, h) * 255),
      Math.round(hue2rgb(p, q, h - 1/3) * 255),
    ];
  }
</script>

<canvas
  bind:this={canvas}
  class="absolute inset-0 w-full h-full object-contain pointer-events-none"
  style:display={developManager.hasChanges ? 'block' : 'none'}
></canvas>
{#if isProcessing}
  <div class="absolute top-2 left-2 text-xs text-white bg-black/50 px-2 py-1 rounded pointer-events-none">
    Processing...
  </div>
{/if}
