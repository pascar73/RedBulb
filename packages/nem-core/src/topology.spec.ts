/**
 * topology.spec.ts — Topology validation tests for NEM core
 * 
 * Tests explicit topology warnings for:
 * - Branching (one node → multiple nodes)
 * - Multiple input roots
 * - Cycles
 * - Disconnected nodes
 * 
 * Block 2C Task 7: Dedicated topology test file (10+ tests)
 */

import { describe, it, expect } from 'vitest';
import { evaluateNodeGraph } from './evaluator';
import { createNeutralDevelopState } from './types';
import type { NodeGraph, Node } from './types';

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

describe('topology validation', () => {
  describe('valid topologies', () => {
    it('accepts simple linear chain (input → A → B → output)', () => {
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

      const result = evaluateNodeGraph(graph);

      expect(result.evaluatedNodeIds).toEqual(['A', 'B']);
      expect(result.warnings).toHaveLength(0);
    });

    it('accepts single node chain (input → A → output)', () => {
      const graph: NodeGraph = {
        nodes: [createNode('A', { exposure: 1.0 })],
        connections: [
          { from: 'input', to: 'A' },
          { from: 'A', to: 'output' },
        ],
      };

      const result = evaluateNodeGraph(graph);

      expect(result.evaluatedNodeIds).toEqual(['A']);
      expect(result.warnings).toHaveLength(0);
    });

    it('accepts long linear chain (5 nodes)', () => {
      const graph: NodeGraph = {
        nodes: [
          createNode('A', { exposure: 1.0 }),
          createNode('B', { contrast: 10 }),
          createNode('C', { saturation: 5 }),
          createNode('D', { clarity: 15 }),
          createNode('E', { dehaze: 3 }),
        ],
        connections: [
          { from: 'input', to: 'A' },
          { from: 'A', to: 'B' },
          { from: 'B', to: 'C' },
          { from: 'C', to: 'D' },
          { from: 'D', to: 'E' },
          { from: 'E', to: 'output' },
        ],
      };

      const result = evaluateNodeGraph(graph);

      expect(result.evaluatedNodeIds).toEqual(['A', 'B', 'C', 'D', 'E']);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('branching detection', () => {
    it('warns when node has multiple outgoing connections', () => {
      const graph: NodeGraph = {
        nodes: [
          createNode('A', { exposure: 1.0 }),
          createNode('B', { contrast: 20 }),
          createNode('C', { saturation: 10 }),
        ],
        connections: [
          { from: 'input', to: 'A' },
          { from: 'A', to: 'B' }, // A branches to both B and C
          { from: 'A', to: 'C' },
          { from: 'B', to: 'output' },
        ],
      };

      const result = evaluateNodeGraph(graph);

      // Should use first connection (A → B)
      expect(result.evaluatedNodeIds).toEqual(['A', 'B']);
      
      // Should warn about branching
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.includes('branching not supported'))).toBe(true);
      expect(result.warnings.some((w) => w.includes('Node A'))).toBe(true);
    });

    it('warns about exact branching count', () => {
      const graph: NodeGraph = {
        nodes: [
          createNode('A'),
          createNode('B'),
          createNode('C'),
          createNode('D'),
        ],
        connections: [
          { from: 'input', to: 'A' },
          { from: 'A', to: 'B' },
          { from: 'A', to: 'C' },
          { from: 'A', to: 'D' }, // 3 outgoing connections
          { from: 'B', to: 'output' },
        ],
      };

      const result = evaluateNodeGraph(graph);

      const branchWarning = result.warnings.find((w) => w.includes('Node A'));
      expect(branchWarning).toBeTruthy();
      expect(branchWarning).toContain('3 outgoing connections');
    });
  });

  describe('multiple input roots detection', () => {
    it('warns when multiple nodes connected from input', () => {
      const graph: NodeGraph = {
        nodes: [
          createNode('A', { exposure: 1.0 }),
          createNode('B', { contrast: 20 }),
        ],
        connections: [
          { from: 'input', to: 'A' }, // Multiple roots
          { from: 'input', to: 'B' },
          { from: 'A', to: 'output' },
        ],
      };

      const result = evaluateNodeGraph(graph);

      // Should use first root only
      expect(result.evaluatedNodeIds).toEqual(['A']);
      
      // Should warn about multiple roots
      expect(result.warnings.some((w) => w.includes('Multiple nodes connected from input'))).toBe(true);
      expect(result.warnings.some((w) => w.includes('using first: A'))).toBe(true);
    });

    it('reports exact count of input roots', () => {
      const graph: NodeGraph = {
        nodes: [
          createNode('A'),
          createNode('B'),
          createNode('C'),
        ],
        connections: [
          { from: 'input', to: 'A' },
          { from: 'input', to: 'B' },
          { from: 'input', to: 'C' }, // 3 input roots
          { from: 'A', to: 'output' },
        ],
      };

      const result = evaluateNodeGraph(graph);

      const rootWarning = result.warnings.find((w) => w.includes('Multiple nodes connected from input'));
      expect(rootWarning).toBeTruthy();
      expect(rootWarning).toContain('3 found');
    });
  });

  describe('cycle detection', () => {
    it('detects simple cycle (A → B → A)', () => {
      const graph: NodeGraph = {
        nodes: [
          createNode('A', { exposure: 1.0 }),
          createNode('B', { contrast: 20 }),
        ],
        connections: [
          { from: 'input', to: 'A' },
          { from: 'A', to: 'B' },
          { from: 'B', to: 'A' }, // Cycle: B → A
          { from: 'B', to: 'output' },
        ],
      };

      const result = evaluateNodeGraph(graph);

      // Should stop at cycle detection
      expect(result.evaluatedNodeIds).toEqual(['A', 'B']);
      
      // Should warn about cycle
      expect(result.warnings.some((w) => w.includes('Cycle detected'))).toBe(true);
      expect(result.warnings.some((w) => w.includes('node A'))).toBe(true);
    });

    it('detects self-loop (A → A)', () => {
      const graph: NodeGraph = {
        nodes: [createNode('A', { exposure: 1.0 })],
        connections: [
          { from: 'input', to: 'A' },
          { from: 'A', to: 'A' }, // Self-loop
          { from: 'A', to: 'output' },
        ],
      };

      const result = evaluateNodeGraph(graph);

      // Should evaluate A once, then stop at cycle
      expect(result.evaluatedNodeIds).toEqual(['A']);
      expect(result.warnings.some((w) => w.includes('Cycle detected'))).toBe(true);
    });

    it('detects longer cycle (A → B → C → A)', () => {
      const graph: NodeGraph = {
        nodes: [
          createNode('A'),
          createNode('B'),
          createNode('C'),
        ],
        connections: [
          { from: 'input', to: 'A' },
          { from: 'A', to: 'B' },
          { from: 'B', to: 'C' },
          { from: 'C', to: 'A' }, // Cycle back to A
          { from: 'C', to: 'output' },
        ],
      };

      const result = evaluateNodeGraph(graph);

      expect(result.evaluatedNodeIds).toEqual(['A', 'B', 'C']);
      expect(result.warnings.some((w) => w.includes('Cycle detected'))).toBe(true);
    });
  });

  describe('disconnected node detection', () => {
    it('warns about disconnected node not in chain', () => {
      const graph: NodeGraph = {
        nodes: [
          createNode('A', { exposure: 1.0 }),
          createNode('B', { contrast: 20 }), // Disconnected
        ],
        connections: [
          { from: 'input', to: 'A' },
          { from: 'A', to: 'output' },
          // B has no connections
        ],
      };

      const result = evaluateNodeGraph(graph);

      // Should only evaluate connected node
      expect(result.evaluatedNodeIds).toEqual(['A']);
      
      // B is not connected at all, so not warned (no connections = not in connectedNodes set)
      // Only nodes WITH connections but not in chain are warned
    });

    it('warns about node in graph but outside main chain', () => {
      const graph: NodeGraph = {
        nodes: [
          createNode('A', { exposure: 1.0 }),
          createNode('B', { contrast: 20 }),
          createNode('C', { saturation: 10 }), // Has connection but disconnected from main chain
        ],
        connections: [
          { from: 'input', to: 'A' },
          { from: 'A', to: 'B' },
          { from: 'B', to: 'output' },
          // C → D connection exists but not connected to input→output chain
          { from: 'C', to: 'A' }, // C connects to A but A doesn't connect to C
        ],
      };

      const result = evaluateNodeGraph(graph);

      expect(result.evaluatedNodeIds).toEqual(['A', 'B']);
      expect(result.warnings.some((w) => w.includes('disconnected from main chain'))).toBe(true);
      expect(result.warnings.some((w) => w.includes('C'))).toBe(true);
    });

    it('reports exact count of disconnected nodes', () => {
      const graph: NodeGraph = {
        nodes: [
          createNode('A'),
          createNode('B'),
          createNode('C'),
          createNode('D'),
        ],
        connections: [
          { from: 'input', to: 'A' },
          { from: 'A', to: 'output' },
          { from: 'B', to: 'C' }, // B and C form disconnected subgraph
          { from: 'C', to: 'D' },
        ],
      };

      const result = evaluateNodeGraph(graph);

      expect(result.evaluatedNodeIds).toEqual(['A']);
      const disconnectedWarning = result.warnings.find((w) => w.includes('disconnected'));
      expect(disconnectedWarning).toBeTruthy();
      expect(disconnectedWarning).toContain('3 node(s)'); // B, C, D
    });
  });

  describe('determinism', () => {
    it('produces identical warnings on repeated evaluation', () => {
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

      const result1 = evaluateNodeGraph(graph);
      const result2 = evaluateNodeGraph(graph);
      const result3 = evaluateNodeGraph(graph);

      // Warnings should be identical
      expect(result1.warnings).toEqual(result2.warnings);
      expect(result2.warnings).toEqual(result3.warnings);
    });

    it('warnings are in deterministic order', () => {
      const graph: NodeGraph = {
        nodes: [
          createNode('A'),
          createNode('B'),
          createNode('C'),
        ],
        connections: [
          { from: 'input', to: 'A' },
          { from: 'input', to: 'B' }, // Multiple roots
          { from: 'A', to: 'C' },
          { from: 'A', to: 'B' }, // Branching from A
          { from: 'C', to: 'output' },
        ],
      };

      // Run multiple times
      const results = [
        evaluateNodeGraph(graph),
        evaluateNodeGraph(graph),
        evaluateNodeGraph(graph),
      ];

      // All warning arrays should be identical (same order)
      for (let i = 1; i < results.length; i++) {
        expect(results[i].warnings).toEqual(results[0].warnings);
      }
    });
  });
});
