/**
 * evaluator.ts — Core NEM evaluation engine
 * 
 * Pure TypeScript implementation (no framework dependencies)
 * Can be used in server, web, and desktop applications
 * 
 * Core principles:
 * - Serial chain evaluation (input → Node A → Node B → output)
 * - Cumulative delta composition (only non-zero values override)
 * - Bypass nodes skipped by default
 * - Deterministic output (same graph + input = same output)
 */

import type {
  DevelopState,
  Node,
  NodeGraph,
  EvalOptions,
  EvalResult,
} from './types';
import { createNeutralDevelopState } from './types';

/**
 * Evaluate a node graph into a single flattened DevelopState
 * 
 * @param graph - Node graph to evaluate
 * @param opts - Evaluation options
 * @returns Flattened state + metadata
 */
export function evaluateNodeGraph(graph: NodeGraph, opts: EvalOptions = {}): EvalResult {
  const warnings: string[] = [];

  // Basic validation
  if (!graph || !graph.nodes || graph.nodes.length === 0) {
    warnings.push('Empty node graph');
    return {
      flattenedState: createNeutralDevelopState(),
      evaluatedNodeIds: [],
      warnings,
    };
  }

  // Get linear evaluation order from connections (includes topology warnings)
  const { order, warnings: topologyWarnings } = linearOrderFromConnections(graph);
  warnings.push(...topologyWarnings);
  
  const includeBypassed = opts.includeBypassed === true;

  // Optionally stop at specific node
  const selectedOrder = opts.stopAtNodeId
    ? order.slice(0, Math.max(0, order.findIndex((id) => id === opts.stopAtNodeId) + 1))
    : order;

  // Build node lookup
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const evaluatedNodeIds: string[] = [];
  let flattenedState = createNeutralDevelopState();

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
    flattenedState = composeDevelopState(flattenedState, node.state);
    evaluatedNodeIds.push(id);
  }

  return { flattenedState, evaluatedNodeIds, warnings };
}

/**
 * Topology validation result
 */
interface TopologyResult {
  order: string[];
  warnings: string[];
}

/**
 * Extract linear evaluation order from graph connections
 * Follows: input → Node A → Node B → output
 * 
 * Validates topology and returns warnings for unsupported structures:
 * - Multiple paths from input
 * - Branching (one node → multiple nodes)
 * - Disconnected nodes
 * - Cycles
 * 
 * @param graph - Node graph
 * @returns Evaluation order + topology warnings
 */
function linearOrderFromConnections(graph: NodeGraph): TopologyResult {
  const warnings: string[] = [];
  const next = new Map<string, string>();
  const inputConnections: string[] = [];
  const outgoingCounts = new Map<string, number>();
  const connectedNodes = new Set<string>();

  // First pass: collect topology information
  for (const edge of graph.connections) {
    // Track connections from input
    if (edge.from === 'input' && edge.to !== 'output') {
      inputConnections.push(edge.to);
      connectedNodes.add(edge.to);
    }

    // Build chain map and track branching
    if (
      edge.from !== 'input' &&
      edge.from !== 'output' &&
      edge.to !== 'input' &&
      edge.to !== 'output'
    ) {
      // Only set next if not already set (use first connection for branching)
      if (!next.has(edge.from)) {
        next.set(edge.from, edge.to);
      }
      outgoingCounts.set(edge.from, (outgoingCounts.get(edge.from) ?? 0) + 1);
      connectedNodes.add(edge.from);
      connectedNodes.add(edge.to);
    }
  }

  // Detect branching (not supported in linear chain)
  for (const [nodeId, count] of outgoingCounts) {
    if (count > 1) {
      warnings.push(`Topology: Node ${nodeId} has ${count} outgoing connections (branching not supported, using first connection only)`);
    }
  }

  // Detect multiple input roots
  if (inputConnections.length > 1) {
    warnings.push(`Topology: Multiple nodes connected from input (${inputConnections.length} found, using first: ${inputConnections[0]})`);
  }

  // Use first input connection
  const first = inputConnections[0] ?? null;

  // Walk the chain
  const order: string[] = [];
  const seen = new Set<string>();
  let current: string | null = first;

  while (current) {
    if (seen.has(current)) {
      // Cycle detected
      warnings.push(`Topology: Cycle detected at node ${current} (evaluation stopped)`);
      break;
    }
    order.push(current);
    seen.add(current);
    current = next.get(current) ?? null;
  }

  // Detect disconnected nodes (nodes in graph but not in evaluation order)
  const allNodeIds = new Set(graph.nodes.map((n) => n.id));
  const evaluatedNodeIds = new Set(order);
  const disconnected: string[] = [];
  
  for (const nodeId of allNodeIds) {
    if (!evaluatedNodeIds.has(nodeId) && connectedNodes.has(nodeId)) {
      // Node exists in graph and has connections but not in evaluation chain
      disconnected.push(nodeId);
    }
  }
  
  if (disconnected.length > 0) {
    warnings.push(`Topology: ${disconnected.length} node(s) disconnected from main chain: ${disconnected.join(', ')}`);
  }

  return { order, warnings };
}

/**
 * Compose two DevelopStates (cumulative delta logic)
 * Only non-zero/non-default values from patch override base
 * 
 * @param base - Base state
 * @param patch - Delta to apply
 * @returns Composed state
 */
function composeDevelopState(base: DevelopState, patch: DevelopState): DevelopState {
  const result = { ...base };

  // Basic numeric fields (override if patch != 0, except temperature which uses != 6500)
  const numericFields = [
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
  ] as const;

  for (const field of numericFields) {
    const patchValue = patch[field];
    if (typeof patchValue === 'number' && patchValue !== 0) {
      result[field] = patchValue;
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
      shadows: mergeColorWheel(base.colorWheels?.shadows, patch.colorWheels.shadows),
      midtones: mergeColorWheel(base.colorWheels?.midtones, patch.colorWheels.midtones),
      highlights: mergeColorWheel(base.colorWheels?.highlights, patch.colorWheels.highlights),
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
 * 
 * @param base - Base color wheel
 * @param patch - Patch color wheel
 * @returns Merged color wheel
 */
function mergeColorWheel(
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
