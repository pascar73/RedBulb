/**
 * nem-core-integration.test.ts
 * 
 * Proves that web client evaluation path uses shared @redbulb/nem-core
 * (not duplicate local evaluator logic)
 */

import { describe, it, expect, vi } from 'vitest';
import { evaluateNodeGraph } from './node-graph-evaluate';
import { createEmptyDevelopState } from './node-types';
import type { NodeGraph } from './node-graph-types';

// Mock the nem-core module to prove it's being called
vi.mock('@redbulb/nem-core', async () => {
  const actual = await vi.importActual('@redbulb/nem-core');
  return {
    ...actual,
    evaluateNodeGraph: vi.fn(actual.evaluateNodeGraph),
  };
});

describe('NEM Core Integration', () => {
  it('proves web evaluation uses shared @redbulb/nem-core (not local duplicate)', async () => {
    const { evaluateNodeGraph: mockCore } = await import('@redbulb/nem-core');
    
    const graph: NodeGraph = {
      version: 2,
      selectedNodeId: 'node1',
      nodes: [
        {
          id: 'node1',
          label: 'Test Node',
          bypass: false,
          position: { x: 0, y: 0 },
          state: {
            ...createEmptyDevelopState(),
            basic: {
              ...createEmptyDevelopState().basic,
              exposure: 1.0,
            },
          },
        },
      ],
      connections: [
        { from: 'input', to: 'node1' },
        { from: 'node1', to: 'output' },
      ],
      geometry: {
        rotation: 0,
        distortion: 0,
        vertical: 0,
        horizontal: 0,
        scale: 1.0,
      },
    };

    // Call web evaluator
    const result = evaluateNodeGraph(graph);

    // Verify shared core was called (proof it's wired)
    expect(mockCore).toHaveBeenCalled();
    
    // Verify result structure
    expect(result.flattenedState).toBeDefined();
    expect(result.evaluatedNodeIds).toEqual(['node1']);
    expect(result.flattenedState.basic.exposure).toBe(1.0);
  });

  it('proves adapter converts between web and core types', () => {
    const graph: NodeGraph = {
      version: 2,
      selectedNodeId: 'node1',
      nodes: [
        {
          id: 'node1',
          label: 'Color Node',
          bypass: false,
          position: { x: 0, y: 0 },
          state: {
            ...createEmptyDevelopState(),
            color: {
              saturation: 15,
              temperature: 5500,
              tint: 10,
              vibrance: 5,
            },
          },
        },
      ],
      connections: [
        { from: 'input', to: 'node1' },
        { from: 'node1', to: 'output' },
      ],
      geometry: {
        rotation: 0,
        distortion: 0,
        vertical: 0,
        horizontal: 0,
        scale: 1.0,
      },
    };

    const result = evaluateNodeGraph(graph);

    // Verify adapter correctly converted nested (web) → flat (core) → nested (web)
    expect(result.flattenedState.color.saturation).toBe(15);
    expect(result.flattenedState.color.temperature).toBe(5500);
    expect(result.flattenedState.color.tint).toBe(10);
    expect(result.flattenedState.color.vibrance).toBe(5);
  });
});
