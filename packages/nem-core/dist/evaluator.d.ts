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
import type { NodeGraph, EvalOptions, EvalResult } from './types';
/**
 * Evaluate a node graph into a single flattened DevelopState
 *
 * @param graph - Node graph to evaluate
 * @param opts - Evaluation options
 * @returns Flattened state + metadata
 */
export declare function evaluateNodeGraph(graph: NodeGraph, opts?: EvalOptions): EvalResult;
