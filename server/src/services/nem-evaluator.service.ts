/**
 * nem-evaluator.service.ts — NEM (Node Editor Module) Evaluator
 * 
 * Single evaluation contract for preview, export, and thumbnail rendering.
 * 
 * Core principles:
 * - Source + XMP → Node 01 (base state, read-only)
 * - User edits → Node 02+ (cumulative deltas)
 * - Evaluation = serial chain composition (no alternate paths)
 * - Bypass nodes skipped by default
 * 
 * Week 2 Task #3: Wire Node 01 loader → evaluator → render
 */

import { Injectable } from '@nestjs/common';

// TypeScript types matching client-side node-graph-types.ts
interface DevelopState {
  // Basic adjustments
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  temperature: number;
  tint: number;
  vibrance: number;
  saturation: number;
  hue: number;
  clarity: number;
  dehaze: number;

  // Tone curve points (simplified - just master for now)
  curves?: {
    master?: Array<{ x: number; y: number }>;
    red?: Array<{ x: number; y: number }>;
    green?: Array<{ x: number; y: number }>;
    blue?: Array<{ x: number; y: number }>;
  };

  // Curve endpoints (black/white points)
  curveEndpoints?: {
    master?: { black?: { x: number; y: number }; white?: { x: number; y: number } };
    red?: { black?: { x: number; y: number }; white?: { x: number; y: number } };
    green?: { black?: { x: number; y: number }; white?: { x: number; y: number } };
    blue?: { black?: { x: number; y: number }; white?: { x: number; y: number } };
  };

  // Color wheels
  colorWheels?: {
    shadows?: { hue: number; sat: number; lum: number };
    midtones?: { hue: number; sat: number; lum: number };
    highlights?: { hue: number; sat: number; lum: number };
  };

  // HSL adjustments
  hsl?: {
    red?: { h: number; s: number; l: number };
    orange?: { h: number; s: number; l: number };
    yellow?: { h: number; s: number; l: number };
    green?: { h: number; s: number; l: number };
    aqua?: { h: number; s: number; l: number };
    blue?: { h: number; s: number; l: number };
    purple?: { h: number; s: number; l: number };
    magenta?: { h: number; s: number; l: number };
  };

  // Details
  details?: {
    texture?: number;
    sharpness?: number;
    noiseReduction?: number;
    clarity?: number;
  };

  // Effects
  effects?: {
    vignette?: number;
    vignetteMidpoint?: number;
    vignetteRoundness?: number;
    vignetteFeather?: number;
    vignetteHighlights?: number;
    grain?: number;
    grainSize?: number;
    grainRoughness?: number;
    fade?: number;
  };

  // Tone mapping
  toneMapper?: 'none' | 'aces' | 'reinhard' | 'filmic' | 'uncharted';

  // Geometry
  geometry?: {
    rotation?: number;
    distortion?: number;
    vertical?: number;
    horizontal?: number;
    scale?: number;
  };
}

interface Node {
  id: string;
  label: string;
  bypass: boolean;
  position: { x: number; y: number };
  state: DevelopState;
}

interface NodeConnection {
  from: string; // 'input' | node.id
  to: string; // 'output' | node.id
}

interface NodeGraph {
  nodes: Node[];
  connections: NodeConnection[];
}

interface EvalOptions {
  stopAtNodeId?: string;
  includeBypassed?: boolean; // default false
}

interface EvalResult {
  flattenedState: DevelopState;
  evaluatedNodeIds: string[];
  warnings: string[];
}

@Injectable()
export class NemEvaluatorService {
  /**
   * Evaluate node graph into flattened DevelopState
   * 
   * @param graph - Node graph with connections
   * @param opts - Evaluation options
   * @returns Flattened state + metadata
   */
  evaluateNodeGraph(graph: NodeGraph, opts: EvalOptions = {}): EvalResult {
    const warnings: string[] = [];

    // Basic validation
    if (!graph || !graph.nodes || graph.nodes.length === 0) {
      warnings.push('Empty node graph');
      return {
        flattenedState: this.createNeutralDevelopState(),
        evaluatedNodeIds: [],
        warnings,
      };
    }

    // Get linear evaluation order from connections
    const order = this.linearOrderFromConnections(graph);
    const includeBypassed = opts.includeBypassed === true;

    // Optionally stop at specific node
    const selectedOrder = opts.stopAtNodeId
      ? order.slice(0, Math.max(0, order.findIndex((id) => id === opts.stopAtNodeId) + 1))
      : order;

    // Build node lookup
    const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
    const evaluatedNodeIds: string[] = [];
    let flattenedState = this.createNeutralDevelopState();

    // Evaluate nodes in order
    for (const id of selectedOrder) {
      const node = nodeById.get(id);
      if (!node) {
        warnings.push(`Node ${id} not found in graph`);
        continue;
      }

      // Skip bypassed nodes by default
      if (node.bypass && !includeBypassed) {
        continue;
      }

      // Compose state (cumulative deltas)
      flattenedState = this.composeDevelopState(flattenedState, node.state);
      evaluatedNodeIds.push(id);
    }

    return { flattenedState, evaluatedNodeIds, warnings };
  }

  /**
   * Create neutral (zero) DevelopState
   */
  private createNeutralDevelopState(): DevelopState {
    return {
      exposure: 0,
      contrast: 0,
      highlights: 0,
      shadows: 0,
      whites: 0,
      blacks: 0,
      temperature: 6500, // neutral white balance
      tint: 0,
      vibrance: 0,
      saturation: 0,
      hue: 0,
      clarity: 0,
      dehaze: 0,
    };
  }

  /**
   * Extract linear evaluation order from graph connections
   * Follows input → Node A → Node B → output topology
   */
  private linearOrderFromConnections(graph: NodeGraph): string[] {
    const next = new Map<string, string>();
    let first: string | null = null;

    for (const edge of graph.connections) {
      // Find first node (connected from input)
      if (edge.from === 'input' && edge.to !== 'output') {
        first = edge.to;
      }

      // Build chain map
      if (
        edge.from !== 'input' &&
        edge.from !== 'output' &&
        edge.to !== 'input' &&
        edge.to !== 'output'
      ) {
        next.set(edge.from, edge.to);
      }
    }

    // Walk the chain
    const order: string[] = [];
    const seen = new Set<string>();
    let current = first;

    while (current && !seen.has(current)) {
      order.push(current);
      seen.add(current);
      current = next.get(current) ?? null;
    }

    return order;
  }

  /**
   * Compose two DevelopStates (cumulative delta logic)
   * Only non-zero/non-default values from patch override base
   */
  private composeDevelopState(base: DevelopState, patch: DevelopState): DevelopState {
    const result = { ...base };

    // Basic numeric fields (override if patch != 0, except temperature which uses != 6500)
    const numericFields: Array<keyof DevelopState> = [
      'exposure',
      'contrast',
      'highlights',
      'shadows',
      'whites',
      'blacks',
      'tint',
      'vibrance',
      'saturation',
      'hue',
      'clarity',
      'dehaze',
    ];

    for (const field of numericFields) {
      const patchValue = patch[field];
      if (typeof patchValue === 'number' && patchValue !== 0) {
        (result as any)[field] = patchValue;
      }
    }

    // Temperature (neutral = 6500)
    if (patch.temperature !== undefined && patch.temperature !== 6500) {
      result.temperature = patch.temperature;
    }

    // Curves (take patch if defined)
    if (patch.curves) {
      result.curves = { ...base.curves, ...patch.curves };
    }

    // Curve endpoints (take patch if defined)
    if (patch.curveEndpoints) {
      result.curveEndpoints = {
        ...base.curveEndpoints,
        ...patch.curveEndpoints,
      };
    }

    // Color wheels (merge per-wheel)
    if (patch.colorWheels) {
      result.colorWheels = {
        shadows: this.mergeColorWheel(base.colorWheels?.shadows, patch.colorWheels.shadows),
        midtones: this.mergeColorWheel(base.colorWheels?.midtones, patch.colorWheels.midtones),
        highlights: this.mergeColorWheel(base.colorWheels?.highlights, patch.colorWheels.highlights),
      };
    }

    // HSL (merge per-channel)
    if (patch.hsl) {
      result.hsl = { ...base.hsl };
      for (const [color, values] of Object.entries(patch.hsl)) {
        if (values && (values.h !== 0 || values.s !== 0 || values.l !== 0)) {
          result.hsl![color as keyof typeof result.hsl] = { ...values };
        }
      }
    }

    // Details (merge if any non-zero)
    if (patch.details) {
      result.details = { ...base.details, ...patch.details };
    }

    // Effects (merge if any non-zero)
    if (patch.effects) {
      result.effects = { ...base.effects, ...patch.effects };
    }

    // Tone mapper (override if set)
    if (patch.toneMapper && patch.toneMapper !== 'none') {
      result.toneMapper = patch.toneMapper;
    }

    // Geometry (merge if any non-zero)
    if (patch.geometry) {
      result.geometry = { ...base.geometry, ...patch.geometry };
    }

    return result;
  }

  /**
   * Merge color wheel values (only override non-zero)
   */
  private mergeColorWheel(
    base: { hue: number; sat: number; lum: number } | undefined,
    patch: { hue: number; sat: number; lum: number } | undefined,
  ): { hue: number; sat: number; lum: number } {
    const defaultWheel = { hue: 0, sat: 0, lum: 0 };
    if (!patch) return base || defaultWheel;
    if (!base) return patch;

    return {
      hue: patch.hue !== 0 ? patch.hue : base.hue,
      sat: patch.sat !== 0 ? patch.sat : base.sat,
      lum: patch.lum !== 0 ? patch.lum : base.lum,
    };
  }
}
