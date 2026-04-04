/**
 * node-graph-evaluate.ts — Web client wrapper for @redbulb/nem-core evaluation
 * 
 * This module bridges web client types to the shared NEM core evaluator.
 * Uses adapter to convert between nested (web) and flat (core) DevelopState structures.
 * 
 * Week 3 Block 1C: Migrated to use @redbulb/nem-core via adapter
 * 
 * LEGACY STATUS: All previous local evaluation logic removed (commit e0b59b659).
 * No legacy code path remains. All evaluation goes through shared @redbulb/nem-core.
 * 
 * TODO (Phase 1 - Block 2): Remove adapter layer after web DevelopState type unification.
 */

import type { EvalOptions, EvalResult, Node, NodeGraph } from './node-graph-types';
import type { DevelopState } from './node-types';
import { createEmptyDevelopState } from './node-types';
import { validateGraph } from './node-graph-validate';
import { evaluateNodeGraph as evaluateCore } from '@redbulb/nem-core';
import { webToCore, coreToWeb } from '../../../nem-core-adapter';

/**
 * Evaluate node graph using shared NEM core evaluator
 * 
 * Converts web client nested DevelopState to core flat structure,
 * evaluates using shared core logic, then converts result back to web structure.
 * 
 * @param graph - Node graph with web-style nested DevelopState
 * @param opts - Evaluation options
 * @returns Evaluation result with web-style nested DevelopState
 */
export function evaluateNodeGraph(graph: NodeGraph, opts: EvalOptions = {}): EvalResult {
  const warnings: string[] = [];
  
  // Validate graph topology first (web-specific validation)
  const validation = validateGraph(graph);
  if (!validation.valid) {
    warnings.push(...validation.errors.map((e) => `validation: ${e}`));
    return { flattenedState: createEmptyDevelopState(), evaluatedNodeIds: [], warnings };
  }

  // Convert web graph to core graph structure
  const coreGraph = {
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      label: node.label,
      bypass: node.bypass,
      position: node.position,
      state: webToCore(node.state), // Convert nested → flat
    })),
    connections: graph.connections,
  };

  // Evaluate using shared core logic
  const coreResult = evaluateCore(coreGraph, opts);

  // Convert result back to web structure
  return {
    flattenedState: coreToWeb(coreResult.flattenedState), // Convert flat → nested
    evaluatedNodeIds: coreResult.evaluatedNodeIds,
    warnings: [...warnings, ...coreResult.warnings],
  };
}
