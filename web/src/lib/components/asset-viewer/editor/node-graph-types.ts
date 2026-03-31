/**
 * node-graph-types.ts — Type definitions for node graph processing
 * 
 * Phase 1: Serial chain evaluation with explicit topology
 * Re-exports existing RedBulb types and adds evaluation-specific types.
 */

// Re-export existing RedBulb types
export type {
  DevelopState,
  GeometryState,
  CorrectorNode as Node,
  NodeConnection as Edge,
  NodeGraphV2 as NodeGraph,
} from './node-types';

// Evaluation-specific types
export type NodeId = string;
export type Endpoint = NodeId | 'input' | 'output';

export interface GraphValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface EvalOptions {
  stopAtNodeId?: NodeId;
  includeBypassed?: boolean; // default false
}

export interface EvalResult {
  flattenedState: DevelopState;
  evaluatedNodeIds: NodeId[];
  warnings: string[];
}
