/**
 * curve-engine.ts — Pure math for tone curves.
 * Single source of truth: the SAME spline is used for visual SVG paths AND pixel LUTs.
 * No UI, no Svelte, no side effects.
 */

export type CurvePoint = { x: number; y: number };
export type Endpoints = { black: number; white: number };

/**
 * Build the full sorted point array including endpoints.
 */
export function buildAllPoints(
  points: CurvePoint[],
  ep: Endpoints = { black: 0, white: 1 },
): CurvePoint[] {
  return [
    { x: 0, y: ep.black },
    ...points,
    { x: 1, y: ep.white },
  ].sort((a, b) => a.x - b.x);
}

/**
 * Compute monotone cubic hermite tangents (Fritsch-Carlson method).
 * Guarantees no overshoot between control points.
 */
function computeTangents(pts: CurvePoint[]): number[] {
  const n = pts.length;
  if (n < 2) return [0];

  // Step 1: secants
  const delta: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    delta.push(dx === 0 ? 0 : (pts[i + 1].y - pts[i].y) / dx);
  }

  // Step 2: initial tangents (average of adjacent secants)
  const m: number[] = new Array(n);
  m[0] = delta[0];
  m[n - 1] = delta[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (delta[i - 1] * delta[i] <= 0) {
      // Sign change or zero — flat tangent for monotonicity
      m[i] = 0;
    } else {
      m[i] = (delta[i - 1] + delta[i]) / 2;
    }
  }

  // Step 3: Fritsch-Carlson monotonicity correction
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(delta[i]) < 1e-12) {
      // Flat segment
      m[i] = 0;
      m[i + 1] = 0;
    } else {
      const alpha = m[i] / delta[i];
      const beta = m[i + 1] / delta[i];
      // Restrict to circle of radius 3 for monotonicity
      const s = alpha * alpha + beta * beta;
      if (s > 9) {
        const tau = 3 / Math.sqrt(s);
        m[i] = tau * alpha * delta[i];
        m[i + 1] = tau * beta * delta[i];
      }
    }
  }

  return m;
}

/**
 * Evaluate the monotone cubic hermite spline at parameter t ∈ [0,1].
 * Returns y value clamped to [0,1].
 */
function evalSpline(pts: CurvePoint[], tangents: number[], t: number): number {
  const n = pts.length;
  if (n === 0) return t; // identity
  if (n === 1) return pts[0].y;

  // Clamp to domain
  if (t <= pts[0].x) return pts[0].y;
  if (t >= pts[n - 1].x) return pts[n - 1].y;

  // Find segment via binary search
  let lo = 0, hi = n - 2;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pts[mid + 1].x < t) lo = mid + 1;
    else hi = mid;
  }
  const i = lo;

  const p0 = pts[i], p1 = pts[i + 1];
  const dx = p1.x - p0.x;
  if (dx < 1e-12) return p0.y;

  const u = (t - p0.x) / dx;
  const u2 = u * u;
  const u3 = u2 * u;

  // Hermite basis functions
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;

  const y = h00 * p0.y + h10 * (tangents[i] * dx) + h01 * p1.y + h11 * (tangents[i + 1] * dx);
  return Math.max(0, Math.min(1, y));
}

/**
 * Build a 256-entry LUT using the same monotone cubic hermite spline as the SVG path.
 * This is THE function both tone-curve and preview-canvas should use.
 */
export function buildCurveLUT(
  points: CurvePoint[],
  ep: Endpoints = { black: 0, white: 1 },
): Uint8Array {
  const lut = new Uint8Array(256);

  // Fast path: identity
  if (points.length === 0 && ep.black === 0 && ep.white === 1) {
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }

  const allPts = buildAllPoints(points, ep);
  const tangents = computeTangents(allPts);

  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    const y = evalSpline(allPts, tangents, t);
    lut[i] = Math.max(0, Math.min(255, Math.round(y * 255)));
  }

  return lut;
}

/**
 * Generate an SVG path string for the curve.
 * Uses cubic bezier segments derived from the same hermite tangents.
 * SVG_SIZE = coordinate space (default 256).
 */
export function buildCurveSVGPath(
  points: CurvePoint[],
  ep: Endpoints = { black: 0, white: 1 },
  size: number = 256,
): string {
  const allPts = buildAllPoints(points, ep);
  const n = allPts.length;

  if (n < 2) {
    return `M 0,${size} L ${size},0`;
  }

  if (n === 2) {
    const p0 = allPts[0], p1 = allPts[1];
    return `M ${p0.x * size},${(1 - p0.y) * size} L ${p1.x * size},${(1 - p1.y) * size}`;
  }

  const tangents = computeTangents(allPts);

  // Convert hermite tangents to cubic bezier control points
  let path = `M ${allPts[0].x * size},${(1 - allPts[0].y) * size}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = allPts[i];
    const p1 = allPts[i + 1];
    const dx = p1.x - p0.x;

    // Bezier control points from hermite tangents
    const cp1x = p0.x + dx / 3;
    const cp1y = p0.y + tangents[i] * dx / 3;
    const cp2x = p1.x - dx / 3;
    const cp2y = p1.y - tangents[i + 1] * dx / 3;

    path += ` C ${(cp1x * size).toFixed(1)},${((1 - cp1y) * size).toFixed(1)} ${(cp2x * size).toFixed(1)},${((1 - cp2y) * size).toFixed(1)} ${(p1.x * size).toFixed(1)},${((1 - p1.y) * size).toFixed(1)}`;
  }

  return path;
}

/**
 * Simple LUT cache. Avoids rebuilding when curve hasn't changed.
 * Key: serialized points + endpoints. Value: Uint8Array LUT.
 */
export class LUTCache {
  private cache = new Map<string, Uint8Array>();

  private key(points: CurvePoint[], ep: Endpoints): string {
    // Simple fast key — works because values are small floats
    let k = `${ep.black.toFixed(4)},${ep.white.toFixed(4)}`;
    for (const p of points) k += `|${p.x.toFixed(4)},${p.y.toFixed(4)}`;
    return k;
  }

  get(points: CurvePoint[], ep: Endpoints): Uint8Array {
    const k = this.key(points, ep);
    let lut = this.cache.get(k);
    if (!lut) {
      lut = buildCurveLUT(points, ep);
      this.cache.set(k, lut);
      // Keep cache bounded
      if (this.cache.size > 32) {
        const first = this.cache.keys().next().value;
        if (first !== undefined) this.cache.delete(first);
      }
    }
    return lut;
  }

  clear() {
    this.cache.clear();
  }
}
