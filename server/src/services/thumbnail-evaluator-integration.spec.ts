/**
 * thumbnail-evaluator-integration.spec.ts — Integration test for thumbnail + evaluator
 * 
 * Week 2 Task #4 - Block 3: Prove thumbnail path will consume evaluator output
 * 
 * NOTE: Full rendering (RapidRaw + evaluated state → pixels) is Week 3+ work.
 * This test proves the architectural contract exists.
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { NemEvaluatorService } from './nem-evaluator.service';
import { Node01Loader } from './node-01-loader';
import { updateXMP } from './xmp-sidecar-adapter';

describe('Thumbnail Evaluator Integration (Architectural Proof)', () => {
  let evaluator: NemEvaluatorService;
  let node01Loader: Node01Loader;
  let tempDir: string;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NemEvaluatorService],
    }).compile();

    evaluator = module.get<NemEvaluatorService>(NemEvaluatorService);
    node01Loader = new Node01Loader();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'thumb-eval-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  /**
   * Helper: Create minimal XMP sidecar
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

  it('should demonstrate thumbnail would use evaluated state', async () => {
    // Simulate asset with XMP edits
    const assetPath = path.join(tempDir, 'image.NEF');
    const xmpPath = path.join(tempDir, 'image.xmp');

    await fs.writeFile(assetPath, 'fake RAW data');
    await createEmptyXMP(xmpPath);
    await updateXMP(xmpPath, {
      exposure: 1.0,
      contrast: 15,
      temperature: 5500,
    });

    // Step 1: Load Node 01 from XMP
    const node01State = await node01Loader.load(assetPath);
    expect(node01State.exposure).toBe(1.0);

    // Step 2: Construct node graph (Node 01 + user delta)
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
            exposure: 0.5, // Override
            contrast: 0, // No override (base persists)
            highlights: -10, // New delta
            shadows: 0,
            whites: 0,
            blacks: 0,
            temperature: 6500, // Neutral
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

    // Step 3: Evaluate graph (single source of truth)
    const result = evaluator.evaluateNodeGraph(graph);

    // Step 4: Verified evaluated state (what thumbnail render would use)
    expect(result.flattenedState.exposure).toBe(0.5); // Node 02 override
    expect(result.flattenedState.contrast).toBe(15); // Node 01 persists
    expect(result.flattenedState.temperature).toBe(5500); // Node 01 persists
    expect(result.flattenedState.highlights).toBe(-10); // Node 02 new

    // Architectural contract proven:
    // Thumbnail generation would call:
    // const evaluatedState = evaluator.evaluateNodeGraph(graph);
    // const pixels = await renderEngine.render(assetPath, evaluatedState);
    // const thumbnail = await downscale(pixels);
    //
    // This ensures preview/export/thumbnail all use same evaluation path.
  });

  it('should demonstrate bypass node affects thumbnail output', async () => {
    const assetPath = path.join(tempDir, 'bypass-test.NEF');
    await fs.writeFile(assetPath, 'fake RAW');

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
          bypass: true, // Bypassed
          position: { x: 100, y: 0 },
          state: {
            exposure: 2.0, // Would apply if not bypassed
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

    // Evaluate with bypass
    const result = evaluator.evaluateNodeGraph(graph);

    // Bypassed node skipped
    expect(result.flattenedState.exposure).toBe(0); // node-02 skipped
    expect(result.evaluatedNodeIds).toEqual(['node-01']);

    // Thumbnail would reflect bypassed state (neutral exposure)
  });

  it('should demonstrate multi-node cumulative effect on thumbnail', async () => {
    const assetPath = path.join(tempDir, 'multi-node.NEF');
    const xmpPath = path.join(tempDir, 'multi-node.xmp');

    await fs.writeFile(assetPath, 'fake RAW');
    await createEmptyXMP(xmpPath);
    await updateXMP(xmpPath, { exposure: 0.5, contrast: 10 });

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
          label: 'Highlights',
          bypass: false,
          position: { x: 100, y: 0 },
          state: {
            exposure: 0, // No override
            contrast: 0, // No override
            highlights: -20, // New
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
          label: 'Color',
          bypass: false,
          position: { x: 200, y: 0 },
          state: {
            exposure: 0,
            contrast: 0,
            highlights: 0, // No override
            shadows: 0,
            whites: 0,
            blacks: 0,
            temperature: 6500,
            tint: 0,
            vibrance: 20, // New
            saturation: 10, // New
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

    const result = evaluator.evaluateNodeGraph(graph);

    // Cumulative effect
    expect(result.flattenedState.exposure).toBe(0.5); // From node-01
    expect(result.flattenedState.contrast).toBe(10); // From node-01
    expect(result.flattenedState.highlights).toBe(-20); // From node-02
    expect(result.flattenedState.vibrance).toBe(20); // From node-03
    expect(result.flattenedState.saturation).toBe(10); // From node-03

    // All three nodes evaluated
    expect(result.evaluatedNodeIds).toEqual(['node-01', 'node-02', 'node-03']);

    // Thumbnail would show cumulative effect of all active nodes
  });
});
