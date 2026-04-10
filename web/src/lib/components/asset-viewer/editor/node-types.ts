/**
 * node-types.ts — DaVinci Resolve-style node graph for RedBulb.
 *
 * v2 Architecture:
 * - Each node is a FULL develop state container (not a single function)
 * - Nodes apply as cumulative deltas — only non-zero params affect the image
 * - Start with 1 node, max 10
 * - Geometry (rotation, perspective, distortion) is GLOBAL, not per-node
 * - Selecting a node loads its state into the develop panel
 */

let _nodeCounter = 0;


export const NODE_W = 160;
export const NODE_GAP = 24;
export const MAX_NODES = 10;
export const TOP_PAD = 40;
export const SIDE_PAD = 24;
// ══════════════════════════════════════════════════════════════
// DEVELOP STATE V1 (Legacy Nested Format — kept for migration)
// ══════════════════════════════════════════════════════════════

/** Legacy V1 develop state with nested groups (basic/color/details/effects) */
export interface DevelopStateV1 {
  version: 1;
  basic: {
    exposure: number;
    contrast: number;
    highlights: number;
    shadows: number;
    whites: number;
    blacks: number;
    brightness: number;
  };
  color: {
    saturation: number;
    temperature: number;
    tint: number;
    vibrance: number;
  };
  toneMapper: 'none' | 'filmic';
  details: {
    sharpness: number;
    noiseReduction: number;
    clarity: number;
    dehaze: number;
    caCorrection: number;
  };
  effects: {
    texture: number;
    vignette: number;
    vignetteMidpoint: number;
    vignetteRoundness: number;
    vignetteFeather: number;
    vignetteHighlights: number;
    grain: number;
    grainSize: number;
    grainRoughness: number;
    fade: number;
  };
  curves: {
    master: Array<{ x: number; y: number }>;
    red: Array<{ x: number; y: number }>;
    green: Array<{ x: number; y: number }>;
    blue: Array<{ x: number; y: number }>;
  };
  curveEndpoints: {
    master: { black: { x: number; y: number }; white: { x: number; y: number } };
    red: { black: { x: number; y: number }; white: { x: number; y: number } };
    green: { black: { x: number; y: number }; white: { x: number; y: number } };
    blue: { black: { x: number; y: number }; white: { x: number; y: number } };
  };
  colorWheels: {
    shadows: { hue: number; sat: number; lum: number };
    midtones: { hue: number; sat: number; lum: number };
    highlights: { hue: number; sat: number; lum: number };
  };
  hsl: Record<string, { h: number; s: number; l: number }>;
}

// ══════════════════════════════════════════════════════════════
// DEVELOP STATE — Canonical Flat Format (matches @redbulb/nem-core)
// ══════════════════════════════════════════════════════════════

/**
 * Canonical flat develop state matching @redbulb/nem-core types.
 * 
 * Migration from V1:
 * - DROPPED: version, brightness, caCorrection (web-only, not implemented)
 * - ADDED: hue (default 0, was missing in web)
 * - MOVED: texture from effects → details
 * - FLATTENED: basic.* and color.* to top level
 */
export interface DevelopState {
  // Tonal adjustments (flattened from basic group)
  exposure: number;        // -5.0 to +5.0
  contrast: number;        // -100 to +100
  highlights: number;      // -100 to +100
  shadows: number;         // -100 to +100
  whites: number;          // -100 to +100
  blacks: number;          // -100 to +100
  
  // Color adjustments (flattened from color group)
  temperature: number;     // 2000-50000 (Kelvin, neutral = 6500K)
  tint: number;            // -150 to +150
  saturation: number;      // -100 to +100
  vibrance: number;        // -100 to +100
  hue: number;             // -180 to +180 (NEW: was missing in V1)
  
  // Detail adjustments (top-level for backward compat)
  clarity: number;         // -100 to +100
  dehaze: number;          // -100 to +100
  
  // Optional: Details group
  details?: {
    texture?: number;           // -100 to +100 (MOVED from effects)
    sharpness?: number;         // -100 to +100
    noiseReduction?: number;    // 0 to 100
    clarity?: number;           // -100 to +100 (duplicate)
  };
  
  // Optional: Effects group
  effects?: {
    vignette?: number;          // 0 to 100
    vignetteMidpoint?: number;  // 0 to 100 (UI default = 50)
    vignetteRoundness?: number; // -100 to +100
    vignetteFeather?: number;   // 0 to 100
    vignetteHighlights?: number;// -100 to +100
    grain?: number;             // 0 to 100
    grainSize?: number;         // 0 to 100
    grainRoughness?: number;    // 0 to 100
    fade?: number;              // 0 to 100
  };
  
  // Curves (optional, defaults to identity)
  curves?: {
    master?: Array<{ x: number; y: number }>;
    red?: Array<{ x: number; y: number }>;
    green?: Array<{ x: number; y: number }>;
    blue?: Array<{ x: number; y: number }>;
  };
  
  // Curve endpoints (optional)
  curveEndpoints?: {
    master?: { black?: { x: number; y: number }; white?: { x: number; y: number } };
    red?: { black?: { x: number; y: number }; white?: { x: number; y: number } };
    green?: { black?: { x: number; y: number }; white?: { x: number; y: number } };
    blue?: { black?: { x: number; y: number }; white?: { x: number; y: number } };
  };
  
  // Color wheels (optional)
  colorWheels?: {
    shadows?: { hue: number; sat: number; lum: number };
    midtones?: { hue: number; sat: number; lum: number };
    highlights?: { hue: number; sat: number; lum: number };
  };
  
  // HSL per-color adjustments (optional)
  hsl?: Record<string, { h: number; s: number; l: number }>;
  
  // Tone mapping algorithm (widened options)
  toneMapper?: 'none' | 'aces' | 'reinhard' | 'filmic' | 'uncharted';
}

/** Geometry state — GLOBAL, not per-node (like DaVinci Resolve) */
export interface GeometryState {
  rotation: number;
  distortion: number;
  vertical: number;
  horizontal: number;
  scale: number;
}

// ══════════════════════════════════════════════════════════════
// NODE INSTANCE
// ══════════════════════════════════════════════════════════════

export interface CorrectorNode {
  id: string;
  label: string;         // User-editable ("01", "Base Grade", etc.)
  state: DevelopState;   // Full develop state for this node
  bypass: boolean;       // When true, node is skipped in processing
  position: { x: number; y: number }; // Canvas position for editor
}

// ══════════════════════════════════════════════════════════════
// NODE GRAPH (v2)
// ══════════════════════════════════════════════════════════════

/** Explicit connection between nodes (directed edge) */
export interface NodeConnection {
  from: string;  // Source node ID (or "input" for graph input)
  to: string;    // Target node ID (or "output" for graph output)
}

export interface NodeGraphV2 {
  version: 2;
  selectedNodeId: string;
  nodes: CorrectorNode[];
  connections: NodeConnection[];  // Explicit topology (not inferred from X position)
  geometry: GeometryState;  // Global geometry, not per-node
}

/** Legacy v1 state (single develop state, no nodes) */
export type LegacyState = DevelopStateV1 & { geometry?: GeometryState };

// ══════════════════════════════════════════════════════════════
// DEFAULTS
// ══════════════════════════════════════════════════════════════

/** Create an empty develop state (all zeros, neutral temperature) */
export function createEmptyDevelopState(): DevelopState {
  return {
    // Tonal adjustments
    exposure: 0,
    contrast: 0,
    highlights: 0,
    shadows: 0,
    whites: 0,
    blacks: 0,
    
    // Color adjustments
    temperature: 6500,
    tint: 0,
    saturation: 0,
    vibrance: 0,
    hue: 0,
    
    // Detail adjustments (top-level)
    clarity: 0,
    dehaze: 0,
    
    // Optional groups with defaults
    details: {
      texture: 0,
      sharpness: 0,
      noiseReduction: 0,
      clarity: 0,
    },
    effects: {
      vignette: 0,
      vignetteMidpoint: 50,
      vignetteRoundness: 0,
      vignetteFeather: 50,
      vignetteHighlights: 0,
      grain: 0,
      grainSize: 25,
      grainRoughness: 50,
      fade: 0,
    },
    curves: {
      master: [],
      red: [],
      green: [],
      blue: [],
    },
    curveEndpoints: {
      master: { black: { x: 0, y: 0 }, white: { x: 1, y: 1 } },
      red: { black: { x: 0, y: 0 }, white: { x: 1, y: 1 } },
      green: { black: { x: 0, y: 0 }, white: { x: 1, y: 1 } },
      blue: { black: { x: 0, y: 0 }, white: { x: 1, y: 1 } },
    },
    colorWheels: {
      shadows: { hue: 0, sat: 0, lum: 0 },
      midtones: { hue: 0, sat: 0, lum: 0 },
      highlights: { hue: 0, sat: 0, lum: 0 },
    },
    hsl: {},
    toneMapper: 'none',
  };
}

/** Check if a develop state has any non-default values */
export function hasActiveChanges(state: DevelopState): boolean {
  // Check top-level scalars
  if (state.exposure !== 0) return true;
  if (state.contrast !== 0) return true;
  if (state.highlights !== 0) return true;
  if (state.shadows !== 0) return true;
  if (state.whites !== 0) return true;
  if (state.blacks !== 0) return true;
  if (state.temperature !== 6500) return true;
  if (state.tint !== 0) return true;
  if (state.saturation !== 0) return true;
  if (state.vibrance !== 0) return true;
  if (state.hue !== 0) return true;
  if (state.clarity !== 0) return true;
  if (state.dehaze !== 0) return true;
  
  // Check optional groups
  if (state.details?.texture) return true;
  if (state.details?.sharpness) return true;
  if (state.details?.noiseReduction) return true;
  if (state.details?.clarity) return true;
  
  if (state.effects?.vignette) return true;
  if (state.effects?.grain) return true;
  if (state.effects?.fade) return true;
  
  // Check curves (non-empty means active)
  if (state.curves?.master?.length) return true;
  if (state.curves?.red?.length) return true;
  if (state.curves?.green?.length) return true;
  if (state.curves?.blue?.length) return true;
  
  // Check color wheels
  if (state.colorWheels?.shadows?.hue || state.colorWheels?.shadows?.sat || state.colorWheels?.shadows?.lum) return true;
  if (state.colorWheels?.midtones?.hue || state.colorWheels?.midtones?.sat || state.colorWheels?.midtones?.lum) return true;
  if (state.colorWheels?.highlights?.hue || state.colorWheels?.highlights?.sat || state.colorWheels?.highlights?.lum) return true;
  
  // Check HSL
  if (state.hsl && Object.keys(state.hsl).length > 0) {
    for (const vals of Object.values(state.hsl)) {
      if (vals.h !== 0 || vals.s !== 0 || vals.l !== 0) return true;
    }
  }
  
  // Check tone mapper
  if (state.toneMapper && state.toneMapper !== 'none') return true;
  
  return false;
}

/**
 * Merge multiple corrector nodes into a single develop state.
 * Cumulative deltas: for numeric params, non-zero values from later nodes
 * override earlier ones. For curves/HSL/colorWheels, later nodes override
 * if they have non-default values.
 *
 * This is the "single-pass optimization" — when no params conflict across
 * nodes, this merged state can be processed in one worker pass.
 */
export function mergeNodes(nodes: CorrectorNode[]): DevelopState {
  const merged = createEmptyDevelopState();

  for (const node of nodes) {
    if (node.bypass) continue;
    const s = node.state;

    // Tonal adjustments — additive
    if (s.exposure !== 0) merged.exposure += s.exposure;
    if (s.contrast !== 0) merged.contrast += s.contrast;
    if (s.highlights !== 0) merged.highlights += s.highlights;
    if (s.shadows !== 0) merged.shadows += s.shadows;
    if (s.whites !== 0) merged.whites += s.whites;
    if (s.blacks !== 0) merged.blacks += s.blacks;

    // Color adjustments — additive (temperature uses 6500 as neutral)
    if (s.temperature !== 6500) merged.temperature += (s.temperature - 6500);
    if (s.tint !== 0) merged.tint += s.tint;
    if (s.saturation !== 0) merged.saturation += s.saturation;
    if (s.vibrance !== 0) merged.vibrance += s.vibrance;
    if (s.hue !== 0) merged.hue += s.hue;

    // Tone mapper — last non-'none' wins
    if (s.toneMapper && s.toneMapper !== 'none') merged.toneMapper = s.toneMapper;

    // Detail adjustments (top-level) — additive
    if (s.clarity !== 0) merged.clarity += s.clarity;
    if (s.dehaze !== 0) merged.dehaze += s.dehaze;

    // Details group — additive
    if (s.details?.texture) merged.details!.texture! += s.details.texture;
    if (s.details?.sharpness) merged.details!.sharpness! += s.details.sharpness;
    if (s.details?.noiseReduction) merged.details!.noiseReduction! += s.details.noiseReduction;
    if (s.details?.clarity) merged.details!.clarity! += s.details.clarity;

    // Effects — additive for intensity, last-wins for settings
    if (s.effects?.vignette) {
      merged.effects!.vignette! += s.effects.vignette;
      merged.effects!.vignetteMidpoint = s.effects.vignetteMidpoint ?? 50;
      merged.effects!.vignetteRoundness = s.effects.vignetteRoundness ?? 0;
      merged.effects!.vignetteFeather = s.effects.vignetteFeather ?? 50;
      merged.effects!.vignetteHighlights = s.effects.vignetteHighlights ?? 0;
    }
    if (s.effects?.grain) {
      merged.effects!.grain! += s.effects.grain;
      merged.effects!.grainSize = s.effects.grainSize ?? 25;
      merged.effects!.grainRoughness = s.effects.grainRoughness ?? 50;
    }
    if (s.effects?.fade) merged.effects!.fade! += s.effects.fade;

    // Curves — last node with non-empty curves wins per channel
    if (s.curves?.master?.length) merged.curves!.master = JSON.parse(JSON.stringify(s.curves.master));
    if (s.curves?.red?.length) merged.curves!.red = JSON.parse(JSON.stringify(s.curves.red));
    if (s.curves?.green?.length) merged.curves!.green = JSON.parse(JSON.stringify(s.curves.green));
    if (s.curves?.blue?.length) merged.curves!.blue = JSON.parse(JSON.stringify(s.curves.blue));

    // Curve endpoints — last non-default wins per channel
    for (const ch of ['master', 'red', 'green', 'blue'] as const) {
      const ep = s.curveEndpoints?.[ch];
      if (ep && (ep.black?.x !== 0 || ep.black?.y !== 0 || ep.white?.x !== 1 || ep.white?.y !== 1)) {
        merged.curveEndpoints![ch] = JSON.parse(JSON.stringify(ep));
      }
    }

    // Color wheels — additive per wheel
    for (const zone of ['shadows', 'midtones', 'highlights'] as const) {
      const w = s.colorWheels?.[zone];
      if (w) {
        if (w.hue !== 0) merged.colorWheels![zone]!.hue += w.hue;
        if (w.sat !== 0) merged.colorWheels![zone]!.sat += w.sat;
        if (w.lum !== 0) merged.colorWheels![zone]!.lum += w.lum;
      }
    }

    // HSL — additive per channel
    if (s.hsl) {
      for (const [ch, vals] of Object.entries(s.hsl)) {
        if (!merged.hsl![ch]) merged.hsl![ch] = { h: 0, s: 0, l: 0 };
        if (vals.h !== 0) merged.hsl![ch].h += vals.h;
        if (vals.s !== 0) merged.hsl![ch].s += vals.s;
        if (vals.l !== 0) merged.hsl![ch].l += vals.l;
      }
    }
  }

  return merged;
}

/**
 * Flatten a v2 node graph to a v1-compatible state for the preview worker.
 * Merges all nodes + adds geometry back.
 */
export function flattenNodeGraph(graph: NodeGraphV2): Record<string, unknown> {
  const merged = mergeNodes(graph.nodes);
  return {
    ...merged,
    geometry: graph.geometry,
  };
}

// ══════════════════════════════════════════════════════════════
// MIGRATION HELPERS
// ══════════════════════════════════════════════════════════════

/**
 * Migrate V1 nested DevelopState to flat canonical format.
 * 
 * Migration rules:
 * - DROP: version, brightness, caCorrection
 * - ADD: hue (default 0)
 * - MOVE: texture from effects → details
 * - FLATTEN: basic.* and color.* to top level
 */
export function migrateV1toV2(v1: DevelopStateV1): DevelopState {
  return {
    // Tonal adjustments (from basic group)
    exposure: v1.basic.exposure,
    contrast: v1.basic.contrast,
    highlights: v1.basic.highlights,
    shadows: v1.basic.shadows,
    whites: v1.basic.whites,
    blacks: v1.basic.blacks,
    
    // Color adjustments (from color group)
    temperature: v1.color.temperature,
    tint: v1.color.tint,
    saturation: v1.color.saturation,
    vibrance: v1.color.vibrance,
    hue: 0, // Added: was missing in V1
    
    // Detail adjustments (top-level)
    clarity: v1.details.clarity,
    dehaze: v1.details.dehaze,
    
    // Details group
    details: {
      texture: v1.effects.texture, // MOVED from effects
      sharpness: v1.details.sharpness,
      noiseReduction: v1.details.noiseReduction,
      clarity: v1.details.clarity,
    },
    
    // Effects group (texture removed)
    effects: {
      vignette: v1.effects.vignette,
      vignetteMidpoint: v1.effects.vignetteMidpoint,
      vignetteRoundness: v1.effects.vignetteRoundness,
      vignetteFeather: v1.effects.vignetteFeather,
      vignetteHighlights: v1.effects.vignetteHighlights,
      grain: v1.effects.grain,
      grainSize: v1.effects.grainSize,
      grainRoughness: v1.effects.grainRoughness,
      fade: v1.effects.fade,
    },
    
    // Curves and color wheels (unchanged)
    curves: v1.curves,
    curveEndpoints: v1.curveEndpoints,
    colorWheels: v1.colorWheels,
    hsl: v1.hsl,
    
    // Tone mapper
    toneMapper: v1.toneMapper,
  };
}

/**
 * Check if a state appears to be V1 (nested) format
 */
export function isDevelopStateV1(state: unknown): state is DevelopStateV1 {
  if (typeof state !== 'object' || state === null) return false;
  const s = state as Record<string, unknown>;
  return 'basic' in s && 'color' in s && typeof s.basic === 'object';
}

/**
 * Auto-migrate: Detect format and convert if needed
 */
export function autoMigrateDevelopState(state: DevelopStateV1 | DevelopState): DevelopState {
  if (isDevelopStateV1(state)) {
    return migrateV1toV2(state);
  }
  return state as DevelopState;
}

/** Create default geometry state */
export function createDefaultGeometry(): GeometryState {
  return {
    rotation: 0,
    distortion: 0,
    vertical: 0,
    horizontal: 0,
    scale: 1,
  };
}


// ══════════════════════════════════════════════════════════════

/**
 * Check if a connection would create a self-loop
 */
function isSelfLoop(from: string, to: string): boolean {
  return from === to;
}

/**
 * Check if a connection already exists
 */
function hasConnection(
  connections: NodeConnection[],
  from: string,
  to: string,
): boolean {
  return connections.some(c => c.from === from && c.to === to);
}

export function validateConnection(
  connections: NodeConnection[],
  from: string,
  to: string,
): string | null {
  // Check for self-loop
  if (isSelfLoop(from, to)) {
    return `Self-loop not allowed: ${from} → ${from}`;
  }
  
  // Check for duplicate
  if (hasConnection(connections, from, to)) {
    return `Duplicate connection: ${from} → ${to}`;
  }
  
  // Check if adding this connection would create a cycle
  const testConns = [...connections, { from, to }];
  if (hasCycle(testConns)) {
    return `Cycle detected: adding ${from} → ${to} would create a loop`;
  }
  
  return null; // Valid
}

export function hasCycle(connections: NodeConnection[]): boolean {
  const adjacency = new Map<string, string[]>();
  const visited = new Set<string>();
  const recStack = new Set<string>();
  
  // Build adjacency list (skip "input" and "output" special nodes)
  for (const conn of connections) {
    if (conn.from !== "input" && conn.from !== "output") {
      if (!adjacency.has(conn.from)) adjacency.set(conn.from, []);
      if (conn.to !== "input" && conn.to !== "output") {
        adjacency.get(conn.from)!.push(conn.to);
      }
    }
  }
  
  // DFS cycle detection
  function dfs(node: string): boolean {
    visited.add(node);
    recStack.add(node);
    
    const neighbors = adjacency.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (recStack.has(neighbor)) {
        return true; // Back edge found → cycle
      }
    }
    
    recStack.delete(node);
    return false;
  }
  
  // Check all nodes
  for (const node of adjacency.keys()) {
    if (!visited.has(node)) {
      if (dfs(node)) return true;
    }
  }
  
  return false;
}

export function removeNodeConnections(
  connections: NodeConnection[],
  nodeId: string,
): void {
  // Find incoming: X → nodeId
  const inConn = connections.find(c => c.to === nodeId);
  // Find outgoing: nodeId → Y
  const outConn = connections.find(c => c.from === nodeId);
  
  // Remove both connections
  const filtered = connections.filter(c => c.from !== nodeId && c.to !== nodeId);
  connections.length = 0;
  connections.push(...filtered);
  
  // Reconnect: X → Y
  if (inConn && outConn) {
    connections.push({ from: inConn.from, to: outConn.to });
  } else if (inConn && !outConn) {
    // Node was at end, reconnect to output
    connections.push({ from: inConn.from, to: "output" });
  } else if (!inConn && outConn) {
    // Node was at start, reconnect from input
    connections.push({ from: "input", to: outConn.to });
  }
}

// NODE GRAPH UTILITIES — restored for develop-manager compatibility
// ══════════════════════════════════════════════════════════════

export function createNode(label?: string, state?: DevelopState): CorrectorNode {
  _nodeCounter++;
  const num = String(_nodeCounter).padStart(2, '0');
  return {
    id: `node-${Date.now()}-${_nodeCounter}`,
    label: label ?? num,
    state: state ? JSON.parse(JSON.stringify(state)) : createEmptyDevelopState(),
    bypass: false,
    position: { x: (_nodeCounter - 1) * (NODE_W + NODE_GAP), y: 0 },
  };
}

export function resetNodeCounter(count: number = 0): void {
  _nodeCounter = count;
}

export function buildSerialConnections(
  nodeIds: string[],
  existingConnections?: NodeConnection[],
): NodeConnection[] {
  // If existing connections provided and already complete, return them
  if (existingConnections && existingConnections.length > 0) {
    // Check if existing connections already form a valid serial chain
    const hasInput = existingConnections.some(c => c.from === "input");
    const hasOutput = existingConnections.some(c => c.to === "output");
    if (hasInput && hasOutput) {
      // Assume existing connections are intentional, don't rebuild
      return existingConnections;
    }
  }
  
  const conns: NodeConnection[] = [];
  
  if (nodeIds.length === 0) return conns;
  
  // input → first node
  conns.push({ from: "input", to: nodeIds[0] });
  
  // node → node
  for (let i = 0; i < nodeIds.length - 1; i++) {
    conns.push({ from: nodeIds[i], to: nodeIds[i + 1] });
  }
  
  // last node → output
  conns.push({ from: nodeIds[nodeIds.length - 1], to: "output" });
  
  return conns;
}

export function insertNodeAfter(
  connections: NodeConnection[],
  newNodeId: string,
  afterNodeId: string,
): void {
  // Find connection: afterNode → X
  const outIndex = connections.findIndex(c => c.from === afterNodeId);
  
  if (outIndex >= 0) {
    const nextNodeId = connections[outIndex].to;
    
    // Validate both connections before mutation
    const err1 = validateConnection(
      connections.filter((_, i) => i !== outIndex),
      afterNodeId,
      newNodeId,
    );
    const err2 = validateConnection(connections, newNodeId, nextNodeId);
    
    if (err1 || err2) {
      console.warn(`insertNodeAfter validation failed: ${err1 || err2}`);
      return;
    }
    
    // Replace: afterNode → X with afterNode → newNode
    connections[outIndex] = { from: afterNodeId, to: newNodeId };
    // Add: newNode → X
    connections.push({ from: newNodeId, to: nextNodeId });
  } else {
    // afterNode has no output, append to end
    const err1 = validateConnection(connections, afterNodeId, newNodeId);
    const err2 = validateConnection(connections, newNodeId, "output");
    
    if (err1 || err2) {
      console.warn(`insertNodeAfter (append) validation failed: ${err1 || err2}`);
      return;
    }
    
    connections.push({ from: afterNodeId, to: newNodeId });
    connections.push({ from: newNodeId, to: "output" });
  }
}

export function appendNode(
  connections: NodeConnection[],
  newNodeId: string,
): void {
  // Find connection: X → output
  const toOutputIndex = connections.findIndex(c => c.to === "output");
  
  if (toOutputIndex >= 0) {
    const lastNodeId = connections[toOutputIndex].from;
    
    // Validate both connections before mutation
    const err1 = validateConnection(
      connections.filter((_, i) => i !== toOutputIndex),
      lastNodeId,
      newNodeId,
    );
    const err2 = validateConnection(connections, newNodeId, "output");
    
    if (err1 || err2) {
      console.warn(`appendNode validation failed: ${err1 || err2}`);
      return;
    }
    
    // Replace: lastNode → output with lastNode → newNode
    connections[toOutputIndex] = { from: lastNodeId, to: newNodeId };
    // Add: newNode → output
    connections.push({ from: newNodeId, to: "output" });
  } else {
    // No output connection yet, create chain
    const err1 = validateConnection(connections, "input", newNodeId);
    const err2 = validateConnection(connections, newNodeId, "output");
    
    if (err1 || err2) {
      console.warn(`appendNode (new chain) validation failed: ${err1 || err2}`);
      return;
    }
    
    connections.push({ from: "input", to: newNodeId });
    connections.push({ from: newNodeId, to: "output" });
  }
}
