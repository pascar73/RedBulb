/**
 * nem-evaluator.service.ts — NEM (Node Editor Module) Evaluator Service
 * 
 * NestJS service wrapper for @redbulb/nem-core evaluation engine.
 * 
 * Single evaluation contract for preview, export, and thumbnail rendering.
 * 
 * Core principles:
 * - Source + XMP → Node 01 (base state, read-only)
 * - User edits → Node 02+ (cumulative deltas)
 * - Evaluation = serial chain composition (no alternate paths)
 * - Bypass nodes skipped by default
 * 
 * Week 3 Block 1B: Migrated to use shared @redbulb/nem-core package
 */

import { Injectable } from '@nestjs/common';
import {
  evaluateNodeGraph,
  type DevelopState,
  type Node,
  type NodeConnection,
  type NodeGraph,
  type EvalOptions,
  type EvalResult,
} from '@redbulb/nem-core';

// Re-export types for backward compatibility with existing server code
export type {
  DevelopState,
  Node,
  NodeConnection,
  NodeGraph,
  EvalOptions,
  EvalResult,
};

/**
 * NestJS service wrapper for NEM core evaluator
 * 
 * This service provides dependency injection compatibility
 * while delegating all evaluation logic to the shared core package.
 */
@Injectable()
export class NemEvaluatorService {
  /**
   * Evaluate node graph into flattened DevelopState
   * 
   * Delegates to shared @redbulb/nem-core evaluateNodeGraph function.
   * 
   * @param graph - Node graph with connections
   * @param opts - Evaluation options
   * @returns Flattened state + metadata
   */
  evaluateNodeGraph(graph: NodeGraph, opts: EvalOptions = {}): EvalResult {
    return evaluateNodeGraph(graph, opts);
  }
}
