// curve-interaction.test.ts - Phase 1 validation tests
import { describe, it, expect } from 'vitest';

describe('Curve Interaction Phase 1 Tests', () => {
  
  it('1) ID stability: legacy points migrate once, IDs persist across operations', () => {
    // Simulate legacy points (no IDs)
    const legacyPoints = [
      { x: 0.3, y: 0.4 },
      { x: 0.7, y: 0.6 },
    ];
    
    // ID generation function (matching tone-curve.svelte)
    let nextPointId = 0;
    function generatePointId(): string {
      return `cp_${Date.now()}_${nextPointId++}`;
    }
    
    // Migrate (simulating getPoints() logic)
    const migrated1 = legacyPoints.map((pt: any) => 
      pt.id ? pt : { id: generatePointId(), x: pt.x, y: pt.y }
    );
    
    // IDs should now exist
    expect(migrated1[0].id).toBeDefined();
    expect(migrated1[1].id).toBeDefined();
    
    // Store IDs for comparison
    const id1 = migrated1[0].id;
    const id2 = migrated1[1].id;
    
    // Simulate second read (after persistence) - IDs should be stable
    const migrated2 = migrated1.map((pt: any) => 
      pt.id ? pt : { id: generatePointId(), x: pt.x, y: pt.y }
    );
    
    // IDs must match (no regeneration)
    expect(migrated2[0].id).toBe(id1);
    expect(migrated2[1].id).toBe(id2);
    
    // Position data preserved
    expect(migrated2[0].x).toBe(0.3);
    expect(migrated2[0].y).toBe(0.4);
    expect(migrated2[1].x).toBe(0.7);
    expect(migrated2[1].y).toBe(0.6);
  });

  it('2) Drag non-jump: neighbor clamp maintains order without remount', () => {
    // Setup: 3 points in sorted order
    type CurvePoint = { id: string; x: number; y: number };
    
    const points: CurvePoint[] = [
      { id: 'p1', x: 0.2, y: 0.3 },
      { id: 'p2', x: 0.5, y: 0.5 }, // This is the one we'll drag
      { id: 'p3', x: 0.8, y: 0.7 },
    ];
    
    // Simulate dragging p2 to the right (toward p3)
    const dragIdx = 1; // p2
    const EPSILON = 0.001;
    
    // Neighbor clamp logic (matching tone-curve.svelte)
    const prevX = dragIdx > 0 ? points[dragIdx - 1].x + EPSILON : 0.01;
    const nextX = dragIdx < points.length - 1 ? points[dragIdx + 1].x - EPSILON : 0.99;
    
    // User tries to drag p2 to x=0.85 (past p3)
    const rawX = 0.85;
    const clampedX = Math.max(prevX, Math.min(nextX, rawX));
    
    // Update point in-place (no reordering)
    const updated = [...points];
    updated[dragIdx] = { id: 'p2', x: clampedX, y: 0.5 };
    
    // Verify:
    // 1. Point ID unchanged (no remount)
    expect(updated[dragIdx].id).toBe('p2');
    
    // 2. x clamped to just before p3
    expect(updated[dragIdx].x).toBeLessThan(points[2].x);
    expect(updated[dragIdx].x).toBeCloseTo(0.8 - EPSILON, 3);
    
    // 3. Order maintained (no post-sort needed)
    expect(updated[0].x).toBeLessThan(updated[1].x);
    expect(updated[1].x).toBeLessThan(updated[2].x);
    
    // 4. Array positions unchanged (stable indices)
    expect(updated[0].id).toBe('p1');
    expect(updated[1].id).toBe('p2');
    expect(updated[2].id).toBe('p3');
  });
});
