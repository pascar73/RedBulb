/**
 * nem-integration.spec.ts — Integration test for NEM evaluation pipeline
 * 
 * Week 2 Task #3: Prove Node 01 loader → evaluator wiring works end-to-end
 * 
 * Test flow:
 * 1. Node 01 Loader reads XMP (or neutral)
 * 2. Construct node graph with Node 01 as base + user edits as Node 02+
 * 3. NEM Evaluator evaluates graph → flattened state
 * 4. Result is deterministic and composable
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { NemEvaluatorService } from './nem-evaluator.service';
import { Node01Loader } from './node-01-loader';
import { updateXMP } from './xmp-sidecar-adapter';

describe('NEM Integration: Node 01 → Evaluator', () => {
  let evaluator: NemEvaluatorService;
  let node01Loader: Node01Loader;
  let tempDir: string;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NemEvaluatorService],
    }).compile();

    evaluator = module.get<NemEvaluatorService>(NemEvaluatorService);
    node01Loader = new Node01Loader();

    // Create temp directory for test files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nem-integration-'));
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  /**
   * Helper: Create minimal XMP sidecar file
   */
  async function createEmptyXMP(xmpPath: string): Promise<void> {
    const minimalXMP = `<?xml version="1.0" encoding="UTF-8"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="XMP Core 6.0.0">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
      xmlns:redbulb="https://redbulb.io/ns/1.0/"
      crs:Version="16.3"
      crs:ProcessVersion="15.4"/>
  </rdf:RDF>
</x:xmpmeta>`;
    await fs.writeFile(xmpPath, minimalXMP, 'utf-8');
  }

  it('should evaluate Node 01 (neutral) + no user edits', async () => {
    // Asset with no XMP sidecar
    const assetPath = path.join(tempDir, 'test-image.NEF');
    await fs.writeFile(assetPath, 'fake RAW data');

    // Load Node 01 (should be neutral since no XMP)
    const node01State = await node01Loader.load(assetPath);

    expect(node01State.exposure).toBe(0);
    expect(node01State.temperature).toBe(6500);

    // Construct minimal graph with just Node 01
    const graph = {
      nodes: [
        {
          id: 'node-01',
          label: 'Base (from XMP)',
          bypass: false,
          position: { x: 0, y: 0 },
          state: {
            ...node01State,
            // Fill in missing fields with defaults
            highlights: 0,
            shadows: 0,
            whites: 0,
            blacks: 0,
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

    // Evaluate
    const result = evaluator.evaluateNodeGraph(graph);

    // Should match Node 01 exactly (no user edits)
    expect(result.flattenedState.exposure).toBe(0);
    expect(result.flattenedState.temperature).toBe(6500);
    expect(result.evaluatedNodeIds).toEqual(['node-01']);
  });

  it('should evaluate Node 01 (from XMP) + user edits', async () => {
    // Create asset with XMP sidecar
    const assetPath = path.join(tempDir, 'edited-image.NEF');
    const xmpPath = path.join(tempDir, 'edited-image.xmp');

    await fs.writeFile(assetPath, 'fake RAW data');

    // Create and write XMP with base adjustments
    await createEmptyXMP(xmpPath);
    await updateXMP(xmpPath, {
      exposure: 1.0,
      contrast: 20,
      temperature: 5500, // Warmer than neutral
      tint: 5,
      saturation: 10,
      vibrance: 15,
    });

    // Load Node 01 from XMP
    const node01State = await node01Loader.load(assetPath);

    expect(node01State.exposure).toBe(1.0);
    expect(node01State.temperature).toBe(5500);

    // Construct graph: Node 01 (XMP base) + Node 02 (user delta)
    const graph = {
      nodes: [
        {
          id: 'node-01',
          label: 'Base (from XMP)',
          bypass: false,
          position: { x: 0, y: 0 },
          state: {
            ...node01State,
            highlights: 0,
            shadows: 0,
            whites: 0,
            blacks: 0,
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
            exposure: 0.5, // Override: base 1.0 → final 0.5
            contrast: 0, // Zero = no override (base 20 persists)
            highlights: -15, // New delta
            shadows: 0,
            whites: 0,
            blacks: 0,
            temperature: 6500, // Neutral = no override (base 5500 persists)
            tint: 0, // Zero = no override (base 5 persists)
            vibrance: 0, // Zero = no override (base 15 persists)
            saturation: 0, // Zero = no override (base 10 persists)
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

    // Evaluate complete graph
    const result = evaluator.evaluateNodeGraph(graph);

    // Verify cumulative composition
    expect(result.flattenedState.exposure).toBe(0.5); // Node 02 override
    expect(result.flattenedState.contrast).toBe(20); // Node 01 persists
    expect(result.flattenedState.temperature).toBe(5500); // Node 01 persists (6500 in Node 02 = neutral = no override)
    expect(result.flattenedState.tint).toBe(5); // Node 01 persists
    expect(result.flattenedState.highlights).toBe(-15); // Node 02 new
    expect(result.flattenedState.vibrance).toBe(15); // Node 01 persists
    expect(result.flattenedState.saturation).toBe(10); // Node 01 persists
    expect(result.evaluatedNodeIds).toEqual(['node-01', 'node-02']);
  });

  it('should handle cache invalidation after XMP change', async () => {
    const assetPath = path.join(tempDir, 'cached-image.NEF');
    const xmpPath = path.join(tempDir, 'cached-image.xmp');

    await fs.writeFile(assetPath, 'fake RAW data');

    // Create and write initial XMP
    await createEmptyXMP(xmpPath);
    await updateXMP(xmpPath, { exposure: 1.0 });

    // First load (cache miss)
    const state1 = await node01Loader.load(assetPath);
    expect(state1.exposure).toBe(1.0);

    // Second load (cache hit)
    const metrics1 = node01Loader.getMetrics();
    const state2 = await node01Loader.load(assetPath);
    expect(state2.exposure).toBe(1.0);
    const metrics2 = node01Loader.getMetrics();

    // Verify cache hit
    expect(metrics2.cacheHits).toBeGreaterThan(metrics1.cacheHits);

    // Modify XMP (simulating user edit save)
    await new Promise((resolve) => setTimeout(resolve, 10)); // Ensure mtime changes
    await updateXMP(xmpPath, { exposure: 2.0 });

    // Third load (cache invalidated by mtime change)
    const state3 = await node01Loader.load(assetPath);
    expect(state3.exposure).toBe(2.0);

    // Verify evaluation uses new state
    const graph = {
      nodes: [
        {
          id: 'node-01',
          label: 'Base',
          bypass: false,
          position: { x: 0, y: 0 },
          state: {
            ...state3,
            highlights: 0,
            shadows: 0,
            whites: 0,
            blacks: 0,
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

    const result = evaluator.evaluateNodeGraph(graph);
    expect(result.flattenedState.exposure).toBe(2.0);
  });

  it('should demonstrate deterministic refresh on bypass toggle', async () => {
    const assetPath = path.join(tempDir, 'bypass-test.NEF');
    await fs.writeFile(assetPath, 'fake RAW data');

    // Node 01 neutral (no XMP)
    const node01State = await node01Loader.load(assetPath);

    const graph = {
      nodes: [
        {
          id: 'node-01',
          label: 'Base',
          bypass: false,
          position: { x: 0, y: 0 },
          state: {
            ...node01State,
            highlights: 0,
            shadows: 0,
            whites: 0,
            blacks: 0,
            hue: 0,
            clarity: 0,
            dehaze: 0,
          },
        },
        {
          id: 'node-02',
          label: 'Adjustment',
          bypass: false, // Initially active
          position: { x: 100, y: 0 },
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
        { from: 'node-01', to: 'node-02' },
        { from: 'node-02', to: 'output' },
      ],
    };

    // Evaluate with node-02 active
    const result1 = evaluator.evaluateNodeGraph(graph);
    expect(result1.flattenedState.exposure).toBe(1.5);

    // Toggle bypass on node-02
    graph.nodes[1].bypass = true;

    // Evaluate again (deterministic: should skip node-02)
    const result2 = evaluator.evaluateNodeGraph(graph);
    expect(result2.flattenedState.exposure).toBe(0); // Back to Node 01 (neutral)
    expect(result2.evaluatedNodeIds).toEqual(['node-01']); // node-02 skipped

    // Toggle bypass off
    graph.nodes[1].bypass = false;

    // Evaluate again (deterministic: node-02 active again)
    const result3 = evaluator.evaluateNodeGraph(graph);
    expect(result3.flattenedState.exposure).toBe(1.5);
    expect(result3.evaluatedNodeIds).toEqual(['node-01', 'node-02']);
  });
});
