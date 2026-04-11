/**
 * node-graph-evaluate.ts — Evaluate node graph using nem-core (direct, no adapter)
 * 
 * P3-2: Removed adapter layer — web now uses flat DevelopState directly
 */

import type { NodeGraph, EvalResult, EvalOptions } from './node-graph-types';
import type { DevelopState, Node as CoreNode } from '@redbulb/nem-core';
import { evaluateNodeGraph as coreEvaluate, createNeutralDevelopState } from '@redbulb/nem-core';
import { validateGraph } from './node-graph-validate';

/**
 * Evaluate node graph using nem-core directly (P3-2: no adapter)
 */
export function evaluateNodeGraph(
  graph: NodeGraph,
  opts: EvalOptions = {}
): EvalResult {
  // Validate graph
  const validation = validateGraph(graph);
  if (!validation.valid) {
    return {
      flattenedState: createNeutralDevelopState() as DevelopState,
      evaluatedNodeIds: [],
      warnings: validation.errors,
    };
  }

  // Convert web graph to core graph (direct mapping, no transformation)
  const coreGraph = {
    nodes: graph.nodes.map((node): CoreNode => ({
      id: node.id,
      label: node.label,
      state: node.state,
      bypass: node.bypass ?? false,
      position: node.position,
    })),
    connections: graph.connections,
  };

  // Evaluate using nem-core
  const coreResult = coreEvaluate(coreGraph, opts);

  // Return directly (flat structure compatible)
  return {
    flattenedState: coreResult.flattenedState as DevelopState,
    evaluatedNodeIds: coreResult.evaluatedNodeIds,
    warnings: coreResult.warnings,
  };
}
