/**
 * topology-fixtures.ts — Shared topology test fixtures
 * 
 * Common graph topologies for cross-runtime testing.
 * Used by both web and server path tests to ensure identical behavior.
 * 
 * Block 2C Requirement: Shared fixture suite for topology validation
 */

import { createNeutralDevelopState } from './types';
import type { NodeGraph, Node, DevelopState } from './types';

/**
 * Helper: Create a test node with minimal state
 */
export function createTestNode(id: string, state: Partial<DevelopState> = {}): Node {
  return {
    id,
    type: 'develop',
    state: { ...createNeutralDevelopState(), ...state },
    bypass: false,
  };
}

/**
 * Topology fixture definition
 */
export interface TopologyFixture {
  name: string;
  description: string;
  graph: NodeGraph;
  expectedNodeIds: string[];
  expectedWarningCount: number;
  expectedWarningPatterns: string[];
}

/**
 * Shared topology fixtures for cross-runtime testing
 */
export const topologyFixtures: TopologyFixture[] = [
  // ========== VALID TOPOLOGIES ==========
  
  {
    name: 'valid-linear-2-nodes',
    description: 'Simple linear chain: input → A → B → output',
    graph: {
      nodes: [
        createTestNode('A', { exposure: 1.0 }),
        createTestNode('B', { contrast: 20 }),
      ],
      connections: [
        { from: 'input', to: 'A' },
        { from: 'A', to: 'B' },
        { from: 'B', to: 'output' },
      ],
    },
    expectedNodeIds: ['A', 'B'],
    expectedWarningCount: 0,
    expectedWarningPatterns: [],
  },

  {
    name: 'valid-linear-5-nodes',
    description: 'Longer linear chain: input → A → B → C → D → E → output',
    graph: {
      nodes: [
        createTestNode('A', { exposure: 1.0 }),
        createTestNode('B', { contrast: 10 }),
        createTestNode('C', { saturation: 5 }),
        createTestNode('D', { clarity: 15 }),
        createTestNode('E', { dehaze: 3 }),
      ],
      connections: [
        { from: 'input', to: 'A' },
        { from: 'A', to: 'B' },
        { from: 'B', to: 'C' },
        { from: 'C', to: 'D' },
        { from: 'D', to: 'E' },
        { from: 'E', to: 'output' },
      ],
    },
    expectedNodeIds: ['A', 'B', 'C', 'D', 'E'],
    expectedWarningCount: 0,
    expectedWarningPatterns: [],
  },

  // ========== BRANCHING ==========

  {
    name: 'branching-2-way',
    description: 'Node A branches to B and C (uses first connection B)',
    graph: {
      nodes: [
        createTestNode('A', { exposure: 1.0 }),
        createTestNode('B', { contrast: 20 }),
        createTestNode('C', { saturation: 10 }),
      ],
      connections: [
        { from: 'input', to: 'A' },
        { from: 'A', to: 'B' }, // First connection (used)
        { from: 'A', to: 'C' }, // Second connection (ignored)
        { from: 'B', to: 'output' },
      ],
    },
    expectedNodeIds: ['A', 'B'],
    expectedWarningCount: 1,
    expectedWarningPatterns: ['branching not supported', 'Node A', '2 outgoing'],
  },

  {
    name: 'branching-3-way',
    description: 'Node A branches to B, C, and D (uses first connection B)',
    graph: {
      nodes: [
        createTestNode('A'),
        createTestNode('B'),
        createTestNode('C'),
        createTestNode('D'),
      ],
      connections: [
        { from: 'input', to: 'A' },
        { from: 'A', to: 'B' },
        { from: 'A', to: 'C' },
        { from: 'A', to: 'D' },
        { from: 'B', to: 'output' },
      ],
    },
    expectedNodeIds: ['A', 'B'],
    expectedWarningCount: 1,
    expectedWarningPatterns: ['branching not supported', 'Node A', '3 outgoing'],
  },

  // ========== MULTIPLE INPUT ROOTS ==========

  {
    name: 'multi-root-2',
    description: 'Two nodes connected from input (uses first: A)',
    graph: {
      nodes: [
        createTestNode('A', { exposure: 1.0 }),
        createTestNode('B', { contrast: 20 }),
      ],
      connections: [
        { from: 'input', to: 'A' },
        { from: 'input', to: 'B' },
        { from: 'A', to: 'output' },
      ],
    },
    expectedNodeIds: ['A'],
    expectedWarningCount: 1,
    expectedWarningPatterns: ['Multiple nodes connected from input', '2 found', 'using first: A'],
  },

  {
    name: 'multi-root-3',
    description: 'Three nodes connected from input (uses first: A)',
    graph: {
      nodes: [
        createTestNode('A'),
        createTestNode('B'),
        createTestNode('C'),
      ],
      connections: [
        { from: 'input', to: 'A' },
        { from: 'input', to: 'B' },
        { from: 'input', to: 'C' },
        { from: 'A', to: 'output' },
      ],
    },
    expectedNodeIds: ['A'],
    expectedWarningCount: 1,
    expectedWarningPatterns: ['Multiple nodes connected from input', '3 found'],
  },

  // ========== CYCLES ==========

  {
    name: 'cycle-simple',
    description: 'Simple cycle: A → B → A',
    graph: {
      nodes: [
        createTestNode('A', { exposure: 1.0 }),
        createTestNode('B', { contrast: 20 }),
      ],
      connections: [
        { from: 'input', to: 'A' },
        { from: 'A', to: 'B' },
        { from: 'B', to: 'A' }, // Cycle
        { from: 'B', to: 'output' },
      ],
    },
    expectedNodeIds: ['A', 'B'],
    expectedWarningCount: 1,
    expectedWarningPatterns: ['Cycle detected', 'node A'],
  },

  {
    name: 'cycle-self-loop',
    description: 'Self-loop: A → A',
    graph: {
      nodes: [createTestNode('A', { exposure: 1.0 })],
      connections: [
        { from: 'input', to: 'A' },
        { from: 'A', to: 'A' }, // Self-loop
        { from: 'A', to: 'output' },
      ],
    },
    expectedNodeIds: ['A'],
    expectedWarningCount: 1,
    expectedWarningPatterns: ['Cycle detected', 'node A'],
  },

  {
    name: 'cycle-longer',
    description: 'Longer cycle: A → B → C → A',
    graph: {
      nodes: [
        createTestNode('A'),
        createTestNode('B'),
        createTestNode('C'),
      ],
      connections: [
        { from: 'input', to: 'A' },
        { from: 'A', to: 'B' },
        { from: 'B', to: 'C' },
        { from: 'C', to: 'A' }, // Cycle
        { from: 'C', to: 'output' },
      ],
    },
    expectedNodeIds: ['A', 'B', 'C'],
    expectedWarningCount: 1,
    expectedWarningPatterns: ['Cycle detected'],
  },

  // ========== DISCONNECTED NODES ==========

  {
    name: 'disconnected-single',
    description: 'Node C connected but not in main chain',
    graph: {
      nodes: [
        createTestNode('A', { exposure: 1.0 }),
        createTestNode('B', { contrast: 20 }),
        createTestNode('C', { saturation: 10 }),
      ],
      connections: [
        { from: 'input', to: 'A' },
        { from: 'A', to: 'B' },
        { from: 'B', to: 'output' },
        { from: 'C', to: 'A' }, // C connects but not in chain
      ],
    },
    expectedNodeIds: ['A', 'B'],
    expectedWarningCount: 1,
    expectedWarningPatterns: ['disconnected from main chain', 'C'],
  },

  {
    name: 'disconnected-subgraph',
    description: 'Disconnected subgraph: B → C → D',
    graph: {
      nodes: [
        createTestNode('A'),
        createTestNode('B'),
        createTestNode('C'),
        createTestNode('D'),
      ],
      connections: [
        { from: 'input', to: 'A' },
        { from: 'A', to: 'output' },
        { from: 'B', to: 'C' }, // Disconnected subgraph
        { from: 'C', to: 'D' },
      ],
    },
    expectedNodeIds: ['A'],
    expectedWarningCount: 1,
    expectedWarningPatterns: ['3 node(s)', 'disconnected'],
  },

  // ========== EMPTY GRAPH ==========

  {
    name: 'empty-graph',
    description: 'No nodes, no connections',
    graph: {
      nodes: [],
      connections: [],
    },
    expectedNodeIds: [],
    expectedWarningCount: 1,
    expectedWarningPatterns: ['Empty node graph'],
  },

  // ========== COMPLEX COMBINATIONS ==========

  {
    name: 'combined-branching-and-multi-root',
    description: 'Multiple issues: branching + multiple roots',
    graph: {
      nodes: [
        createTestNode('A'),
        createTestNode('B'),
        createTestNode('C'),
      ],
      connections: [
        { from: 'input', to: 'A' },
        { from: 'input', to: 'B' }, // Multi-root
        { from: 'A', to: 'C' },
        { from: 'A', to: 'B' }, // Branching from A
        { from: 'C', to: 'output' },
      ],
    },
    expectedNodeIds: ['A', 'C'],
    expectedWarningCount: 2,
    expectedWarningPatterns: ['branching not supported', 'Multiple nodes connected from input'],
  },
];

/**
 * Get fixture by name
 */
export function getFixture(name: string): TopologyFixture | undefined {
  return topologyFixtures.find((f) => f.name === name);
}

/**
 * Get all fixtures matching a category
 */
export function getFixturesByCategory(category: 'valid' | 'branching' | 'multi-root' | 'cycle' | 'disconnected' | 'empty' | 'combined'): TopologyFixture[] {
  return topologyFixtures.filter((f) => f.name.startsWith(category));
}
