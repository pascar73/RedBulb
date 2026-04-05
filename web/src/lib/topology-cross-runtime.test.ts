/**
 * topology-cross-runtime.test.ts — Cross-runtime topology validation
 * 
 * Tests that web and server paths handle topology identically using shared fixtures.
 * 
 * Block 2C Requirement 3: Shared topology fixture suite for cross-runtime testing
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { evaluateNodeGraph as webEvaluate } from './components/asset-viewer/editor/node-graph-evaluate';
import { NemEvaluatorService } from '../../../server/src/services/nem-evaluator.service';
import { topologyFixtures } from '../../../packages/nem-core/src/topology-fixtures';
import type { TopologyFixture } from '../../../packages/nem-core/src/topology-fixtures';
import { coreToWeb } from './nem-core-adapter';
import type { NodeGraph as WebNodeGraph } from './components/asset-viewer/editor/node-graph-types';

let serverService: NemEvaluatorService;

beforeAll(() => {
  serverService = new NemEvaluatorService();
});

/**
 * Convert core fixture to web-compatible format
 */
function coreFixtureToWeb(coreGraph: any): WebNodeGraph {
  return {
    nodes: coreGraph.nodes.map((node: any) => ({
      id: node.id,
      type: node.type,
      label: node.id,
      state: coreToWeb(node.state),
      bypass: node.bypass,
      position: { x: 0, y: 0 },
    })),
    connections: coreGraph.connections,
  };
}

describe('topology cross-runtime validation', () => {
  describe('valid topologies', () => {
    const validFixtures = topologyFixtures.filter((f) => f.name.startsWith('valid'));

    validFixtures.forEach((fixture) => {
      it(`both paths agree on: ${fixture.description}`, () => {
        // Web path (convert to web format)
        const webGraph = coreFixtureToWeb(fixture.graph);
        const webResult = webEvaluate(webGraph);

        // Server path (use original flat format)
        const serverResult = serverService.evaluateNodeGraph(fixture.graph);

        // evaluatedNodeIds should match
        expect(webResult.evaluatedNodeIds).toEqual(serverResult.evaluatedNodeIds);
        expect(webResult.evaluatedNodeIds).toEqual(fixture.expectedNodeIds);

        // Neither should produce warnings
        expect(webResult.warnings.filter((w) => !w.startsWith('validation:'))).toHaveLength(fixture.expectedWarningCount);
        expect(serverResult.warnings).toHaveLength(fixture.expectedWarningCount);
      });
    });
  });

  describe('branching detection', () => {
    const branchingFixtures = topologyFixtures.filter((f) => f.name.startsWith('branching'));

    branchingFixtures.forEach((fixture) => {
      it(`both paths agree on: ${fixture.description}`, () => {
        const webGraph = coreFixtureToWeb(fixture.graph);
        const webResult = webEvaluate(webGraph);
        const serverResult = serverService.evaluateNodeGraph(fixture.graph);

        // evaluatedNodeIds should match
        expect(webResult.evaluatedNodeIds).toEqual(serverResult.evaluatedNodeIds);
        expect(webResult.evaluatedNodeIds).toEqual(fixture.expectedNodeIds);

        // Both should produce branching warning
        const webCoreWarnings = webResult.warnings.filter((w) => !w.startsWith('validation:'));
        expect(webCoreWarnings.length).toBeGreaterThanOrEqual(fixture.expectedWarningCount);
        expect(serverResult.warnings.length).toBeGreaterThanOrEqual(fixture.expectedWarningCount);

        // Check warning patterns
        fixture.expectedWarningPatterns.forEach((pattern) => {
          expect(serverResult.warnings.some((w) => w.includes(pattern))).toBe(true);
        });
      });
    });
  });

  describe('multiple input roots detection', () => {
    const multiRootFixtures = topologyFixtures.filter((f) => f.name.startsWith('multi-root'));

    multiRootFixtures.forEach((fixture) => {
      it(`both paths agree on: ${fixture.description}`, () => {
        const webGraph = coreFixtureToWeb(fixture.graph);
        const webResult = webEvaluate(webGraph);
        const serverResult = serverService.evaluateNodeGraph(fixture.graph);

        // evaluatedNodeIds should match
        expect(webResult.evaluatedNodeIds).toEqual(serverResult.evaluatedNodeIds);
        expect(webResult.evaluatedNodeIds).toEqual(fixture.expectedNodeIds);

        // Both should produce multi-root warning
        expect(serverResult.warnings.some((w) => w.includes('Multiple nodes connected from input'))).toBe(true);

        // Check warning patterns
        fixture.expectedWarningPatterns.forEach((pattern) => {
          expect(serverResult.warnings.some((w) => w.includes(pattern))).toBe(true);
        });
      });
    });
  });

  describe('cycle detection', () => {
    const cycleFixtures = topologyFixtures.filter((f) => f.name.startsWith('cycle'));

    cycleFixtures.forEach((fixture) => {
      it(`both paths agree on: ${fixture.description}`, () => {
        const webGraph = coreFixtureToWeb(fixture.graph);
        const webResult = webEvaluate(webGraph);
        const serverResult = serverService.evaluateNodeGraph(fixture.graph);

        // evaluatedNodeIds should match
        expect(webResult.evaluatedNodeIds).toEqual(serverResult.evaluatedNodeIds);
        expect(webResult.evaluatedNodeIds).toEqual(fixture.expectedNodeIds);

        // Both should produce cycle warning
        expect(serverResult.warnings.some((w) => w.includes('Cycle detected'))).toBe(true);

        // Check warning patterns
        fixture.expectedWarningPatterns.forEach((pattern) => {
          expect(serverResult.warnings.some((w) => w.includes(pattern))).toBe(true);
        });
      });
    });
  });

  describe('disconnected node detection', () => {
    const disconnectedFixtures = topologyFixtures.filter((f) => f.name.startsWith('disconnected'));

    disconnectedFixtures.forEach((fixture) => {
      it(`both paths agree on: ${fixture.description}`, () => {
        const webGraph = coreFixtureToWeb(fixture.graph);
        const webResult = webEvaluate(webGraph);
        const serverResult = serverService.evaluateNodeGraph(fixture.graph);

        // evaluatedNodeIds should match
        expect(webResult.evaluatedNodeIds).toEqual(serverResult.evaluatedNodeIds);
        expect(webResult.evaluatedNodeIds).toEqual(fixture.expectedNodeIds);

        // Both should produce disconnected warning
        expect(serverResult.warnings.some((w) => w.includes('disconnected'))).toBe(true);

        // Check warning patterns
        fixture.expectedWarningPatterns.forEach((pattern) => {
          expect(serverResult.warnings.some((w) => w.includes(pattern))).toBe(true);
        });
      });
    });
  });

  describe('complex combinations', () => {
    const combinedFixtures = topologyFixtures.filter((f) => f.name.startsWith('combined'));

    combinedFixtures.forEach((fixture) => {
      it(`both paths agree on: ${fixture.description}`, () => {
        const webGraph = coreFixtureToWeb(fixture.graph);
        const webResult = webEvaluate(webGraph);
        const serverResult = serverService.evaluateNodeGraph(fixture.graph);

        // evaluatedNodeIds should match
        expect(webResult.evaluatedNodeIds).toEqual(serverResult.evaluatedNodeIds);
        expect(webResult.evaluatedNodeIds).toEqual(fixture.expectedNodeIds);

        // Both should produce multiple warnings
        const webCoreWarnings = webResult.warnings.filter((w) => !w.startsWith('validation:'));
        expect(webCoreWarnings.length).toBeGreaterThanOrEqual(fixture.expectedWarningCount);
        expect(serverResult.warnings.length).toBeGreaterThanOrEqual(fixture.expectedWarningCount);

        // Check all expected warning patterns
        fixture.expectedWarningPatterns.forEach((pattern) => {
          expect(serverResult.warnings.some((w) => w.includes(pattern))).toBe(true);
        });
      });
    });
  });

  describe('warning determinism across runtimes', () => {
    it('web and server produce same core warnings (excluding web validation)', () => {
      const fixture = topologyFixtures.find((f) => f.name === 'combined-branching-and-multi-root')!;

      const webGraph = coreFixtureToWeb(fixture.graph);
      const webResult = webEvaluate(webGraph);
      const serverResult = serverService.evaluateNodeGraph(fixture.graph);

      // Filter web warnings to only core warnings (remove validation: prefix)
      const webCoreWarnings = webResult.warnings.filter((w) => !w.startsWith('validation:'));

      // Both should have same core warnings
      expect(webCoreWarnings).toEqual(serverResult.warnings);
    });

    it('warnings are consistent across multiple evaluations', () => {
      const fixture = topologyFixtures.find((f) => f.name === 'branching-2-way')!;

      // Evaluate 10 times with both paths
      const webWarnings: string[][] = [];
      const serverWarnings: string[][] = [];

      for (let i = 0; i < 10; i++) {
        const webGraph = coreFixtureToWeb(fixture.graph);
        const webResult = webEvaluate(webGraph);
        const serverResult = serverService.evaluateNodeGraph(fixture.graph);

        webWarnings.push(webResult.warnings.filter((w) => !w.startsWith('validation:')));
        serverWarnings.push(serverResult.warnings);
      }

      // All web warnings should be identical
      for (let i = 1; i < webWarnings.length; i++) {
        expect(webWarnings[i]).toEqual(webWarnings[0]);
      }

      // All server warnings should be identical
      for (let i = 1; i < serverWarnings.length; i++) {
        expect(serverWarnings[i]).toEqual(serverWarnings[0]);
      }
    });
  });
});
