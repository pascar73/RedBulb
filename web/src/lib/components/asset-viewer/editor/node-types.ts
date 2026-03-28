/**
 * node-types.ts — Node graph data model for RedBulb's DaVinci-style processing pipeline.
 *
 * Each node represents a processing module. In Phase 1 (serial chain),
 * nodes execute left-to-right. Future phases add parallel and layer nodes.
 *
 * The node graph is the canonical representation of edits.
 * The legacy slider UI generates a node graph behind the scenes.
 */

// ══════════════════════════════════════════════════════════════
// NODE TYPE DEFINITIONS
// ══════════════════════════════════════════════════════════════

export type NodeType =
  | 'exposure'       // Exposure, brightness, highlights, shadows, whites, blacks
  | 'contrast'       // Contrast + fade
  | 'temperature'    // White balance: temperature + tint
  | 'saturation'     // Saturation + vibrance
  | 'curves'         // RGB tone curves with endpoints
  | 'filmicToneMap'  // AgX filmic tone mapping
  | 'caCorrection'   // Chromatic aberration correction
  | 'dehaze'         // Dark channel prior
  | 'clarity'        // Unsharp mask (large radius) + texture
  | 'sharpen'        // Unsharp mask (small radius)
  | 'denoise'        // Bilateral filter
  | 'hsl'            // OKLCh HSL per-channel adjustments
  | 'colorGrade'     // 3-way color wheels
  | 'grain'          // Film grain (multi-octave)
  | 'vignette';      // Radial vignette

export interface NodeDefinition {
  type: NodeType;
  label: string;
  icon: string;       // Emoji or SVG path ref
  category: 'light' | 'color' | 'detail' | 'effects' | 'creative';
  defaultParams: Record<string, unknown>;
  /** Parameter schema for UI generation */
  paramDefs: ParamDef[];
}

export interface ParamDef {
  key: string;
  label: string;
  type: 'number' | 'select' | 'curve' | 'hsl' | 'colorWheel';
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
}

// ══════════════════════════════════════════════════════════════
// NODE INSTANCE (runtime)
// ══════════════════════════════════════════════════════════════

export interface ProcessingNode {
  id: string;        // Unique ID (uuid or nanoid)
  type: NodeType;
  label: string;     // User-editable label (defaults to definition label)
  enabled: boolean;
  params: Record<string, unknown>;
  /** Position in the visual editor (x, y in canvas coords) */
  position: { x: number; y: number };
}

// ══════════════════════════════════════════════════════════════
// NODE GRAPH (serial chain for Phase 1)
// ══════════════════════════════════════════════════════════════

export interface NodeGraph {
  version: 2;        // version 1 = legacy sliders, version 2 = node graph
  nodes: ProcessingNode[];
  /** Future: connections for parallel/layer graphs */
  // connections: Connection[];
}

// ══════════════════════════════════════════════════════════════
// NODE REGISTRY — all available node types
// ══════════════════════════════════════════════════════════════

export const NODE_REGISTRY: Record<NodeType, NodeDefinition> = {
  exposure: {
    type: 'exposure',
    label: 'Exposure',
    icon: '☀️',
    category: 'light',
    defaultParams: { exposure: 0, brightness: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0 },
    paramDefs: [
      { key: 'exposure', label: 'Exposure', type: 'number', min: -5, max: 5, step: 0.1 },
      { key: 'brightness', label: 'Brightness', type: 'number', min: -1, max: 1, step: 0.01 },
      { key: 'highlights', label: 'Highlights', type: 'number', min: -1, max: 1, step: 0.01 },
      { key: 'shadows', label: 'Shadows', type: 'number', min: -1, max: 1, step: 0.01 },
      { key: 'whites', label: 'Whites', type: 'number', min: -1, max: 1, step: 0.01 },
      { key: 'blacks', label: 'Blacks', type: 'number', min: -1, max: 1, step: 0.01 },
    ],
  },
  contrast: {
    type: 'contrast',
    label: 'Contrast',
    icon: '◑',
    category: 'light',
    defaultParams: { contrast: 0, fade: 0 },
    paramDefs: [
      { key: 'contrast', label: 'Contrast', type: 'number', min: -1, max: 1, step: 0.01 },
      { key: 'fade', label: 'Fade', type: 'number', min: 0, max: 1, step: 0.01 },
    ],
  },
  temperature: {
    type: 'temperature',
    label: 'White Balance',
    icon: '🌡️',
    category: 'color',
    defaultParams: { temperature: 0, tint: 0 },
    paramDefs: [
      { key: 'temperature', label: 'Temperature', type: 'number', min: -1, max: 1, step: 0.01 },
      { key: 'tint', label: 'Tint', type: 'number', min: -1, max: 1, step: 0.01 },
    ],
  },
  saturation: {
    type: 'saturation',
    label: 'Saturation',
    icon: '🎨',
    category: 'color',
    defaultParams: { saturation: 0, vibrance: 0 },
    paramDefs: [
      { key: 'saturation', label: 'Saturation', type: 'number', min: -1, max: 1, step: 0.01 },
      { key: 'vibrance', label: 'Vibrance', type: 'number', min: -1, max: 1, step: 0.01 },
    ],
  },
  curves: {
    type: 'curves',
    label: 'Curves',
    icon: '📈',
    category: 'light',
    defaultParams: {
      points: { master: [], red: [], green: [], blue: [] },
      endpoints: {
        master: { black: { x: 0, y: 0 }, white: { x: 1, y: 1 } },
        red: { black: { x: 0, y: 0 }, white: { x: 1, y: 1 } },
        green: { black: { x: 0, y: 0 }, white: { x: 1, y: 1 } },
        blue: { black: { x: 0, y: 0 }, white: { x: 1, y: 1 } },
      },
    },
    paramDefs: [{ key: 'curves', label: 'Tone Curves', type: 'curve' }],
  },
  filmicToneMap: {
    type: 'filmicToneMap',
    label: 'Filmic',
    icon: '🎬',
    category: 'creative',
    defaultParams: { enabled: true }, // toggle node on/off
    paramDefs: [],
  },
  caCorrection: {
    type: 'caCorrection',
    label: 'CA Correction',
    icon: '🔍',
    category: 'detail',
    defaultParams: { amount: 0 },
    paramDefs: [
      { key: 'amount', label: 'Amount', type: 'number', min: 0, max: 1, step: 0.01 },
    ],
  },
  dehaze: {
    type: 'dehaze',
    label: 'Dehaze',
    icon: '🌫️',
    category: 'detail',
    defaultParams: { amount: 0 },
    paramDefs: [
      { key: 'amount', label: 'Amount', type: 'number', min: -1, max: 1, step: 0.01 },
    ],
  },
  clarity: {
    type: 'clarity',
    label: 'Clarity',
    icon: '💎',
    category: 'detail',
    defaultParams: { clarity: 0, texture: 0 },
    paramDefs: [
      { key: 'clarity', label: 'Clarity', type: 'number', min: -1, max: 1, step: 0.01 },
      { key: 'texture', label: 'Texture', type: 'number', min: -1, max: 1, step: 0.01 },
    ],
  },
  sharpen: {
    type: 'sharpen',
    label: 'Sharpen',
    icon: '🔪',
    category: 'detail',
    defaultParams: { amount: 0 },
    paramDefs: [
      { key: 'amount', label: 'Amount', type: 'number', min: 0, max: 1, step: 0.01 },
    ],
  },
  denoise: {
    type: 'denoise',
    label: 'Denoise',
    icon: '🤫',
    category: 'detail',
    defaultParams: { amount: 0 },
    paramDefs: [
      { key: 'amount', label: 'Amount', type: 'number', min: 0, max: 1, step: 0.01 },
    ],
  },
  hsl: {
    type: 'hsl',
    label: 'HSL',
    icon: '🌈',
    category: 'color',
    defaultParams: {
      channels: {
        red: { h: 0, s: 0, l: 0 }, orange: { h: 0, s: 0, l: 0 },
        yellow: { h: 0, s: 0, l: 0 }, green: { h: 0, s: 0, l: 0 },
        aqua: { h: 0, s: 0, l: 0 }, blue: { h: 0, s: 0, l: 0 },
        purple: { h: 0, s: 0, l: 0 }, magenta: { h: 0, s: 0, l: 0 },
      },
    },
    paramDefs: [{ key: 'hsl', label: 'HSL Channels', type: 'hsl' }],
  },
  colorGrade: {
    type: 'colorGrade',
    label: 'Color Grade',
    icon: '🎡',
    category: 'color',
    defaultParams: {
      shadows: { hue: 0, sat: 0, lum: 0 },
      midtones: { hue: 0, sat: 0, lum: 0 },
      highlights: { hue: 0, sat: 0, lum: 0 },
    },
    paramDefs: [{ key: 'colorWheels', label: 'Color Wheels', type: 'colorWheel' }],
  },
  grain: {
    type: 'grain',
    label: 'Film Grain',
    icon: '🎞️',
    category: 'effects',
    defaultParams: { amount: 0, size: 25, roughness: 50 },
    paramDefs: [
      { key: 'amount', label: 'Amount', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'size', label: 'Size', type: 'number', min: 1, max: 100, step: 1 },
      { key: 'roughness', label: 'Roughness', type: 'number', min: 0, max: 100, step: 1 },
    ],
  },
  vignette: {
    type: 'vignette',
    label: 'Vignette',
    icon: '⚫',
    category: 'effects',
    defaultParams: { amount: 0, midpoint: 50, roundness: 0, feather: 50, highlights: 0 },
    paramDefs: [
      { key: 'amount', label: 'Amount', type: 'number', min: -1, max: 1, step: 0.01 },
      { key: 'midpoint', label: 'Midpoint', type: 'number', min: 0, max: 100, step: 1 },
      { key: 'roundness', label: 'Roundness', type: 'number', min: -100, max: 100, step: 1 },
      { key: 'feather', label: 'Feather', type: 'number', min: 0, max: 100, step: 1 },
      { key: 'highlights', label: 'Highlights', type: 'number', min: 0, max: 100, step: 1 },
    ],
  },
};

// ══════════════════════════════════════════════════════════════
// DEFAULT PIPELINE — the standard serial chain
// ══════════════════════════════════════════════════════════════

/** Default node order matching DaVinci Resolve's color page flow */
export const DEFAULT_NODE_ORDER: NodeType[] = [
  'exposure',
  'contrast',
  'temperature',
  'saturation',
  'curves',
  'filmicToneMap',
  'caCorrection',
  'dehaze',
  'clarity',
  'sharpen',
  'denoise',
  'hsl',
  'colorGrade',
  'vignette',
  'grain',
];

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

let _idCounter = 0;
export function generateNodeId(): string {
  return `node_${Date.now()}_${++_idCounter}`;
}

/** Create a new node with default params */
export function createNode(type: NodeType, overrides?: Partial<ProcessingNode>): ProcessingNode {
  const def = NODE_REGISTRY[type];
  return {
    id: generateNodeId(),
    type,
    label: def.label,
    enabled: true,
    params: { ...def.defaultParams },
    position: { x: 0, y: 0 },
    ...overrides,
  };
}

/** Create the default serial pipeline as a node graph */
export function createDefaultGraph(): NodeGraph {
  const NODE_W = 80, NODE_GAP = 16, PAD_LEFT = 30, PAD_TOP = 40;
  const nodes = DEFAULT_NODE_ORDER.map((type, i) => {
    const node = createNode(type);
    node.position = { x: PAD_LEFT + i * (NODE_W + NODE_GAP), y: PAD_TOP };
    if (type === 'filmicToneMap') node.enabled = false;
    return node;
  });
  return { version: 2, nodes };
}

/**
 * Convert legacy flat slider state (version 1) to a node graph (version 2).
 * This is the bridge between the old UI and the new node system.
 */
export function legacyStateToNodeGraph(state: Record<string, unknown>): NodeGraph {
  const b = (state as any).basic || {};
  const c = (state as any).color || {};
  const d = (state as any).details || {};
  const e = (state as any).effects || {};
  const curves = (state as any).curves || {};
  const curveEndpoints = (state as any).curveEndpoints || {};
  const hsl = (state as any).hsl || {};
  const colorWheels = (state as any).colorWheels || {};
  const toneMapper = (state as any).toneMapper || 'none';

  const graph = createDefaultGraph();

  // Map legacy params to nodes
  for (const node of graph.nodes) {
    switch (node.type) {
      case 'exposure':
        node.params = {
          exposure: b.exposure ?? 0, brightness: b.brightness ?? 0,
          highlights: b.highlights ?? 0, shadows: b.shadows ?? 0,
          whites: b.whites ?? 0, blacks: b.blacks ?? 0,
        };
        break;
      case 'contrast':
        node.params = { contrast: b.contrast ?? 0, fade: e.fade ?? 0 };
        break;
      case 'temperature':
        node.params = { temperature: c.temperature ?? 0, tint: c.tint ?? 0 };
        break;
      case 'saturation':
        node.params = { saturation: c.saturation ?? 0, vibrance: c.vibrance ?? 0 };
        break;
      case 'curves':
        node.params = { points: { ...curves }, endpoints: { ...curveEndpoints } };
        break;
      case 'filmicToneMap':
        node.enabled = toneMapper === 'filmic';
        break;
      case 'caCorrection':
        node.params = { amount: d.caCorrection ?? 0 };
        break;
      case 'dehaze':
        node.params = { amount: d.dehaze ?? 0 };
        break;
      case 'clarity':
        node.params = { clarity: d.clarity ?? 0, texture: e.texture ?? 0 };
        break;
      case 'sharpen':
        node.params = { amount: d.sharpness ?? 0 };
        break;
      case 'denoise':
        node.params = { amount: d.noiseReduction ?? 0 };
        break;
      case 'hsl':
        node.params = { channels: { ...hsl } };
        break;
      case 'colorGrade':
        node.params = { ...colorWheels };
        break;
      case 'grain':
        node.params = { amount: e.grain ?? 0, size: e.grainSize ?? 25, roughness: e.grainRoughness ?? 50 };
        break;
      case 'vignette':
        node.params = {
          amount: e.vignette ?? 0, midpoint: e.vignetteMidpoint ?? 50,
          roundness: e.vignetteRoundness ?? 0, feather: e.vignetteFeather ?? 50,
          highlights: e.vignetteHighlights ?? 0,
        };
        break;
    }
  }

  return graph;
}

/** Check if a node has non-default params (i.e. it actually does something) */
export function nodeIsActive(node: ProcessingNode): boolean {
  if (!node.enabled) return false;
  const def = NODE_REGISTRY[node.type];
  if (!def) return false;
  // filmicToneMap is active when enabled
  if (node.type === 'filmicToneMap') return true;
  // For numeric params, check if any differ from default
  return Object.keys(def.defaultParams).some(key => {
    const val = node.params[key];
    const defVal = def.defaultParams[key];
    if (typeof val === 'number' && typeof defVal === 'number') return Math.abs(val - defVal) > 0.001;
    if (typeof val === 'object' && typeof defVal === 'object') return JSON.stringify(val) !== JSON.stringify(defVal);
    return val !== defVal;
  });
}
