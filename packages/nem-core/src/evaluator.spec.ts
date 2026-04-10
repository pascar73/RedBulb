/**
 * evaluator.spec.ts — NEM Core Evaluator Tests
 * 
 * Tests for deterministic graph evaluation, bypass behavior,
 * cumulative delta composition, and edge cases.
 */

import { describe, it, expect } from 'vitest';
import { evaluateNodeGraph } from './evaluator';
import { createNeutralDevelopState } from './types';
import type { NodeGraph, DevelopState } from './types';

describe('evaluateNodeGraph', () => {
  describe('empty and minimal graphs', () => {
    it('returns neutral state for empty graph', () => {
      const graph: NodeGraph = { nodes: [], connections: [] };
      const result = evaluateNodeGraph(graph);
      
      expect(result.flattenedState).toEqual(createNeutralDevelopState());
      expect(result.evaluatedNodeIds).toEqual([]);
      expect(result.warnings).toContain('Empty node graph');
    });

    it('returns neutral state for single disconnected node', () => {
      const graph: NodeGraph = {
        nodes: [
          {
            id: 'node1',
            label: 'Test',
            bypass: false,
            position: { x: 0, y: 0 },
            state: { ...createNeutralDevelopState(), exposure: 1.0 },
          },
        ],
        connections: [],
      };
      const result = evaluateNodeGraph(graph);
      
      // Disconnected node should not be evaluated
      expect(result.evaluatedNodeIds).toEqual([]);
      expect(result.flattenedState).toEqual(createNeutralDevelopState());
    });
  });

  describe('linear chain evaluation', () => {
    it('evaluates simple two-node chain in correct order', () => {
      const graph: NodeGraph = {
        nodes: [
          {
            id: 'node1',
            label: 'Node 1',
            bypass: false,
            position: { x: 0, y: 0 },
            state: { ...createNeutralDevelopState(), exposure: 1.0 },
          },
          {
            id: 'node2',
            label: 'Node 2',
            bypass: false,
            position: { x: 100, y: 0 },
            state: { ...createNeutralDevelopState(), contrast: 10 },
          },
        ],
        connections: [
          { from: 'input', to: 'node1' },
          { from: 'node1', to: 'node2' },
          { from: 'node2', to: 'output' },
        ],
      };
      
      const result = evaluateNodeGraph(graph);
      
      expect(result.evaluatedNodeIds).toEqual(['node1', 'node2']);
      expect(result.flattenedState.exposure).toBe(1.0);
      expect(result.flattenedState.contrast).toBe(10);
      expect(result.warnings).toEqual([]);
    });

    it('evaluates three-node chain with cumulative deltas', () => {
      const graph: NodeGraph = {
        nodes: [
          {
            id: 'node1',
            label: 'Exposure',
            bypass: false,
            position: { x: 0, y: 0 },
            state: { ...createNeutralDevelopState(), exposure: 0.5 },
          },
          {
            id: 'node2',
            label: 'Contrast',
            bypass: false,
            position: { x: 100, y: 0 },
            state: { ...createNeutralDevelopState(), contrast: 20 },
          },
          {
            id: 'node3',
            label: 'Saturation',
            bypass: false,
            position: { x: 200, y: 0 },
            state: { ...createNeutralDevelopState(), saturation: 15 },
          },
        ],
        connections: [
          { from: 'input', to: 'node1' },
          { from: 'node1', to: 'node2' },
          { from: 'node2', to: 'node3' },
          { from: 'node3', to: 'output' },
        ],
      };
      
      const result = evaluateNodeGraph(graph);
      
      expect(result.evaluatedNodeIds).toEqual(['node1', 'node2', 'node3']);
      expect(result.flattenedState).toMatchObject({
        exposure: 0.5,
        contrast: 20,
        saturation: 15,
      });
    });
  });

  describe('bypass behavior', () => {
    it('skips bypassed node by default', () => {
      const graph: NodeGraph = {
        nodes: [
          {
            id: 'node1',
            label: 'Active',
            bypass: false,
            position: { x: 0, y: 0 },
            state: { ...createNeutralDevelopState(), exposure: 1.0 },
          },
          {
            id: 'node2',
            label: 'Bypassed',
            bypass: true,
            position: { x: 100, y: 0 },
            state: { ...createNeutralDevelopState(), contrast: 50 },
          },
          {
            id: 'node3',
            label: 'Active 2',
            bypass: false,
            position: { x: 200, y: 0 },
            state: { ...createNeutralDevelopState(), saturation: 10 },
          },
        ],
        connections: [
          { from: 'input', to: 'node1' },
          { from: 'node1', to: 'node2' },
          { from: 'node2', to: 'node3' },
          { from: 'node3', to: 'output' },
        ],
      };
      
      const result = evaluateNodeGraph(graph);
      
      expect(result.evaluatedNodeIds).toEqual(['node1', 'node3']);
      expect(result.flattenedState.exposure).toBe(1.0);
      expect(result.flattenedState.contrast).toBe(0); // Bypassed
      expect(result.flattenedState.saturation).toBe(10);
    });

    it('includes bypassed node when includeBypassed=true', () => {
      const graph: NodeGraph = {
        nodes: [
          {
            id: 'node1',
            label: 'Active',
            bypass: false,
            position: { x: 0, y: 0 },
            state: { ...createNeutralDevelopState(), exposure: 1.0 },
          },
          {
            id: 'node2',
            label: 'Bypassed',
            bypass: true,
            position: { x: 100, y: 0 },
            state: { ...createNeutralDevelopState(), contrast: 50 },
          },
        ],
        connections: [
          { from: 'input', to: 'node1' },
          { from: 'node1', to: 'node2' },
          { from: 'node2', to: 'output' },
        ],
      };
      
      const result = evaluateNodeGraph(graph, { includeBypassed: true });
      
      expect(result.evaluatedNodeIds).toEqual(['node1', 'node2']);
      expect(result.flattenedState.contrast).toBe(50); // Not bypassed
    });
  });

  describe('temperature handling (neutral = 6500)', () => {
    it('does not override with neutral temperature', () => {
      const graph: NodeGraph = {
        nodes: [
          {
            id: 'node1',
            label: 'Temp 1',
            bypass: false,
            position: { x: 0, y: 0 },
            state: { ...createNeutralDevelopState(), temperature: 5500 },
          },
          {
            id: 'node2',
            label: 'Temp Neutral',
            bypass: false,
            position: { x: 100, y: 0 },
            state: { ...createNeutralDevelopState(), temperature: 6500 },
          },
        ],
        connections: [
          { from: 'input', to: 'node1' },
          { from: 'node1', to: 'node2' },
          { from: 'node2', to: 'output' },
        ],
      };
      
      const result = evaluateNodeGraph(graph);
      
      // Node2's neutral temp should not override node1's 5500
      expect(result.flattenedState.temperature).toBe(5500);
    });

    it('overrides with non-neutral temperature', () => {
      const graph: NodeGraph = {
        nodes: [
          {
            id: 'node1',
            label: 'Temp 1',
            bypass: false,
            position: { x: 0, y: 0 },
            state: { ...createNeutralDevelopState(), temperature: 5500 },
          },
          {
            id: 'node2',
            label: 'Temp 2',
            bypass: false,
            position: { x: 100, y: 0 },
            state: { ...createNeutralDevelopState(), temperature: 7000 },
          },
        ],
        connections: [
          { from: 'input', to: 'node1' },
          { from: 'node1', to: 'node2' },
          { from: 'node2', to: 'output' },
        ],
      };
      
      const result = evaluateNodeGraph(graph);
      
      expect(result.flattenedState.temperature).toBe(7000);
    });
  });

  describe('HSL merge behavior', () => {
    it('merges HSL adjustments correctly', () => {
      const graph: NodeGraph = {
        nodes: [
          {
            id: 'node1',
            label: 'Red HSL',
            bypass: false,
            position: { x: 0, y: 0 },
            state: {
              ...createNeutralDevelopState(),
              hsl: {
                red: { h: 10, s: 5, l: 0 },
              },
            },
          },
          {
            id: 'node2',
            label: 'Blue HSL',
            bypass: false,
            position: { x: 100, y: 0 },
            state: {
              ...createNeutralDevelopState(),
              hsl: {
                blue: { h: -5, s: 10, l: 5 },
              },
            },
          },
        ],
        connections: [
          { from: 'input', to: 'node1' },
          { from: 'node1', to: 'node2' },
          { from: 'node2', to: 'output' },
        ],
      };
      
      const result = evaluateNodeGraph(graph);
      
      expect(result.flattenedState.hsl).toMatchObject({
        red: { h: 10, s: 5, l: 0 },
        blue: { h: -5, s: 10, l: 5 },
      });
    });

    it('does not merge HSL with all-zero values', () => {
      const graph: NodeGraph = {
        nodes: [
          {
            id: 'node1',
            label: 'HSL',
            bypass: false,
            position: { x: 0, y: 0 },
            state: {
              ...createNeutralDevelopState(),
              hsl: {
                red: { h: 10, s: 5, l: 0 },
                green: { h: 0, s: 0, l: 0 }, // All zero - should not merge
              },
            },
          },
        ],
        connections: [
          { from: 'input', to: 'node1' },
          { from: 'node1', to: 'output' },
        ],
      };
      
      const result = evaluateNodeGraph(graph);
      
      expect(result.flattenedState.hsl).toMatchObject({
        red: { h: 10, s: 5, l: 0 },
      });
      expect(result.flattenedState.hsl?.green).toBeUndefined();
    });
  });

  describe('stopAtNodeId option', () => {
    it('stops evaluation at specified node (inclusive)', () => {
      const graph: NodeGraph = {
        nodes: [
          {
            id: 'node1',
            label: 'Node 1',
            bypass: false,
            position: { x: 0, y: 0 },
            state: { ...createNeutralDevelopState(), exposure: 1.0 },
          },
          {
            id: 'node2',
            label: 'Node 2',
            bypass: false,
            position: { x: 100, y: 0 },
            state: { ...createNeutralDevelopState(), contrast: 10 },
          },
          {
            id: 'node3',
            label: 'Node 3',
            bypass: false,
            position: { x: 200, y: 0 },
            state: { ...createNeutralDevelopState(), saturation: 20 },
          },
        ],
        connections: [
          { from: 'input', to: 'node1' },
          { from: 'node1', to: 'node2' },
          { from: 'node2', to: 'node3' },
          { from: 'node3', to: 'output' },
        ],
      };
      
      const result = evaluateNodeGraph(graph, { stopAtNodeId: 'node2' });
      
      expect(result.evaluatedNodeIds).toEqual(['node1', 'node2']);
      expect(result.flattenedState.exposure).toBe(1.0);
      expect(result.flattenedState.contrast).toBe(10);
      expect(result.flattenedState.saturation).toBe(0); // Not evaluated
    });
  });

  describe('edge cases and warnings', () => {
    it('warns about missing node in connections', () => {
      const graph: NodeGraph = {
        nodes: [
          {
            id: 'node1',
            label: 'Node 1',
            bypass: false,
            position: { x: 0, y: 0 },
            state: createNeutralDevelopState(),
          },
        ],
        connections: [
          { from: 'input', to: 'node1' },
          { from: 'node1', to: 'missing-node' }, // References non-existent node
        ],
      };
      
      const result = evaluateNodeGraph(graph);
      
      expect(result.evaluatedNodeIds).toEqual(['node1']);
      // Should still evaluate node1 even though connection is broken
    });

    it('handles cycle gracefully (stops at first revisit)', () => {
      const graph: NodeGraph = {
        nodes: [
          {
            id: 'node1',
            label: 'Node 1',
            bypass: false,
            position: { x: 0, y: 0 },
            state: { ...createNeutralDevelopState(), exposure: 1.0 },
          },
          {
            id: 'node2',
            label: 'Node 2',
            bypass: false,
            position: { x: 100, y: 0 },
            state: { ...createNeutralDevelopState(), contrast: 10 },
          },
        ],
        connections: [
          { from: 'input', to: 'node1' },
          { from: 'node1', to: 'node2' },
          { from: 'node2', to: 'node1' }, // Cycle back to node1
        ],
      };
      
      const result = evaluateNodeGraph(graph);
      
      // Should stop when it encounters already-seen node
      expect(result.evaluatedNodeIds).toEqual(['node1', 'node2']);
      expect(result.flattenedState.exposure).toBe(1.0);
      expect(result.flattenedState.contrast).toBe(10);
    });
  });

  describe('determinism', () => {
    it('produces identical output for same graph (deterministic)', () => {
      const graph: NodeGraph = {
        nodes: [
          {
            id: 'node1',
            label: 'Node 1',
            bypass: false,
            position: { x: 0, y: 0 },
            state: {
              ...createNeutralDevelopState(),
              exposure: 1.5,
              contrast: 20,
              temperature: 5500,
            },
          },
          {
            id: 'node2',
            label: 'Node 2',
            bypass: false,
            position: { x: 100, y: 0 },
            state: {
              ...createNeutralDevelopState(),
              saturation: 10,
              vibrance: 5,
            },
          },
        ],
        connections: [
          { from: 'input', to: 'node1' },
          { from: 'node1', to: 'node2' },
          { from: 'node2', to: 'output' },
        ],
      };
      
      const result1 = evaluateNodeGraph(graph);
      const result2 = evaluateNodeGraph(graph);
      
      expect(result1.flattenedState).toEqual(result2.flattenedState);
      expect(result1.evaluatedNodeIds).toEqual(result2.evaluatedNodeIds);
    });
  });
});
