/**
 * RedBulb Parity Test Suite
 * 
 * Defines all parity tests to ensure client preview and server export match
 */

import { createNeutralTest, type ParityTest } from './parity-test-framework';

// ============================================================================
// Test Suite Definition
// ============================================================================

/**
 * Core test suite - must pass before any deployment
 */
export const coreTests: ParityTest[] = [
  // Test 1: Neutral state (no adjustments)
  createNeutralTest(
    'neutral-base',
    'test-image-01.jpg',
    0.01 // 1% tolerance
  ),
  
  // Test 2: Exposure adjustment
  {
    ...createNeutralTest('exposure-plus-05', 'test-image-01.jpg', 0.01),
    input: {
      ...createNeutralTest('exposure-plus-05', 'test-image-01.jpg').input,
      nodeGraph: {
        ...createNeutralTest('exposure-plus-05', 'test-image-01.jpg').input.nodeGraph,
        nodes: [
          {
            ...createNeutralTest('exposure-plus-05', 'test-image-01.jpg').input.nodeGraph.nodes[0],
            state: {
              ...createNeutralTest('exposure-plus-05', 'test-image-01.jpg').input.nodeGraph.nodes[0].state,
              basic: {
                ...createNeutralTest('exposure-plus-05', 'test-image-01.jpg').input.nodeGraph.nodes[0].state.basic,
                exposure: 0.5,
              },
            },
          },
        ],
      },
    },
  },
  
  // Test 3: Contrast adjustment
  {
    ...createNeutralTest('contrast-plus-03', 'test-image-01.jpg', 0.01),
    input: {
      ...createNeutralTest('contrast-plus-03', 'test-image-01.jpg').input,
      nodeGraph: {
        ...createNeutralTest('contrast-plus-03', 'test-image-01.jpg').input.nodeGraph,
        nodes: [
          {
            ...createNeutralTest('contrast-plus-03', 'test-image-01.jpg').input.nodeGraph.nodes[0],
            state: {
              ...createNeutralTest('contrast-plus-03', 'test-image-01.jpg').input.nodeGraph.nodes[0].state,
              basic: {
                ...createNeutralTest('contrast-plus-03', 'test-image-01.jpg').input.nodeGraph.nodes[0].state.basic,
                contrast: 0.3,
              },
            },
          },
        ],
      },
    },
  },
  
  // Test 4: Temperature adjustment
  {
    ...createNeutralTest('temperature-warm', 'test-image-01.jpg', 0.01),
    input: {
      ...createNeutralTest('temperature-warm', 'test-image-01.jpg').input,
      nodeGraph: {
        ...createNeutralTest('temperature-warm', 'test-image-01.jpg').input.nodeGraph,
        nodes: [
          {
            ...createNeutralTest('temperature-warm', 'test-image-01.jpg').input.nodeGraph.nodes[0],
            state: {
              ...createNeutralTest('temperature-warm', 'test-image-01.jpg').input.nodeGraph.nodes[0].state,
              basic: {
                ...createNeutralTest('temperature-warm', 'test-image-01.jpg').input.nodeGraph.nodes[0].state.basic,
                temperature: 0.2,
              },
            },
          },
        ],
      },
    },
  },
  
  // Test 5: Saturation adjustment
  {
    ...createNeutralTest('saturation-plus-02', 'test-image-01.jpg', 0.01),
    input: {
      ...createNeutralTest('saturation-plus-02', 'test-image-01.jpg').input,
      nodeGraph: {
        ...createNeutralTest('saturation-plus-02', 'test-image-01.jpg').input.nodeGraph,
        nodes: [
          {
            ...createNeutralTest('saturation-plus-02', 'test-image-01.jpg').input.nodeGraph.nodes[0],
            state: {
              ...createNeutralTest('saturation-plus-02', 'test-image-01.jpg').input.nodeGraph.nodes[0].state,
              basic: {
                ...createNeutralTest('saturation-plus-02', 'test-image-01.jpg').input.nodeGraph.nodes[0].state.basic,
                saturation: 0.2,
              },
            },
          },
        ],
      },
    },
  },
  
  // TODO: Add more tests
  // - Highlights/shadows
  // - Curves
  // - HSL
  // - Color wheels
  // - Multiple nodes
  // - Bypass behavior
];

/**
 * Extended test suite - comprehensive coverage
 */
export const extendedTests: ParityTest[] = [
  ...coreTests,
  // TODO: Add more comprehensive tests
];

/**
 * Get test suite by name
 */
export function getTestSuite(name: 'core' | 'extended' = 'core'): ParityTest[] {
  switch (name) {
    case 'core':
      return coreTests;
    case 'extended':
      return extendedTests;
    default:
      return coreTests;
  }
}
