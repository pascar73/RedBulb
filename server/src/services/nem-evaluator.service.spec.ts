/**
 * nem-evaluator.service.spec.ts — Unit tests for NEM Evaluator
 * 
 * Week 2 Task #3: Single evaluator contract
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NemEvaluatorService } from './nem-evaluator.service';

describe('NemEvaluatorService', () => {
  let service: NemEvaluatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NemEvaluatorService],
    }).compile();

    service = module.get<NemEvaluatorService>(NemEvaluatorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('evaluateNodeGraph', () => {
    it('should return neutral state for empty graph', () => {
      const result = service.evaluateNodeGraph({ nodes: [], connections: [] });

      expect(result.flattenedState.exposure).toBe(0);
      expect(result.flattenedState.contrast).toBe(0);
      expect(result.flattenedState.temperature).toBe(6500);
      expect(result.evaluatedNodeIds).toEqual([]);
      expect(result.warnings).toHaveLength(1);
    });

    it('should evaluate single node with exposure delta', () => {
      const graph = {
        nodes: [
          {
            id: 'node-01',
            label: 'Base',
            bypass: false,
            position: { x: 0, y: 0 },
            state: {
              exposure: 1.5,
              contrast: 0,
              highlights: 0,
              shadows: 0,
              whites: 0,
              blacks: 0,
              temperature: 6500,
              tint: 0,
              vibrance: 0,
              saturation: 0,
              hue: 0,
              clarity: 0,
              dehaze: 0,
            },
          },
        ],
        connections: [
          { from: 'input', to: 'node-01' },
          { from: 'node-01', to: 'output' },
        ],
      };

      const result = service.evaluateNodeGraph(graph);

      expect(result.flattenedState.exposure).toBe(1.5);
      expect(result.flattenedState.contrast).toBe(0);
      expect(result.evaluatedNodeIds).toEqual(['node-01']);
      expect(result.warnings).toHaveLength(0);
    });

    it('should compose two nodes (cumulative deltas)', () => {
      const graph = {
        nodes: [
          {
            id: 'node-01',
            label: 'Base',
            bypass: false,
            position: { x: 0, y: 0 },
            state: {
              exposure: 1.0,
              contrast: 10,
              highlights: 0,
              shadows: 0,
              whites: 0,
              blacks: 0,
              temperature: 6500,
              tint: 0,
              vibrance: 0,
              saturation: 0,
              hue: 0,
              clarity: 0,
              dehaze: 0,
            },
          },
          {
            id: 'node-02',
            label: 'User Edit',
            bypass: false,
            position: { x: 100, y: 0 },
            state: {
              exposure: 0.5, // overrides
              contrast: 0, // zero = no override
              highlights: -20, // new delta
              shadows: 0,
              whites: 0,
              blacks: 0,
              temperature: 6500,
              tint: 0,
              vibrance: 0,
              saturation: 0,
              hue: 0,
              clarity: 0,
              dehaze: 0,
            },
          },
        ],
        connections: [
          { from: 'input', to: 'node-01' },
          { from: 'node-01', to: 'node-02' },
          { from: 'node-02', to: 'output' },
        ],
      };

      const result = service.evaluateNodeGraph(graph);

      // Node 02's exposure (0.5) overrides Node 01's (1.0)
      expect(result.flattenedState.exposure).toBe(0.5);
      // Node 01's contrast (10) persists (Node 02 has 0 = no override)
      expect(result.flattenedState.contrast).toBe(10);
      // Node 02's highlights (-20) is new
      expect(result.flattenedState.highlights).toBe(-20);
      expect(result.evaluatedNodeIds).toEqual(['node-01', 'node-02']);
    });

    it('should skip bypassed nodes by default', () => {
      const graph = {
        nodes: [
          {
            id: 'node-01',
            label: 'Base',
            bypass: false,
            position: { x: 0, y: 0 },
            state: {
              exposure: 1.0,
              contrast: 0,
              highlights: 0,
              shadows: 0,
              whites: 0,
              blacks: 0,
              temperature: 6500,
              tint: 0,
              vibrance: 0,
              saturation: 0,
              hue: 0,
              clarity: 0,
              dehaze: 0,
            },
          },
          {
            id: 'node-02',
            label: 'Bypassed',
            bypass: true,
            position: { x: 100, y: 0 },
            state: {
              exposure: 2.0,
              contrast: 0,
              highlights: 0,
              shadows: 0,
              whites: 0,
              blacks: 0,
              temperature: 6500,
              tint: 0,
              vibrance: 0,
              saturation: 0,
              hue: 0,
              clarity: 0,
              dehaze: 0,
            },
          },
        ],
        connections: [
          { from: 'input', to: 'node-01' },
          { from: 'node-01', to: 'node-02' },
          { from: 'node-02', to: 'output' },
        ],
      };

      const result = service.evaluateNodeGraph(graph);

      // Bypassed node-02 should be skipped
      expect(result.flattenedState.exposure).toBe(1.0); // only node-01
      expect(result.evaluatedNodeIds).toEqual(['node-01']);
    });

    it('should include bypassed nodes when option is set', () => {
      const graph = {
        nodes: [
          {
            id: 'node-01',
            label: 'Base',
            bypass: true,
            position: { x: 0, y: 0 },
            state: {
              exposure: 1.0,
              contrast: 0,
              highlights: 0,
              shadows: 0,
              whites: 0,
              blacks: 0,
              temperature: 6500,
              tint: 0,
              vibrance: 0,
              saturation: 0,
              hue: 0,
              clarity: 0,
              dehaze: 0,
            },
          },
        ],
        connections: [
          { from: 'input', to: 'node-01' },
          { from: 'node-01', to: 'output' },
        ],
      };

      const result = service.evaluateNodeGraph(graph, { includeBypassed: true });

      expect(result.flattenedState.exposure).toBe(1.0);
      expect(result.evaluatedNodeIds).toEqual(['node-01']);
    });

    it('should stop at specified node', () => {
      const graph = {
        nodes: [
          {
            id: 'node-01',
            label: 'Base',
            bypass: false,
            position: { x: 0, y: 0 },
            state: {
              exposure: 1.0,
              contrast: 0,
              highlights: 0,
              shadows: 0,
              whites: 0,
              blacks: 0,
              temperature: 6500,
              tint: 0,
              vibrance: 0,
              saturation: 0,
              hue: 0,
              clarity: 0,
              dehaze: 0,
            },
          },
          {
            id: 'node-02',
            label: 'Edit',
            bypass: false,
            position: { x: 100, y: 0 },
            state: {
              exposure: 2.0,
              contrast: 0,
              highlights: 0,
              shadows: 0,
              whites: 0,
              blacks: 0,
              temperature: 6500,
              tint: 0,
              vibrance: 0,
              saturation: 0,
              hue: 0,
              clarity: 0,
              dehaze: 0,
            },
          },
          {
            id: 'node-03',
            label: 'More',
            bypass: false,
            position: { x: 200, y: 0 },
            state: {
              exposure: 3.0,
              contrast: 0,
              highlights: 0,
              shadows: 0,
              whites: 0,
              blacks: 0,
              temperature: 6500,
              tint: 0,
              vibrance: 0,
              saturation: 0,
              hue: 0,
              clarity: 0,
              dehaze: 0,
            },
          },
        ],
        connections: [
          { from: 'input', to: 'node-01' },
          { from: 'node-01', to: 'node-02' },
          { from: 'node-02', to: 'node-03' },
          { from: 'node-03', to: 'output' },
        ],
      };

      const result = service.evaluateNodeGraph(graph, { stopAtNodeId: 'node-02' });

      // Should include node-01 and node-02, but not node-03
      expect(result.flattenedState.exposure).toBe(2.0);
      expect(result.evaluatedNodeIds).toEqual(['node-01', 'node-02']);
    });
  });
});
