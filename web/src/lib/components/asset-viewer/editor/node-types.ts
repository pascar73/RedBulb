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

// ══════════════════════════════════════════════════════════════
// DEVELOP STATE — the canonical state that each node stores
// ══════════════════════════════════════════════════════════════

/** Full develop state for a single node (matches developManager.serialize() v1 format) */
export interface DevelopState {
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
export type LegacyState = DevelopState & { geometry?: GeometryState };

// ══════════════════════════════════════════════════════════════
// DEFAULTS
// ══════════════════════════════════════════════════════════════

export const MAX_NODES = 10;
export const NODE_W = 160;
export const NODE_H = 88;
export const NODE_GAP = 24;
export const IO_R = 7;

export function createEmptyDevelopState(): DevelopState {
  return {
    version: 1,
    basic: { exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, brightness: 0 },
    color: { saturation: 0, temperature: 0, tint: 0, vibrance: 0 },
    toneMapper: 'none',
    details: { sharpness: 0, noiseReduction: 0, clarity: 0, dehaze: 0, caCorrection: 0 },
    effects: {
      texture: 0, vignette: 0, vignetteMidpoint: 50, vignetteRoundness: 0,
      vignetteFeather: 50, vignetteHighlights: 0, grain: 0, grainSize: 25,
      grainRoughness: 50, fade: 0,
    },
    curves: { master: [], red: [], green: [], blue: [] },
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
    hsl: {
      red: { h: 0, s: 0, l: 0 }, orange: { h: 0, s: 0, l: 0 },
      yellow: { h: 0, s: 0, l: 0 }, green: { h: 0, s: 0, l: 0 },
      aqua: { h: 0, s: 0, l: 0 }, blue: { h: 0, s: 0, l: 0 },
      purple: { h: 0, s: 0, l: 0 }, magenta: { h: 0, s: 0, l: 0 },
    },
  };
}

export function createDefaultGeometry(): GeometryState {
  return { rotation: 0, distortion: 0, vertical: 0, horizontal: 0, scale: 100 };
}

// ══════════════════════════════════════════════════════════════
// NODE CREATION
// ══════════════════════════════════════════════════════════════

let _nodeCounter = 0;

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

// ══════════════════════════════════════════════════════════════
// STATE DETECTION — does a node have active (non-zero) changes?
// ══════════════════════════════════════════════════════════════

/** Check if a develop state has any non-default values (for red dot indicator) */
export function hasActiveChanges(state: DevelopState): boolean {
  const b = state.basic;
  const c = state.color;
  const d = state.details;
  const e = state.effects;

  const hasBasic = b.exposure !== 0 || b.contrast !== 0 || b.highlights !== 0 ||
    b.shadows !== 0 || b.whites !== 0 || b.blacks !== 0 || b.brightness !== 0;

  const hasColor = c.saturation !== 0 || c.temperature !== 0 || c.tint !== 0 || c.vibrance !== 0;

  const hasDetails = d.sharpness !== 0 || d.noiseReduction !== 0 || d.clarity !== 0 ||
    d.dehaze !== 0 || d.caCorrection !== 0;

  const hasEffects = e.texture !== 0 || e.vignette !== 0 || e.grain !== 0 || e.fade !== 0;

  const hasCurves = state.curves.master.length > 0 || state.curves.red.length > 0 ||
    state.curves.green.length > 0 || state.curves.blue.length > 0;

  const hasEndpoints = Object.values(state.curveEndpoints).some(
    ep => ep.black.x !== 0 || ep.black.y !== 0 || ep.white.x !== 1 || ep.white.y !== 1,
  );

  const hasColorWheels = Object.values(state.colorWheels).some(
    w => w.hue !== 0 || w.sat !== 0 || w.lum !== 0,
  );

  const hasHSL = Object.values(state.hsl).some(
    ch => ch.h !== 0 || ch.s !== 0 || ch.l !== 0,
  );

  return hasBasic || hasColor || hasDetails || hasEffects || hasCurves ||
    hasEndpoints || hasColorWheels || hasHSL || state.toneMapper !== 'none';
}

// ══════════════════════════════════════════════════════════════
// V1 → V2 MIGRATION
// ══════════════════════════════════════════════════════════════

/**
 * Convert a legacy v1 state (single develop state) to a v2 node graph.
 * Existing edits become Node 01. Geometry extracted to global.
 */
export function migrateV1toV2(v1: Record<string, unknown>): NodeGraphV2 {
  // Extract geometry (global in v2)
  const geo = (v1 as any).geometry;
  const geometry: GeometryState = geo ? {
    rotation: geo.rotation ?? 0,
    distortion: geo.distortion ?? 0,
    vertical: geo.vertical ?? 0,
    horizontal: geo.horizontal ?? 0,
    scale: geo.scale ?? 100,
  } : createDefaultGeometry();

  // Build the develop state (without geometry)
  const developState: DevelopState = {
    version: 1,
    basic: (v1 as any).basic ?? createEmptyDevelopState().basic,
    color: (v1 as any).color ?? createEmptyDevelopState().color,
    toneMapper: (v1 as any).toneMapper ?? 'none',
    details: (v1 as any).details ?? createEmptyDevelopState().details,
    effects: (v1 as any).effects ?? createEmptyDevelopState().effects,
    curves: (v1 as any).curves ?? createEmptyDevelopState().curves,
    curveEndpoints: (v1 as any).curveEndpoints ?? createEmptyDevelopState().curveEndpoints,
    colorWheels: (v1 as any).colorWheels ?? createEmptyDevelopState().colorWheels,
    hsl: (v1 as any).hsl ?? createEmptyDevelopState().hsl,
  };

  resetNodeCounter(0);
  const node = createNode('01', developState);

  return {
    version: 2,
    selectedNodeId: node.id,
    nodes: [node],
    connections: buildSerialConnections([node.id]),  // Single node: input → node → output
    geometry,
  };
}

// ══════════════════════════════════════════════════════════════
// CONNECTION VALIDATION — prevent invalid topologies
// ══════════════════════════════════════════════════════════════

/**
 * Check if a connection already exists in the graph
 */
export function hasConnection(
  connections: NodeConnection[],
  from: string,
  to: string,
): boolean {
  return connections.some(c => c.from === from && c.to === to);
}

/**
 * Check if adding a connection would create a self-loop
 */
export function isSelfLoop(from: string, to: string): boolean {
  return from === to && from !== "input" && from !== "output";
}

/**
 * Detect cycles in the connection graph using DFS
 * Returns true if a cycle exists
 */
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

/**
 * Validate a connection before adding it to the graph
 * Returns error message if invalid, null if valid
 */
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

// ══════════════════════════════════════════════════════════════
// CONNECTION HELPERS — build and manipulate node topology
// ══════════════════════════════════════════════════════════════

/**
 * Build a serial chain of connections: input → nodes[0] → nodes[1] → ... → output
 * Idempotent: only adds connections that don't already exist
 * 
 * @param nodeIds - Array of node IDs in desired serial order
 * @param existingConnections - Optional existing connections to preserve/merge with
 * @returns New connections array (serial chain)
 */
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

/**
 * Insert a new node after an existing node in the connection graph.
 * Example: A → B becomes A → NEW → B
 * Validates connections before adding (prevents duplicates, self-loops, cycles)
 */
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

/**
 * Append a node to the end of the graph (before output).
 * Validates connections before adding (prevents duplicates, self-loops, cycles)
 */
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

/**
 * Remove a node from the connection graph and reconnect its neighbors.
 * Example: A → DEL → B becomes A → B
 */
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

// ══════════════════════════════════════════════════════════════
// MERGE — combine multiple nodes into a single processing state
// ══════════════════════════════════════════════════════════════

/**
 * Merge all active (non-bypassed) nodes into a single develop state.
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

    // Basic — apply non-zero values (additive for exposure-like params)
    if (s.basic.exposure !== 0) merged.basic.exposure += s.basic.exposure;
    if (s.basic.contrast !== 0) merged.basic.contrast += s.basic.contrast;
    if (s.basic.highlights !== 0) merged.basic.highlights += s.basic.highlights;
    if (s.basic.shadows !== 0) merged.basic.shadows += s.basic.shadows;
    if (s.basic.whites !== 0) merged.basic.whites += s.basic.whites;
    if (s.basic.blacks !== 0) merged.basic.blacks += s.basic.blacks;
    if (s.basic.brightness !== 0) merged.basic.brightness += s.basic.brightness;

    // Color — additive
    if (s.color.saturation !== 0) merged.color.saturation += s.color.saturation;
    if (s.color.temperature !== 0) merged.color.temperature += s.color.temperature;
    if (s.color.tint !== 0) merged.color.tint += s.color.tint;
    if (s.color.vibrance !== 0) merged.color.vibrance += s.color.vibrance;

    // Tone mapper — last non-'none' wins
    if (s.toneMapper !== 'none') merged.toneMapper = s.toneMapper;

    // Details — additive
    if (s.details.sharpness !== 0) merged.details.sharpness += s.details.sharpness;
    if (s.details.noiseReduction !== 0) merged.details.noiseReduction += s.details.noiseReduction;
    if (s.details.clarity !== 0) merged.details.clarity += s.details.clarity;
    if (s.details.dehaze !== 0) merged.details.dehaze += s.details.dehaze;
    if (s.details.caCorrection !== 0) merged.details.caCorrection += s.details.caCorrection;

    // Effects — additive for intensity, last-wins for settings
    if (s.effects.texture !== 0) merged.effects.texture += s.effects.texture;
    if (s.effects.vignette !== 0) {
      merged.effects.vignette += s.effects.vignette;
      merged.effects.vignetteMidpoint = s.effects.vignetteMidpoint;
      merged.effects.vignetteRoundness = s.effects.vignetteRoundness;
      merged.effects.vignetteFeather = s.effects.vignetteFeather;
      merged.effects.vignetteHighlights = s.effects.vignetteHighlights;
    }
    if (s.effects.grain !== 0) {
      merged.effects.grain += s.effects.grain;
      merged.effects.grainSize = s.effects.grainSize;
      merged.effects.grainRoughness = s.effects.grainRoughness;
    }
    if (s.effects.fade !== 0) merged.effects.fade += s.effects.fade;

    // Curves — last node with non-empty curves wins per channel
    if (s.curves.master.length > 0) merged.curves.master = JSON.parse(JSON.stringify(s.curves.master));
    if (s.curves.red.length > 0) merged.curves.red = JSON.parse(JSON.stringify(s.curves.red));
    if (s.curves.green.length > 0) merged.curves.green = JSON.parse(JSON.stringify(s.curves.green));
    if (s.curves.blue.length > 0) merged.curves.blue = JSON.parse(JSON.stringify(s.curves.blue));

    // Curve endpoints — last non-default wins per channel
    for (const ch of ['master', 'red', 'green', 'blue'] as const) {
      const ep = s.curveEndpoints[ch];
      if (ep.black.x !== 0 || ep.black.y !== 0 || ep.white.x !== 1 || ep.white.y !== 1) {
        merged.curveEndpoints[ch] = JSON.parse(JSON.stringify(ep));
      }
    }

    // Color wheels — additive per wheel
    for (const zone of ['shadows', 'midtones', 'highlights'] as const) {
      const w = s.colorWheels[zone];
      if (w.hue !== 0) merged.colorWheels[zone].hue += w.hue;
      if (w.sat !== 0) merged.colorWheels[zone].sat += w.sat;
      if (w.lum !== 0) merged.colorWheels[zone].lum += w.lum;
    }

    // HSL — additive per channel
    for (const [ch, vals] of Object.entries(s.hsl)) {
      if (!merged.hsl[ch]) merged.hsl[ch] = { h: 0, s: 0, l: 0 };
      if (vals.h !== 0) merged.hsl[ch].h += vals.h;
      if (vals.s !== 0) merged.hsl[ch].s += vals.s;
      if (vals.l !== 0) merged.hsl[ch].l += vals.l;
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
