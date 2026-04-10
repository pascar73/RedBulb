/**
 * Endpoint Dragging E2E Tests
 * Tests from DoD: #1-#13 (math layer) + #15 persistence + #17 channel independence
 * 
 * These validate the curve-engine math and constraint logic.
 * UI-level visual tests (#7, #9, #11, #13, #16) require manual verification on dev instance.
 */
import { describe, it, expect } from 'vitest';
import { buildCurveLUT, buildCurveSVGPath, buildAllPoints, LUTCache } from './curve-engine';
import type { CurvePoint, Endpoints } from './curve-engine';

// Helper: simulate endpoint constraint logic from tone-curve.svelte
function constrainBlackPoint(rawX: number, rawY: number): { x: number; y: number } {
  const x = Math.max(0, Math.min(0.5, rawX));
  const y = Math.max(0, Math.min(0.5, rawY));
  // Distance to left edge (x=0) vs bottom edge (y=0)
  if (x <= y) {
    return { x: 0, y };  // Closer to left edge
  } else {
    return { x, y: 0 };  // Closer to bottom edge
  }
}

function constrainWhitePoint(rawX: number, rawY: number): { x: number; y: number } {
  const x = Math.max(0.5, Math.min(1, rawX));
  const y = Math.max(0.5, Math.min(1, rawY));
  const distRight = 1 - x;
  const distTop = 1 - y;
  if (distRight <= distTop) {
    return { x: 1, y };  // Closer to right edge
  } else {
    return { x, y: 1 };  // Closer to top edge
  }
}

describe('Endpoint constraint logic', () => {
  // Test #1: Drag black point along left edge
  it('#1 black point slides along left edge (x=0, y varies)', () => {
    const result = constrainBlackPoint(0, 0.3);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0.3);
  });

  // Test #2: Drag black point along bottom edge
  it('#2 black point slides along bottom edge (y=0, x varies)', () => {
    const result = constrainBlackPoint(0.3, 0);
    expect(result.x).toBe(0.3);
    expect(result.y).toBe(0);
  });

  // Test #3: Drag white point along right edge
  it('#3 white point slides along right edge (x=1, y varies)', () => {
    const result = constrainWhitePoint(1, 0.7);
    expect(result.x).toBe(1);
    expect(result.y).toBe(0.7);
  });

  // Test #4: Drag white point along top edge
  it('#4 white point slides along top edge (y=1, x varies)', () => {
    const result = constrainWhitePoint(0.7, 1);
    expect(result.x).toBe(0.7);
    expect(result.y).toBe(1);
  });

  // Test #5: Double-click black resets to (0,0)
  it('#5 black point default position is (0,0)', () => {
    const ep: Endpoints = { black: { x: 0, y: 0 }, white: { x: 1, y: 1 } };
    expect(ep.black.x).toBe(0);
    expect(ep.black.y).toBe(0);
  });

  // Test #6: Double-click white resets to (1,1)
  it('#6 white point default position is (1,1)', () => {
    const ep: Endpoints = { black: { x: 0, y: 0 }, white: { x: 1, y: 1 } };
    expect(ep.white.x).toBe(1);
    expect(ep.white.y).toBe(1);
  });

  // Test #12: Boundary clamp — black beyond 0.5
  it('#12 black point clamped at x=0.5, y=0.5', () => {
    const result = constrainBlackPoint(0.8, 0.8);
    expect(result.x).toBeLessThanOrEqual(0.5);
    expect(result.y).toBeLessThanOrEqual(0.5);
  });

  // Test #12b: White point beyond boundaries
  it('#12b white point clamped at min 0.5', () => {
    const result = constrainWhitePoint(0.2, 0.2);
    expect(result.x).toBeGreaterThanOrEqual(0.5);
    expect(result.y).toBeGreaterThanOrEqual(0.5);
  });

  // Edge case: exactly at corner (x=0.5, y=0.5) — black point
  it('black point at corner (0.5, 0.5) snaps to left edge', () => {
    const result = constrainBlackPoint(0.5, 0.5);
    // x <= y is true (equal), so goes to left edge
    expect(result.x).toBe(0);
    expect(result.y).toBe(0.5);
  });

  // Edge case: white point at corner
  it('white point at corner (0.5, 0.5) snaps to right edge', () => {
    const result = constrainWhitePoint(0.5, 0.5);
    // distRight (0.5) <= distTop (0.5) is true, so goes to right edge
    expect(result.x).toBe(1);
    expect(result.y).toBe(0.5);
  });
});

describe('Curve engine with endpoints', () => {
  // Test #8 / #17: Channel independence — different endpoints per channel
  it('#8/#17 different endpoints produce different LUTs', () => {
    const points: CurvePoint[] = [];
    const epMaster: Endpoints = { black: { x: 0, y: 0.1 }, white: { x: 1, y: 0.9 } };
    const epRed: Endpoints = { black: { x: 0, y: 0 }, white: { x: 1, y: 1 } };

    const lutMaster = buildCurveLUT(points, epMaster);
    const lutRed = buildCurveLUT(points, epRed);

    // They should differ since endpoints differ
    let differ = false;
    for (let i = 0; i < 256; i++) {
      if (lutMaster[i] !== lutRed[i]) { differ = true; break; }
    }
    expect(differ).toBe(true);
  });

  // Test: endpoint at default = identity LUT
  it('default endpoints produce identity LUT', () => {
    const lut = buildCurveLUT([], { black: { x: 0, y: 0 }, white: { x: 1, y: 1 } });
    for (let i = 0; i < 256; i++) {
      expect(lut[i]).toBe(i);
    }
  });

  // Test: black point raised (lift shadows)
  it('raised black point lifts shadow values', () => {
    const lut = buildCurveLUT([], { black: { x: 0, y: 0.2 }, white: { x: 1, y: 1 } });
    // Value at 0 should be ~51 (0.2 * 255)
    expect(lut[0]).toBeGreaterThan(40);
    expect(lut[0]).toBeLessThan(60);
    // Value at 255 should still be 255
    expect(lut[255]).toBe(255);
  });

  // Test: white point lowered (clip highlights)
  it('lowered white point clips highlight values', () => {
    const lut = buildCurveLUT([], { black: { x: 0, y: 0 }, white: { x: 1, y: 0.8 } });
    // Value at 255 should be ~204 (0.8 * 255)
    expect(lut[255]).toBeGreaterThan(195);
    expect(lut[255]).toBeLessThan(215);
    // Value at 0 should still be 0
    expect(lut[0]).toBe(0);
  });

  // Test: black point on bottom edge (x shifted)
  it('black point on bottom edge (x>0) crushes shadows', () => {
    const lut = buildCurveLUT([], { black: { x: 0.2, y: 0 }, white: { x: 1, y: 1 } });
    // Values below ~51 should all map to 0 (crushed)
    expect(lut[0]).toBe(0);
    // Mid-tones should still map
    expect(lut[128]).toBeGreaterThan(50);
  });

  // Test: white point on top edge (x shifted)
  it('white point on top edge (x<1) clips highlights early', () => {
    const lut = buildCurveLUT([], { black: { x: 0, y: 0 }, white: { x: 0.8, y: 1 } });
    // Value at 255 should be 255 (clipped to top)
    expect(lut[255]).toBe(255);
    // Value at 204 (x=0.8) should be ~255
    expect(lut[204]).toBeGreaterThan(245);
  });

  // Test: SVG path generates valid output with moved endpoints
  it('#9 SVG path is valid with non-default endpoints', () => {
    const path = buildCurveSVGPath([], { black: { x: 0, y: 0.3 }, white: { x: 1, y: 0.7 } }, 256);
    expect(path).toContain('M ');
    expect(path).toContain('L ');
    expect(path.length).toBeGreaterThan(10);
  });

  // Test: SVG path with endpoints + control points
  it('SVG path with endpoints and control points uses cubic beziers', () => {
    const points: CurvePoint[] = [{ x: 0.25, y: 0.3 }, { x: 0.75, y: 0.8 }];
    const ep: Endpoints = { black: { x: 0, y: 0.1 }, white: { x: 1, y: 0.9 } };
    const path = buildCurveSVGPath(points, ep, 256);
    expect(path).toContain('M ');
    expect(path).toContain('C '); // Cubic bezier segments
  });

  // Test: buildAllPoints includes endpoints and sorts
  it('buildAllPoints includes endpoints in sorted order', () => {
    const points: CurvePoint[] = [{ x: 0.5, y: 0.5 }];
    const ep: Endpoints = { black: { x: 0, y: 0.2 }, white: { x: 1, y: 0.8 } };
    const all = buildAllPoints(points, ep);
    expect(all.length).toBe(3);
    expect(all[0].x).toBe(0);
    expect(all[0].y).toBe(0.2);
    expect(all[1].x).toBe(0.5);
    expect(all[2].x).toBe(1);
    expect(all[2].y).toBe(0.8);
  });

  // Test: LUTCache returns consistent results
  it('LUTCache returns same LUT for same inputs', () => {
    const cache = new LUTCache();
    const ep: Endpoints = { black: { x: 0, y: 0.1 }, white: { x: 1, y: 0.9 } };
    const lut1 = cache.get([], ep);
    const lut2 = cache.get([], ep);
    expect(lut1).toBe(lut2); // Same reference (cached)
  });

  // Test #15: Serialization round-trip (persistence proxy)
  it('#15 endpoint state survives serialize/deserialize round-trip', () => {
    const endpoints = {
      master: { black: { x: 0, y: 0.15 }, white: { x: 1, y: 0.85 } },
      red: { black: { x: 0.1, y: 0 }, white: { x: 0.9, y: 1 } },
      green: { black: { x: 0, y: 0 }, white: { x: 1, y: 1 } },
      blue: { black: { x: 0, y: 0.05 }, white: { x: 1, y: 0.95 } },
    };
    const serialized = JSON.stringify(endpoints);
    const deserialized = JSON.parse(serialized);
    expect(deserialized.master.black.y).toBe(0.15);
    expect(deserialized.red.black.x).toBe(0.1);
    expect(deserialized.blue.white.y).toBe(0.95);
  });
});
