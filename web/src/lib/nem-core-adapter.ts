/**
 * nem-core-adapter.ts — TEST COMPATIBILITY ONLY
 * 
 * Minimal exports for test files during transition.
 * Production code uses nem-core directly.
 * 
 * @deprecated For test compatibility only
 */

import type { DevelopState as WebDevelopState } from './components/asset-viewer/editor/node-types';
import type { DevelopState as CoreDevelopState } from '@redbulb/nem-core';
import { createNeutralDevelopState } from '@redbulb/nem-core';

// Re-export for tests
export { createNeutralDevelopState };

// Stub functions for test compatibility
export function webToCore(web: WebDevelopState): CoreDevelopState {
  return web as CoreDevelopState;
}

export function coreToWeb(core: CoreDevelopState): WebDevelopState {
  return core as WebDevelopState;
}
