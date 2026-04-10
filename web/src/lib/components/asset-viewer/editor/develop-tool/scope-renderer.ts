/**
 * scope-renderer.ts — Standalone scope rendering module.
 * Manages Web Worker lifecycle for histogram/parade/waveform/vectorscope/CIE rendering.
 * Pure TypeScript, no Svelte dependencies.
 *
 * Based on Ollama qwen2.5-coder:14b draft, hardened by Cassia.
 */

import { LUTCache } from './curve-engine';
import type { CurvePoint, Endpoints } from './curve-engine';

// ── Exported Types ──────────────────────────────────────────

export type ScopeType = 'histogram' | 'parade' | 'waveform' | 'vectorscope' | 'cie';

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
  texture: number;
}

export interface ScopeRenderConfig {
  scopeType: ScopeType;
  brightness: number;
  colorize: boolean;
  curves: { master: CurvePoint[]; red: CurvePoint[]; green: CurvePoint[]; blue: CurvePoint[] };
  curveEndpoints: { master: Endpoints; red: Endpoints; green: Endpoints; blue: Endpoints };
  lutCache: LUTCache;
  light: LightParams;
}

export interface GraticuleConfig {
  scopeType: ScopeType;
  opacity: number;
  showRefLevels: boolean;
  refLow: number;
  refHigh: number;
}

/** Callback fired after worker finishes rendering and ImageData is painted to canvas. */
export type ScopeCompleteCallback = (config: ScopeRenderConfig) => void;

// ── ScopeRenderer Class ─────────────────────────────────────

/**
 * Manages the scope Web Worker lifecycle and rendering state.
 * Accepts a pre-created Worker (Vite ?worker import) and a canvas element.
 *
 * Usage:
 *   const renderer = new ScopeRenderer(worker, canvas, (cfg) => drawGraticule(ctx, ...));
 *   renderer.renderScope({ scopeType: 'histogram', ... });
 *   // later:
 *   renderer.destroy();
 */
export class ScopeRenderer {
  private worker: Worker;
  private canvas: HTMLCanvasElement;
  private workerBusy = false;
  private pendingRender = false;
  private lastConfig: ScopeRenderConfig | null = null;
  private onComplete: ScopeCompleteCallback;
  private destroyed = false;

  constructor(worker: Worker, canvas: HTMLCanvasElement, onComplete: ScopeCompleteCallback) {
    this.worker = worker;
    this.canvas = canvas;
    this.onComplete = onComplete;

    this.worker.onmessage = (e: MessageEvent) => {
      this.workerBusy = false;

      // Paint rendered scope to canvas
      if (e.data.type === 'rendered' && this.canvas) {
        const ctx = this.canvas.getContext('2d');
        if (ctx) {
          const img = new ImageData(
            new Uint8ClampedArray(e.data.imageData),
            e.data.width,
            e.data.height,
          );
          ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
          ctx.putImageData(img, 0, 0);
        }
        if (this.lastConfig) {
          this.onComplete(this.lastConfig);
        }
      }

      // If a render was requested while busy, re-fire with last config
      if (this.pendingRender && this.lastConfig) {
        this.pendingRender = false;
        this.renderScope(this.lastConfig);
      }
    };
  }

  /** Send a render request to the scope worker. Debounces if worker is busy. */
  public renderScope(config: ScopeRenderConfig): void {
    if (this.destroyed) return;

    if (this.workerBusy) {
      this.pendingRender = true;
      this.lastConfig = config;
      return;
    }

    this.workerBusy = true;
    this.pendingRender = false;
    this.lastConfig = config;

    // Build LUTs — use .slice() to copy before transferring ownership
    const masterLUT = config.lutCache.get(config.curves.master, config.curveEndpoints.master).slice();
    const redLUT = config.lutCache.get(config.curves.red, config.curveEndpoints.red).slice();
    const greenLUT = config.lutCache.get(config.curves.green, config.curveEndpoints.green).slice();
    const blueLUT = config.lutCache.get(config.curves.blue, config.curveEndpoints.blue).slice();

    const mBuf = masterLUT.buffer;
    const rBuf = redLUT.buffer;
    const gBuf = greenLUT.buffer;
    const bBuf = blueLUT.buffer;

    this.worker.postMessage({
      type: 'render',
      scopeType: config.scopeType,
      masterLUT: mBuf,
      redLUT: rBuf,
      greenLUT: gBuf,
      blueLUT: bBuf,
      canvasW: this.canvas.width,
      canvasH: this.canvas.height,
      brightness: config.brightness,
      colorize: config.colorize,
      light: config.light,
    }, [mBuf, rBuf, gBuf, bBuf]);
  }

  /** Update the canvas reference (e.g., after resize). */
  public setCanvas(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
  }

  /** Terminate the worker and clean up. */
  public destroy(): void {
    this.destroyed = true;
    this.worker.terminate();
    this.lastConfig = null;
  }
}

// ── Graticule Drawing (Pure Function) ───────────────────────

/**
 * Draw scope graticule overlay on a canvas context.
 * Lightweight — runs on main thread, not in worker.
 */
export function drawGraticule(ctx: CanvasRenderingContext2D, config: GraticuleConfig): void {
  const canvas = ctx.canvas;
  if (!canvas) return;
  const W = canvas.width;
  const H = canvas.height;
  const { scopeType, opacity, showRefLevels, refLow, refHigh } = config;

  if (scopeType === 'vectorscope') {
    const cx = W / 2;
    const cy = H / 2;
    const radius = Math.min(cx, cy) - 8;
    ctx.strokeStyle = `rgba(75, 85, 99, ${opacity})`;
    ctx.lineWidth = 0.5;
    // Outer circle
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
    // Inner circle (50%)
    ctx.beginPath(); ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2); ctx.stroke();
    // Crosshairs
    ctx.beginPath(); ctx.moveTo(cx, cy - radius); ctx.lineTo(cx, cy + radius); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - radius, cy); ctx.lineTo(cx + radius, cy); ctx.stroke();
  } else {
    // Horizontal quarter lines for histogram/parade/waveform/CIE
    ctx.strokeStyle = `rgba(75, 85, 99, ${opacity})`;
    ctx.lineWidth = 0.5;
    for (const frac of [0.25, 0.5, 0.75]) {
      const lineY = H * (1 - frac);
      ctx.beginPath(); ctx.moveTo(0, lineY); ctx.lineTo(W, lineY); ctx.stroke();
    }
    // Reference levels (broadcast-safe zones)
    if (showRefLevels) {
      const lowY = H * (1 - refLow / 255);
      const highY = H * (1 - refHigh / 255);
      ctx.strokeStyle = `rgba(59, 130, 246, ${opacity * 0.8})`;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(0, lowY); ctx.lineTo(W, lowY); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, highY); ctx.lineTo(W, highY); ctx.stroke();
      ctx.setLineDash([]);
      // Labels
      ctx.font = '9px sans-serif';
      ctx.fillStyle = `rgba(59, 130, 246, ${Math.min(1, opacity + 0.2)})`;
      ctx.fillText(`${refLow}`, 3, lowY - 3);
      ctx.fillText(`${refHigh}`, 3, highY + 11);
    }
  }
}
