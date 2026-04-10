# darktable Module Port — Development Plan

**Date:** 2026-03-26
**Baseline:** commit `880852ba6` (tag: `pre-darktable-port`)
**Backup:** `/mnt/qnap-openclaw/ClawBot_001/backups/redbulb-pre-darktable-port/`

## Overview

Port 4 high-value darktable image processing algorithms to RedBulb's Web Worker pipeline.
All algorithms run in `preview-worker.ts` — zero impact on main thread.

## Current Architecture

```
Image → CSS ctx.filter (exposure/contrast/brightness) → Canvas
      → Web Worker (curves LUT → HSL → color grading) → putImageData
      → CSS overlays (vignette radial-gradient, grain canvas)
```

**Problem:** CSS `ctx.filter` is a crude approximation. `blur()` for noise reduction, `sepia()` for temperature, `contrast()` for clarity — these are toy implementations. The sliders exist but the math behind them is placeholder.

## Port Order & Rationale

### Module 1: Dehaze (Dark Channel Prior)
**Source:** `darktable/src/iop/hazeremoval.c` (He et al. 2011)
**Target:** New function in `preview-worker.ts`
**Difficulty:** ★★☆ Medium
**Why first:** Self-contained algorithm, clear visual impact, our dehaze slider currently just tweaks contrast/saturation.

**Algorithm:**
1. Compute dark channel: `min(R,G,B)` over a local patch
2. Estimate atmospheric light `A` from brightest pixels of dark channel
3. Estimate transmission map `t(x)` from dark channel + A
4. Recover scene: `J(x) = (I(x) - A) / max(t(x), t0) + A`
5. Refine transmission with guided filter (edge-aware smoothing)

**Simplifications for Web Worker:**
- Fixed patch size (15px) instead of adaptive
- Simple box filter instead of OpenCL min filter
- Skip guided filter in v1, add in v2 if needed (expensive)
- Use `dehaze` slider (0-1) to control `strength` parameter

**Files changed:**
- `preview-worker.ts` — add `applyDehaze()` function
- `preview-canvas.svelte` — pass dehaze param to worker, remove CSS hack
- `preview-worker.ts` interface — add `dehaze: number`

### Module 2: Diffuse/Sharpen (Clarity + Sharpness + Noise Reduction)
**Source:** `darktable/src/iop/diffuse.c` (PDE-based)
**Target:** New function in `preview-worker.ts`
**Difficulty:** ★★★ Hard
**Why second:** Replaces 3 placeholder sliders with real algorithms. Biggest quality leap.

**Algorithm (simplified for real-time):**
- **Clarity:** Local contrast via unsharp mask at large radius
  - `clarity_output = pixel + amount * (pixel - blur(pixel, large_radius))`
  - darktable uses wavelets, we'll use fast box blur (3-pass = Gaussian approx)
- **Sharpness:** Unsharp mask at small radius
  - `sharp_output = pixel + amount * (pixel - blur(pixel, small_radius))`
- **Noise Reduction:** Edge-aware blur (bilateral filter approximation)
  - For each pixel, average neighbours where `|color_diff| < threshold`
  - Threshold controlled by `noiseReduction` slider

**Why not full PDE:** darktable's diffuse.c solves heat equations iteratively — way too slow for real-time preview in JS. Unsharp mask + bilateral filter gives 80% of the quality at 1% of the cost.

**Files changed:**
- `preview-worker.ts` — add `applyClarity()`, `applySharpen()`, `applyDenoise()`
- `preview-canvas.svelte` — pass params to worker, remove CSS `blur()` hacks
- `preview-worker.ts` interface — add `clarity`, `sharpness`, `noiseReduction`, `texture`

### Module 3: Chromatic Aberration Correction
**Source:** `darktable/src/iop/cacorrectrgb.c`
**Target:** New function in `preview-worker.ts` + new UI controls
**Difficulty:** ★★☆ Medium
**Why third:** New capability (not replacing a placeholder). Huge value for vintage lens users.

**Algorithm:**
1. Use green channel as reference (sharpest on most sensors)
2. For each pixel, compare R and B channel edges against G
3. Where R or B extends beyond G edges → chromatic aberration
4. Replace aberrant R/B values with values guided by G channel
5. Use fast guided filter to smooth the correction

**Simplified approach for v1:**
- Detect edge pixels via luminance gradient
- At edges: blend R and B channels toward the G-channel-implied value
- Strength slider controls blend amount
- "Purple fringe" toggle: specifically target purple/green colour shifts at high-contrast edges

**Files changed:**
- `preview-worker.ts` — add `applyChromaticAberration()`
- `develop-manager.svelte.ts` — add `caCorrection` (0-1) and `caPurpleFringe` (bool) state
- `develop-tool.svelte` — add "Lens Corrections" section with CA slider

### Module 4: Color Equalizer (Perceptual HSL)
**Source:** `darktable/src/iop/colorequal.c`
**Target:** Enhanced `applyHSL()` in `preview-worker.ts`
**Difficulty:** ★★☆ Medium
**Why last:** Upgrades existing HSL panel math, not adding new UI (just better results).

**Current problem:** Our HSL works in naive sRGB → HSL → sRGB space. This causes:
- Hue shifts when adjusting saturation (notorious blue→purple problem)
- Luminance jumps when adjusting hue
- Non-perceptual: equal slider moves don't produce equal visual changes

**Algorithm (from darktable):**
1. Convert RGB → JzCzhz (perceptual, hue-linear) or simplified: RGB → OKLab → OKLCh
2. Apply hue/saturation/luminance adjustments in perceptual space
3. Convert back to RGB
4. OKLCh is the modern standard — used by CSS Color Level 4, darktable's colorequal

**Why OKLCh over JzCzhz:** Simpler math (no absolute luminance needed), well-documented, good enough for 8-bit preview. darktable uses JzCzhz but we're in sRGB display space.

**Files changed:**
- `preview-worker.ts` — rewrite `applyHSL()` to use OKLab/OKLCh
- Add helper functions: `srgbToLinear()`, `linearToOklab()`, `oklabToLch()`, inverses
- No UI changes needed — same HSL sliders, better math behind them

## Processing Pipeline (After Port)

```
Image → Canvas
      → Web Worker:
        1. Curves LUT (existing)
        2. Chromatic Aberration correction (NEW — Module 3)
        3. Dehaze (NEW — Module 1)
        4. Clarity / Texture (NEW — Module 2a)
        5. Sharpness (NEW — Module 2b)
        6. Noise Reduction (NEW — Module 2c)
        7. HSL in OKLCh space (UPGRADED — Module 4)
        8. Color Grading (existing)
      → putImageData
      → CSS overlays (vignette, grain — unchanged)
```

**Order matters:**
- CA correction first (fixes optical errors before artistic processing)
- Dehaze early (recovers contrast before other adjustments)
- Clarity/sharpness before HSL (work on luminance structure)
- NR after sharpness (don't sharpen noise)
- HSL and color grading last (artistic colour work)

## Performance Budget

Current worker processes a 2000×1500 image in ~30ms (curves + HSL + color grading).
Target: stay under 150ms total with all new modules. If slow:
- Reduce preview resolution (already capped at 2000px)
- Process at half resolution for interactive scrubbing, full for final
- Module-level caching: only re-run modules whose params changed

## Risk Mitigation

1. **Backup exists** at QNAP + git tag `pre-darktable-port`
2. **Each module is a separate commit** — easy to revert individually
3. **Feature flags:** Each module checks `amount > 0` before running (zero-cost when disabled)
4. **No UI changes** for Modules 1, 2, 4 — just better math behind existing sliders
5. **Module 3 (CA) is additive** — new section, doesn't modify existing code
6. **CSS filter fallback removed gradually** — one param at a time, test between

## Build & Deploy

```bash
cd ~/Projects/RedBulb
NODE_OPTIONS="--max-old-space-size=6144" pnpm --filter immich-web build
rsync -av --delete web/build/ /mnt/qnap-openclaw/shared/redbulb-www/
# Restart container via Portainer API
```

## Success Criteria

- [ ] Dehaze slider produces visible haze removal (not just contrast bump)
- [ ] Clarity produces local contrast without halos
- [ ] Sharpness produces real edge enhancement
- [ ] Noise reduction smooths noise while preserving edges
- [ ] HSL hue shifts don't cause unwanted saturation/luminance changes
- [ ] CA correction removes purple fringing on high-contrast edges
- [ ] Total worker processing time < 150ms on 2000px images
- [ ] All existing functionality preserved (curves, color grading, vignette, grain)
