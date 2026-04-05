/**
 * types.ts — Core NEM type definitions
 * 
 * Shared types for Node Editor Module across all platforms (server/web/desktop)
 */

/**
 * Complete develop state for a single image
 * Matches RedBulb/RapidRAW processing pipeline
 */
export interface DevelopState {
  // Basic adjustments
  exposure: number;          // -5.0 to +5.0
  contrast: number;          // -100 to +100
  highlights: number;        // -100 to +100
  shadows: number;           // -100 to +100
  whites: number;            // -100 to +100
  blacks: number;            // -100 to +100
  temperature: number;       // 2000 to 50000 (Kelvin)
  tint: number;              // -150 to +150
  vibrance: number;          // -100 to +100
  saturation: number;        // -100 to +100
  hue: number;               // -180 to +180
  clarity: number;           // -100 to +100
  dehaze: number;            // -100 to +100

  // Tone curve points
  curves?: {
    master?: Array<{ x: number; y: number }>;
    red?: Array<{ x: number; y: number }>;
    green?: Array<{ x: number; y: number }>;
    blue?: Array<{ x: number; y: number }>;
  };

  // Curve endpoints (black/white points)
  curveEndpoints?: {
    master?: { black?: { x: number; y: number }; white?: { x: number; y: number } };
    red?: { black?: { x: number; y: number }; white?: { x: number; y: number } };
    green?: { black?: { x: number; y: number }; white?: { x: number; y: number } };
    blue?: { black?: { x: number; y: number }; white?: { x: number; y: number } };
  };

  // Color wheels (lift/gamma/gain style)
  colorWheels?: {
    shadows?: { hue: number; sat: number; lum: number };
    midtones?: { hue: number; sat: number; lum: number };
    highlights?: { hue: number; sat: number; lum: number };
  };

  // HSL adjustments (per-color channel)
  hsl?: {
    red?: { h: number; s: number; l: number };
    orange?: { h: number; s: number; l: number };
    yellow?: { h: number; s: number; l: number };
    green?: { h: number; s: number; l: number };
    aqua?: { h: number; s: number; l: number };
    blue?: { h: number; s: number; l: number };
    purple?: { h: number; s: number; l: number };
    magenta?: { h: number; s: number; l: number };
  };

  // Details/sharpening
  details?: {
    texture?: number;           // -100 to +100
    sharpness?: number;         // -100 to +100
    noiseReduction?: number;    // 0 to 100
    clarity?: number;           // -100 to +100
  };

  // Effects
  effects?: {
    vignette?: number;          // 0 to 100
    vignetteMidpoint?: number;  // 0 to 100
    vignetteRoundness?: number; // -100 to +100
    vignetteFeather?: number;   // 0 to 100
    vignetteHighlights?: number; // -100 to +100
    grain?: number;             // 0 to 100
    grainSize?: number;         // 0 to 100
    grainRoughness?: number;    // 0 to 100
    fade?: number;              // 0 to 100
  };

  // Tone mapping
  toneMapper?: 'none' | 'aces' | 'reinhard' | 'filmic' | 'uncharted';

  // Geometry transforms
  geometry?: {
    rotation?: number;      // -180 to +180 degrees
    distortion?: number;    // -100 to +100
    vertical?: number;      // -100 to +100
    horizontal?: number;    // -100 to +100
    scale?: number;         // 0.1 to 10.0
  };
}

/**
 * A single node in the editor graph
 */
export interface Node {
  id: string;
  label: string;
  bypass: boolean;
  position: { x: number; y: number };
  state: DevelopState;
}

/**
 * Connection between nodes
 */
export interface NodeConnection {
  from: string; // 'input' | node.id
  to: string;   // 'output' | node.id
}

/**
 * Complete node graph structure
 */
export interface NodeGraph {
  nodes: Node[];
  connections: NodeConnection[];
}

/**
 * Options for graph evaluation
 */
export interface EvalOptions {
  stopAtNodeId?: string;      // Stop evaluation at this node (inclusive)
  includeBypassed?: boolean;  // Include bypassed nodes in evaluation (default: false)
}

/**
 * Result of graph evaluation
 */
export interface EvalResult {
  flattenedState: DevelopState;  // Final composed state
  evaluatedNodeIds: string[];    // IDs of nodes that were evaluated
  warnings: string[];            // Any warnings during evaluation
}

/**
 * Neutral/zero develop state (no adjustments)
 */
export function createNeutralDevelopState(): DevelopState {
  return {
    exposure: 0,
    contrast: 0,
    highlights: 0,
    shadows: 0,
    whites: 0,
    blacks: 0,
    temperature: 6500, // Neutral white balance (daylight)
    tint: 0,
    vibrance: 0,
    saturation: 0,
    hue: 0,
    clarity: 0,
    dehaze: 0,
  };
}
