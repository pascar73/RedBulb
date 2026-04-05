/**
 * @redbulb/nem-core
 * 
 * RedBulb Node Editor Module - Core evaluation engine
 * Shared across server, web, and desktop platforms
 */

// Types
export type {
  DevelopState,
  Node,
  NodeConnection,
  NodeGraph,
  EvalOptions,
  EvalResult,
} from './types';

export { createNeutralDevelopState } from './types';

// Evaluator
export { evaluateNodeGraph } from './evaluator';
