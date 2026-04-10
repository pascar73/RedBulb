/**
 * determinism.spec.ts — Determinism verification tests for NEM core
 * 
 * Tests that same input graph + options produces:
 * - Identical output state
 * - Identical evaluatedNodeIds
 * - Identical warnings
 * - Identical hash (for snapshot comparison)
 * 
 * Block 2C Task 8: Deterministic snapshot tests
 */

import { describe, it, expect } from 'vitest';
import { evaluateNodeGraph } from './evaluator';
import { createNeutralDevelopState } from './types';
import type { NodeGraph, Node, EvalResult } from './types';
import { createHash } from 'crypto';

/**
 * Helper: Create a test node
 */
function createNode(id: string, state: any = {}): Node {
  return {
    id,
    type: 'develop',
    state: { ...createNeutralDevelopState(), ...state },
    bypass: false,
  };
}

/**
 * Helper: Compute deterministic hash of evaluation result
 */
function hashEvalResult(result: EvalResult): string {
  // Deep sort all object keys for canonical representation
  const deepSort = (obj: any): any => {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(deepSort);
    }
    const sorted: any = {};
    Object.keys(obj)
      .sort()
      .forEach((key) => {
        sorted[key] = deepSort(obj[key]);
      });
    return sorted;
  };

  const canonical = JSON.stringify(deepSort(result));
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Helper: Deep clone a graph to ensure no mutation affects tests
 */
function cloneGraph(graph: NodeGraph): NodeGraph {
  return JSON.parse(JSON.stringify(graph));
}

describe('determinism verification', () => {
  describe('identical output on repeated evaluation', () => {
    it('produces same output for simple linear chain (10 runs)', () => {
      const graph: NodeGraph = {
        nodes: [
          createNode('A', { exposure: 1.5, contrast: 20 }),
          createNode('B', { temperature: 5500, saturation: 10 }),
        ],
        connections: [
          { from: 'input', to: 'A' },
          { from: 'A', to: 'B' },
          { from: 'B', to: 'output' },
        ],
      };

      const results: EvalResult[] = [];
      for (let i = 0; i < 10; i++) {
        results.push(evaluateNodeGraph(cloneGraph(graph)));
      }

      // All results should be identical
      for (let i = 1; i < results.length; i++) {
        expect(results[i].flattenedState).toEqual(results[0].flattenedState);
        expect(results[i].evaluatedNodeIds).toEqual(results[0].evaluatedNodeIds);
        expect(results[i].warnings).toEqual(results[0].warnings);
      }
    });

    it('produces same hash for identical inputs (100 runs)', () => {
      const graph: NodeGraph = {
        nodes: [
          createNode('A', { exposure: 1.0 }),
          createNode('B', { contrast: 30 }),
          createNode('C', { saturation: 15 }),
        ],
        connections: [
          { from: 'input', to: 'A' },
          { from: 'A', to: 'B' },
          { from: 'B', to: 'C' },
          { from: 'C', to: 'output' },
        ],
      };

      const hashes = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const result = evaluateNodeGraph(cloneGraph(graph));
        hashes.add(hashEvalResult(result));
      }

      // All hashes should be identical (only 1 unique hash)
      expect(hashes.size).toBe(1);
    });

    it('produces same output across different option combinations', () => {
      const graph: NodeGraph = {
        nodes: [
          createNode('A', { exposure: 1.0 }),
          createNode('B', { contrast: 20 }),
        ],
        connections: [
          { from: 'input', to: 'A' },
          { from: 'A', to: 'B' },
          { from: 'B', to: 'output' },
        ],
      };

      // Default options
      const result1 = evaluateNodeGraph(graph);
      const result2 = evaluateNodeGraph(graph, {});
      const result3 = evaluateNodeGraph(graph, { includeBypassed: false });

      expect(result1.flattenedState).toEqual(result2.flattenedState);
      expect(result2.flattenedState).toEqual(result3.flattenedState);
    });
  });

  describe('deterministic composition behavior', () => {
    it('produces same result regardless of intermediate mutations', () => {
      // Create original graph
      const createOriginalGraph = (): NodeGraph => ({
        nodes: [
          createNode('A', { exposure: 1.0, contrast: 20 }),
          createNode('B', { exposure: 0, contrast: 30 }),
        ],
        connections: [
          { from: 'input', to: 'A' },
          { from: 'A', to: 'B' },
          { from: 'B', to: 'output' },
        ],
      });

      // Evaluate multiple times with fresh graphs
      const results: EvalResult[] = [];
      for (let i = 0; i < 5; i++) {
        const graph = createOriginalGraph();
        results.push(evaluateNodeGraph(graph));
      }

      // All results should be identical
      for (let i = 1; i < results.length; i++) {
        expect(results[i].flattenedState).toEqual(results[0].flattenedState);
      }
    });

    it('composition order is deterministic (zero inactive behavior)', () => {
      const graph: NodeGraph = {
        nodes: [
          createNode('A', { exposure: 1.0 }),
          createNode('B', { exposure: 0 }), // Zero doesn't overwrite
          createNode('C', { exposure: 2.0 }),
        ],
        connections: [
          { from: 'input', to: 'A' },
          { from: 'A', to: 'B' },
          { from: 'B', to: 'C' },
          { from: 'C', to: 'output' },
        ],
      };

      const results: EvalResult[] = [];
      for (let i = 0; i < 20; i++) {
        results.push(evaluateNodeGraph(cloneGraph(graph)));
      }

      // All should have exposure=2.0 (from C, last non-zero)
      for (const result of results) {
        expect(result.flattenedState.exposure).toBe(2.0);
      }
    });

    it('temperature exception is deterministic (6500K neutral)', () => {
      const graph: NodeGraph = {
        nodes: [
          createNode('A', { temperature: 5500 }),
          createNode('B', { temperature: 6500 }), // Neutral doesn't overwrite
          createNode('C', { temperature: 7000 }),
        ],
        connections: [
          { from: 'input', to: 'A' },
          { from: 'A', to: 'B' },
          { from: 'B', to: 'C' },
          { from: 'C', to: 'output' },
        ],
      };

      const results: EvalResult[] = [];
      for (let i = 0; i < 20; i++) {
        results.push(evaluateNodeGraph(cloneGraph(graph)));
      }

      // All should have temperature=7000 (from C, last non-6500)
      for (const result of results) {
        expect(result.flattenedState.temperature).toBe(7000);
      }
    });
  });

  describe('deterministic bypass handling', () => {
    it('bypass behavior is consistent across runs', () => {
      const nodeA = createNode('A', { exposure: 1.0 });
      const nodeB = createNode('B', { contrast: 20 });
      nodeB.bypass = true; // Bypassed
      const nodeC = createNode('C', { saturation: 10 });

      const graph: NodeGraph = {
        nodes: [nodeA, nodeB, nodeC],
        connections: [
          { from: 'input', to: 'A' },
          { from: 'A', to: 'B' },
          { from: 'B', to: 'C' },
          { from: 'C', to: 'output' },
        ],
      };

      const results: EvalResult[] = [];
      for (let i = 0; i < 10; i++) {
        results.push(evaluateNodeGraph(cloneGraph(graph)));
      }

      // All should skip B
      for (const result of results) {
        expect(result.evaluatedNodeIds).toEqual(['A', 'C']);
        expect(result.flattenedState.contrast).toBe(0); // B bypassed
      }
    });

    it('includeBypassed option is deterministic', () => {
      const nodeA = createNode('A', { exposure: 1.0 });
      const nodeB = createNode('B', { contrast: 20 });
      nodeB.bypass = true;

      const graph: NodeGraph = {
        nodes: [nodeA, nodeB],
        connections: [
          { from: 'input', to: 'A' },
          { from: 'A', to: 'B' },
          { from: 'B', to: 'output' },
        ],
      };

      const results: EvalResult[] = [];
      for (let i = 0; i < 10; i++) {
        results.push(evaluateNodeGraph(cloneGraph(graph), { includeBypassed: true }));
      }

      // All should include B
      for (const result of results) {
        expect(result.evaluatedNodeIds).toEqual(['A', 'B']);
        expect(result.flattenedState.contrast).toBe(20); // B included
      }
    });
  });

  describe('deterministic stopAtNodeId behavior', () => {
    it('stopAtNodeId produces consistent partial evaluation', () => {
      const graph: NodeGraph = {
        nodes: [
          createNode('A', { exposure: 1.0 }),
          createNode('B', { contrast: 20 }),
          createNode('C', { saturation: 10 }),
        ],
        connections: [
          { from: 'input', to: 'A' },
          { from: 'A', to: 'B' },
          { from: 'B', to: 'C' },
          { from: 'C', to: 'output' },
        ],
      };

      const results: EvalResult[] = [];
      for (let i = 0; i < 10; i++) {
        results.push(evaluateNodeGraph(cloneGraph(graph), { stopAtNodeId: 'B' }));
      }

      // All should stop at B (include A and B, exclude C)
      for (const result of results) {
        expect(result.evaluatedNodeIds).toEqual(['A', 'B']);
        expect(result.flattenedState.exposure).toBe(1.0); // From A
        expect(result.flattenedState.contrast).toBe(20); // From B
        expect(result.flattenedState.saturation).toBe(0); // C not evaluated
      }
    });
  });

  describe('deterministic warning generation', () => {
    it('warnings are consistent for branching graphs', () => {
      const graph: NodeGraph = {
        nodes: [
          createNode('A'),
          createNode('B'),
          createNode('C'),
        ],
        connections: [
          { from: 'input', to: 'A' },
          { from: 'A', to: 'B' },
          { from: 'A', to: 'C' }, // Branching
          { from: 'B', to: 'output' },
        ],
      };

      const warningsSets: string[][] = [];
      for (let i = 0; i < 10; i++) {
        const result = evaluateNodeGraph(cloneGraph(graph));
        warningsSets.push(result.warnings);
      }

      // All warning arrays should be identical
      for (let i = 1; i < warningsSets.length; i++) {
        expect(warningsSets[i]).toEqual(warningsSets[0]);
      }
    });

    it('warnings are consistent for cycle graphs', () => {
      const graph: NodeGraph = {
        nodes: [
          createNode('A'),
          createNode('B'),
        ],
        connections: [
          { from: 'input', to: 'A' },
          { from: 'A', to: 'B' },
          { from: 'B', to: 'A' }, // Cycle
          { from: 'B', to: 'output' },
        ],
      };

      const warningsSets: string[][] = [];
      for (let i = 0; i < 10; i++) {
        const result = evaluateNodeGraph(cloneGraph(graph));
        warningsSets.push(result.warnings);
      }

      // All warning arrays should be identical
      for (let i = 1; i < warningsSets.length; i++) {
        expect(warningsSets[i]).toEqual(warningsSets[0]);
      }
    });
  });

  describe('snapshot hash stability', () => {
    it('produces stable hash for complex graph', () => {
      const graph: NodeGraph = {
        nodes: [
          createNode('A', {
            exposure: 1.5,
            contrast: 20,
            temperature: 5500,
            saturation: 10,
          }),
          createNode('B', {
            highlights: -15,
            shadows: 10,
            clarity: 8,
          }),
          createNode('C', {
            vibrance: 12,
            dehaze: 5,
          }),
        ],
        connections: [
          { from: 'input', to: 'A' },
          { from: 'A', to: 'B' },
          { from: 'B', to: 'C' },
          { from: 'C', to: 'output' },
        ],
      };

      // Compute hash 50 times
      const hashes: string[] = [];
      for (let i = 0; i < 50; i++) {
        const result = evaluateNodeGraph(cloneGraph(graph));
        hashes.push(hashEvalResult(result));
      }

      // All hashes should be identical
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(1);

      // Snapshot the hash for regression testing
      expect(hashes[0]).toMatchSnapshot();
    });

    it('different graphs produce different hashes', () => {
      const graph1: NodeGraph = {
        nodes: [createNode('A', { exposure: 1.0 })],
        connections: [
          { from: 'input', to: 'A' },
          { from: 'A', to: 'output' },
        ],
      };

      const graph2: NodeGraph = {
        nodes: [createNode('A', { exposure: 2.0 })], // Different value
        connections: [
          { from: 'input', to: 'A' },
          { from: 'A', to: 'output' },
        ],
      };

      const result1 = evaluateNodeGraph(graph1);
      const result2 = evaluateNodeGraph(graph2);

      // Flattened states should be different
      expect(result1.flattenedState.exposure).toBe(1.0);
      expect(result2.flattenedState.exposure).toBe(2.0);
      expect(result1.flattenedState).not.toEqual(result2.flattenedState);

      const hash1 = hashEvalResult(result1);
      const hash2 = hashEvalResult(result2);

      // Hashes should be different
      expect(hash1).not.toBe(hash2);
    });

    it('same logical graph produces same hash regardless of node order', () => {
      const graph1: NodeGraph = {
        nodes: [
          createNode('A', { exposure: 1.0 }),
          createNode('B', { contrast: 20 }),
        ],
        connections: [
          { from: 'input', to: 'A' },
          { from: 'A', to: 'B' },
          { from: 'B', to: 'output' },
        ],
      };

      const graph2: NodeGraph = {
        nodes: [
          createNode('B', { contrast: 20 }),
          createNode('A', { exposure: 1.0 }),
        ], // Nodes in different order
        connections: [
          { from: 'input', to: 'A' },
          { from: 'A', to: 'B' },
          { from: 'B', to: 'output' },
        ],
      };

      const hash1 = hashEvalResult(evaluateNodeGraph(graph1));
      const hash2 = hashEvalResult(evaluateNodeGraph(graph2));

      // Hashes should be identical (evaluation order matters, not node array order)
      expect(hash1).toBe(hash2);
    });
  });
});
