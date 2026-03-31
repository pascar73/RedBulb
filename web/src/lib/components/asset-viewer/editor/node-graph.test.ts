// node-graph.test.ts
import { describe, it, expect } from 'vitest';
import type { NodeGraph, EvalOptions, EvalResult } from './node-graph-types';
import type { DevelopState } from './node-types';
import { createEmptyDevelopState, createDefaultGeometry } from './node-types';
import { validateGraph } from './node-graph-validate';
import { evaluateNodeGraph } from './node-graph-evaluate';
import { migrateDevelopToNodeGraph } from './node-graph-migrate';

/**
 * Helpers - creates a state with ONLY the specified fields modified
 */
function makeState(patch: Record<string, number>): DevelopState {
  const base = createEmptyDevelopState();
  
  // Apply patches to the appropriate category
  const basic = { ...base.basic };
  const color = { ...base.color };
  const details = { ...base.details };
  
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'exposure' || key === 'contrast' || key === 'shadows' || key === 'highlights' || key === 'whites' || key === 'blacks' || key === 'brightness') {
      (basic as any)[key] = value;
    } else if (key === 'saturation' || key === 'temperature' || key === 'tint' || key === 'vibrance') {
      (color as any)[key] = value;
    } else if (key === 'sharpness' || key === 'noiseReduction' || key === 'clarity' || key === 'dehaze' || key === 'caCorrection') {
      (details as any)[key] = value;
    }
  }
  
  return {
    ...base,
    basic,
    color,
    details,
  };
}

function makeSerialGraph(): NodeGraph {
  return {
    version: 2,
    selectedNodeId: 'N2',
    nodes: [
      { id: 'N1', label: 'N1', bypass: false, state: makeState({ exposure: 0.2, contrast: 5 }), position: { x: 80, y: 60 } },
      { id: 'N2', label: 'N2', bypass: false, state: makeState({ exposure: 0.8, saturation: 10 }), position: { x: 230, y: 60 } },
      { id: 'N3', label: 'N3', bypass: false, state: makeState({ shadows: -6 }), position: { x: 380, y: 60 } },
    ],
    connections: [
      { from: 'input', to: 'N1' },
      { from: 'N1', to: 'N2' },
      { from: 'N2', to: 'N3' },
      { from: 'N3', to: 'output' },
    ],
    geometry: createDefaultGeometry(),
  };
}

/**
 * Optional render/hash hook placeholders.
 * Replace with real preview/export calls when wiring integration tests.
 */
function fakeRenderHashFromState(state: DevelopState): string {
  return JSON.stringify(state); // deterministic placeholder
}

describe('Node Graph v2 acceptance tests', () => {
  it('1) Serial apply deterministic', () => {
    const g = makeSerialGraph();
    const res = evaluateNodeGraph(g);

    // last-writer-wins for "exposure" (N2 overrides N1)
    expect(res.flattenedState.basic.exposure).toBe(0.8);
    expect(res.flattenedState.basic.contrast).toBe(5);
    expect(res.flattenedState.color.saturation).toBe(10);
    expect(res.flattenedState.basic.shadows).toBe(-6); // N3 has shadows in basic
    expect(res.evaluatedNodeIds).toEqual(['N1', 'N2', 'N3']);
    expect(res.warnings.length).toBe(0);
  });

  it('2) Bypass behavior changes evaluated chain/output', () => {
    const g = makeSerialGraph();
    const before = evaluateNodeGraph(g);

    g.nodes.find((n) => n.id === 'N2')!.bypass = true;
    const after = evaluateNodeGraph(g);

    expect(before.evaluatedNodeIds).toEqual(['N1', 'N2', 'N3']);
    expect(after.evaluatedNodeIds).toEqual(['N1', 'N3']);

    // exposure should now come from N1 instead of N2
    expect(before.flattenedState.basic.exposure).toBe(0.8);
    expect(after.flattenedState.basic.exposure).toBe(0.2);
  });

  it('3) Persistence integrity (graph + output stable after reopen)', () => {
    const g = makeSerialGraph();

    // Simulate save/reopen by serialize/deserialize
    const saved = JSON.stringify(g);
    const reopened = JSON.parse(saved) as NodeGraph;

    const a = evaluateNodeGraph(g);
    const b = evaluateNodeGraph(reopened);

    expect(reopened).toEqual(g);
    expect(b.flattenedState).toEqual(a.flattenedState);
    expect(fakeRenderHashFromState(b.flattenedState)).toEqual(fakeRenderHashFromState(a.flattenedState));
  });

  it('4) Selected-node preview via stopAtNodeId', () => {
    const g = makeSerialGraph();

    const upToN2 = evaluateNodeGraph(g, { stopAtNodeId: 'N2' });
    expect(upToN2.evaluatedNodeIds).toEqual(['N1', 'N2']);
    expect(upToN2.flattenedState.basic.exposure).toBe(0.8);
    expect(upToN2.flattenedState.basic.contrast).toBe(5);
    expect(upToN2.flattenedState.color.saturation).toBe(10);
    // N3's shadows should not be applied
    expect(upToN2.flattenedState.basic.shadows).toBe(0);
  });

  it('5) Empty graph safety (identity/no crash)', () => {
    const g: NodeGraph = {
      version: 2,
      selectedNodeId: '',
      nodes: [],
      connections: [],
      geometry: createDefaultGeometry(),
    };

    const validation = validateGraph(g);
    const res = evaluateNodeGraph(g);

    // Evaluator should return safe empty state
    expect(res).toBeDefined();
    expect(res.flattenedState).toBeDefined();
    expect(Array.isArray(res.evaluatedNodeIds)).toBe(true);
    // Empty graph fails validation (no input->output path)
    expect(validation.valid).toBe(false);
  });

  it('6) Cycle rejection (validator catches cycle, evaluator safe fallback)', () => {
    const g = makeSerialGraph();
    // inject cycle N3 -> N1
    g.connections.splice(g.connections.length - 1, 0, { from: 'N3', to: 'N1' });

    const v = validateGraph(g);
    const res = evaluateNodeGraph(g);

    expect(v.valid).toBe(false);
    expect(v.errors.join(' | ')).toMatch(/Cycle/i);
    expect(res.flattenedState).toEqual(createEmptyDevelopState());
    expect(res.evaluatedNodeIds).toEqual([]);
    expect(res.warnings.length).toBeGreaterThan(0);
  });

  it('7) Duplicate edge handling (rejected/deterministic)', () => {
    const g = makeSerialGraph();
    g.connections.push({ from: 'N1', to: 'N2' }); // duplicate

    const v = validateGraph(g);
    const res = evaluateNodeGraph(g);

    expect(v.valid).toBe(false);
    expect(v.errors.join(' | ')).toMatch(/Duplicate/i);
    // evaluator should not explode; should return safe fallback with warnings
    expect(res.flattenedState).toEqual(createEmptyDevelopState());
    expect(res.warnings.length).toBeGreaterThan(0);
  });

  it('8) Migration idempotency (legacy migrates once only)', () => {
    const legacyPayload = {
      panelState: makeState({ exposure: 0.33, contrast: 7 }),
      geometry: createDefaultGeometry(),
    };

    const m1 = migrateDevelopToNodeGraph(legacyPayload);
    expect(m1.migrated).toBe(true);
    expect(m1.payload.nodeGraph?.version).toBe(2);

    const m2 = migrateDevelopToNodeGraph(m1.payload);
    expect(m2.migrated).toBe(false);
    expect(m2.payload.nodeGraph).toEqual(m1.payload.nodeGraph);
  });

  it('9) Preview/export parity on flattenedState (shared evaluator contract)', () => {
    const g = makeSerialGraph();

    // Placeholder: both paths call same evaluator for now
    const previewEval = evaluateNodeGraph(g, {});
    const exportEval = evaluateNodeGraph(g, {});

    expect(exportEval.flattenedState).toEqual(previewEval.flattenedState);
    expect(exportEval.evaluatedNodeIds).toEqual(previewEval.evaluatedNodeIds);
  });

  it('10) Undo/redo coherence (state+bypass+selection)', () => {
    const g = makeSerialGraph();

    const snapshot1 = JSON.stringify(g);

    // "do"
    g.nodes.find((n) => n.id === 'N2')!.state = makeState({ exposure: 1.25 });
    g.nodes.find((n) => n.id === 'N3')!.bypass = true;
    g.selectedNodeId = 'N3';

    const changed = evaluateNodeGraph(g);
    expect(changed.flattenedState.basic.exposure).toBe(1.25);
    expect(changed.evaluatedNodeIds).toEqual(['N1', 'N2']);

    // "undo"
    const restored = JSON.parse(snapshot1) as NodeGraph;
    const undone = evaluateNodeGraph(restored);

    expect(restored.selectedNodeId).toBe('N2');
    expect(restored.nodes.find((n) => n.id === 'N3')!.bypass).toBe(false);
    expect(undone.flattenedState.basic.exposure).toBe(0.8);
    expect(undone.evaluatedNodeIds).toEqual(['N1', 'N2', 'N3']);
  });

  it('11) HSL retained from earlier node when later node is default', () => {
    const g = makeSerialGraph();
    
    // N1 sets red hue to 10
    g.nodes[0].state.hsl = { red: { h: 10, s: 0, l: 0 } };
    // N2 has default HSL (all zeros)
    g.nodes[1].state.hsl = {};
    // N3 has default HSL
    g.nodes[2].state.hsl = {};
    
    const res = evaluateNodeGraph(g);
    
    // Red hue from N1 should be retained (not overwritten by N2/N3 defaults)
    expect(res.flattenedState.hsl.red?.h).toBe(10);
  });

  it('12) Curve endpoint changes propagate', () => {
    const g = makeSerialGraph();
    
    // N1 sets master black point
    g.nodes[0].state.curveEndpoints = {
      master: { black: { x: 0.1, y: 0.05 }, white: { x: 1, y: 1 } },
      red: { black: { x: 0, y: 0 }, white: { x: 1, y: 1 } },
      green: { black: { x: 0, y: 0 }, white: { x: 1, y: 1 } },
      blue: { black: { x: 0, y: 0 }, white: { x: 1, y: 1 } },
    };
    
    // N2 has default endpoints (should not overwrite N1)
    // N3 has default endpoints
    
    const res = evaluateNodeGraph(g);
    
    // N1's master black point should be retained
    expect(res.flattenedState.curveEndpoints.master.black.x).toBe(0.1);
    expect(res.flattenedState.curveEndpoints.master.black.y).toBe(0.05);
  });

  it('13) Type-check: All types compile correctly', () => {
    // This test ensures TypeScript compilation succeeds
    // If there are type errors, the test file won't compile
    const g = makeSerialGraph();
    const opts: EvalOptions = { stopAtNodeId: 'N1', includeBypassed: false };
    const result: EvalResult = evaluateNodeGraph(g, opts);
    
    // Type assertions
    expect(typeof result.flattenedState).toBe('object');
    expect(Array.isArray(result.evaluatedNodeIds)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('14) Earlier non-default effect survives later default node', () => {
    const g = makeSerialGraph();
    
    // N1 sets vignetteMidpoint to 70 (non-default, default is 50)
    g.nodes[0].state.effects = {
      texture: 0,
      vignette: 0,
      vignetteMidpoint: 70,
      vignetteRoundness: 0,
      vignetteFeather: 50, // default
      vignetteHighlights: 0,
      grain: 0,
      grainSize: 25, // default
      grainRoughness: 50, // default
      fade: 0,
    };
    
    // N2 has default effects (vignetteMidpoint=50)
    g.nodes[1].state.effects = {
      texture: 0,
      vignette: 0,
      vignetteMidpoint: 50, // default
      vignetteRoundness: 0,
      vignetteFeather: 50,
      vignetteHighlights: 0,
      grain: 0,
      grainSize: 25,
      grainRoughness: 50,
      fade: 0,
    };
    
    const res = evaluateNodeGraph(g);
    
    // N1's vignetteMidpoint=70 should survive (not overwritten by N2's default 50)
    expect(res.flattenedState.effects.vignetteMidpoint).toBe(70);
  });

  it('15) Disconnected node graph emits explicit warning', () => {
    const g = makeSerialGraph();
    
    // Create a disconnected node (not on input→output chain)
    const disconnectedNode = {
      id: 'N_ORPHAN',
      label: 'Orphan',
      bypass: false,
      position: { x: 500, y: 100 },
      state: createEmptyDevelopState(),
    };
    g.nodes.push(disconnectedNode);
    
    // No edges connect N_ORPHAN to anything
    
    const validation = validateGraph(g);
    
    // Should emit warning (not error, since main chain is still valid)
    expect(validation.warnings.length).toBeGreaterThan(0);
    expect(validation.warnings.some(w => w.includes('N_ORPHAN'))).toBe(true);
    expect(validation.warnings.some(w => w.includes('disconnected'))).toBe(true);
  });
});
