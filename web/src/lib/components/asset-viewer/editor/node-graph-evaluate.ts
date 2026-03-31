// node-graph-evaluate.ts
import type { EvalOptions, EvalResult, Node, NodeGraph, NodeId } from './node-graph-types';
import type { DevelopState } from './node-types';
import { createEmptyDevelopState } from './node-types';
import { validateGraph } from './node-graph-validate';

export function evaluateNodeGraph(graph: NodeGraph, opts: EvalOptions = {}): EvalResult {
  const warnings: string[] = [];
  const validation = validateGraph(graph);

  if (!validation.valid) {
    warnings.push(...validation.errors.map((e) => `validation: ${e}`));
    return { flattenedState: createEmptyDevelopState(), evaluatedNodeIds: [], warnings };
  }

  const order = linearOrderFromConnections(graph);
  const includeBypassed = opts.includeBypassed === true;

  const selectedOrder = opts.stopAtNodeId
    ? order.slice(0, Math.max(0, order.findIndex((id) => id === opts.stopAtNodeId) + 1))
    : order;

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const evaluatedNodeIds: string[] = [];
  let flattenedState = createEmptyDevelopState();

  for (const id of selectedOrder) {
    const node = nodeById.get(id);
    if (!node) continue;
    if (node.bypass && !includeBypassed) continue;

    flattenedState = composeDevelopState(flattenedState, node.state);
    evaluatedNodeIds.push(id);
  }

  return { flattenedState, evaluatedNodeIds, warnings };
}

function linearOrderFromConnections(graph: NodeGraph): string[] {
  const next = new Map<string, string>();
  let first: string | null = null;

  for (const e of graph.connections) {
    if (e.from === 'input' && e.to !== 'output') first = e.to;
    if (e.from !== 'input' && e.from !== 'output' && e.to !== 'input' && e.to !== 'output') {
      next.set(e.from, e.to);
    }
  }

  const out: string[] = [];
  const seen = new Set<string>();
  let cur = first;
  while (cur && !seen.has(cur)) {
    out.push(cur);
    seen.add(cur);
    cur = next.get(cur) ?? null;
  }
  return out;
}

function composeDevelopState(base: DevelopState, patch: DevelopState): DevelopState {
  // v1: Last-writer-wins per field, but ONLY for active (non-zero/non-default) values
  // This implements "cumulative deltas" - only non-zero params affect the output
  
  function mergeNonZero<T extends Record<string, number>>(baseObj: T, patchObj: T): T {
    const result = { ...baseObj };
    for (const [key, value] of Object.entries(patchObj)) {
      if (value !== 0) {
        (result as any)[key] = value;
      }
    }
    return result;
  }
  
  function mergeColorWheel(base: { hue: number; sat: number; lum: number }, patch: { hue: number; sat: number; lum: number }) {
    return {
      hue: patch.hue !== 0 ? patch.hue : base.hue,
      sat: patch.sat !== 0 ? patch.sat : base.sat,
      lum: patch.lum !== 0 ? patch.lum : base.lum,
    };
  }
  
  // Fix #1: HSL per-channel non-zero merge (prevents data loss)
  function mergeHSL(baseHSL: Record<string, { h: number; s: number; l: number }>, patchHSL: Record<string, { h: number; s: number; l: number }>): Record<string, { h: number; s: number; l: number }> {
    const result = { ...baseHSL };
    for (const [color, values] of Object.entries(patchHSL)) {
      const baseValues = result[color] || { h: 0, s: 0, l: 0 };
      // Only merge if patch has active (non-zero) values
      if (values.h !== 0 || values.s !== 0 || values.l !== 0) {
        result[color] = {
          h: values.h !== 0 ? values.h : baseValues.h,
          s: values.s !== 0 ? values.s : baseValues.s,
          l: values.l !== 0 ? values.l : baseValues.l,
        };
      }
    }
    return result;
  }
  
  // Fix #2: Curve endpoint merge (checks for non-default values)
  function mergeCurveEndpoints(
    base: DevelopState['curveEndpoints'],
    patch: DevelopState['curveEndpoints']
  ): DevelopState['curveEndpoints'] {
    const isDefaultEndpoint = (ep: { black: { x: number; y: number }; white: { x: number; y: number } }) => {
      return ep.black.x === 0 && ep.black.y === 0 && ep.white.x === 1 && ep.white.y === 1;
    };
    
    return {
      master: isDefaultEndpoint(patch.master) ? base.master : patch.master,
      red: isDefaultEndpoint(patch.red) ? base.red : patch.red,
      green: isDefaultEndpoint(patch.green) ? base.green : patch.green,
      blue: isDefaultEndpoint(patch.blue) ? base.blue : patch.blue,
    };
  }
  
  // Fix: Default-aware effects merge (handles non-zero defaults)
  function mergeEffects(base: DevelopState['effects'], patch: DevelopState['effects']): DevelopState['effects'] {
    const DEFAULTS = {
      texture: 0,
      vignette: 0,
      vignetteMidpoint: 50,
      vignetteRoundness: 0,
      vignetteFeather: 50,
      vignetteHighlights: 0,
      grain: 0,
      grainSize: 25,
      grainRoughness: 50,
      fade: 0,
    };
    
    const result = { ...base };
    for (const [key, value] of Object.entries(patch)) {
      const defaultVal = DEFAULTS[key as keyof typeof DEFAULTS];
      // Only merge if patch value differs from default
      if (value !== defaultVal) {
        (result as any)[key] = value;
      }
    }
    return result;
  }
  
  return {
    version: 1,
    basic: mergeNonZero(base.basic, patch.basic),
    color: mergeNonZero(base.color, patch.color),
    toneMapper: patch.toneMapper !== 'none' ? patch.toneMapper : base.toneMapper,
    details: mergeNonZero(base.details, patch.details),
    effects: mergeEffects(base.effects, patch.effects),
    curves: {
      master: patch.curves.master.length > 0 ? patch.curves.master : base.curves.master,
      red: patch.curves.red.length > 0 ? patch.curves.red : base.curves.red,
      green: patch.curves.green.length > 0 ? patch.curves.green : base.curves.green,
      blue: patch.curves.blue.length > 0 ? patch.curves.blue : base.curves.blue,
    },
    curveEndpoints: mergeCurveEndpoints(base.curveEndpoints, patch.curveEndpoints),
    colorWheels: {
      shadows: mergeColorWheel(base.colorWheels.shadows, patch.colorWheels.shadows),
      midtones: mergeColorWheel(base.colorWheels.midtones, patch.colorWheels.midtones),
      highlights: mergeColorWheel(base.colorWheels.highlights, patch.colorWheels.highlights),
    },
    hsl: mergeHSL(base.hsl, patch.hsl),
  };
}
