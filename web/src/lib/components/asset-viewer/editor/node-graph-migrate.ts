// node-graph-migrate.ts
import type { NodeGraph } from './node-graph-types';
import type { DevelopState, GeometryState } from './node-types';
import { createEmptyDevelopState, createDefaultGeometry } from './node-types';

interface LegacyDevelopPayload {
  nodeGraph?: NodeGraph;
  panelState?: DevelopState;
  geometry?: GeometryState;
  _legacyPanelSnapshot?: unknown;
  [k: string]: unknown;
}

export function migrateDevelopToNodeGraph(payload: LegacyDevelopPayload): {
  payload: LegacyDevelopPayload;
  migrated: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  // Idempotent: if already v2, return unchanged
  if (payload.nodeGraph?.version === 2) {
    return { payload, migrated: false, warnings };
  }

  const legacyState = payload.panelState ?? createEmptyDevelopState();
  const legacyGeometry = payload.geometry ?? createDefaultGeometry();

  const graph: NodeGraph = {
    version: 2,
    selectedNodeId: 'N1',
    nodes: [
      {
        id: 'N1',
        label: 'Primary',
        bypass: false,
        state: legacyState,
        position: { x: 80, y: 60 },
      },
    ],
    connections: [
      { from: 'input', to: 'N1' },
      { from: 'N1', to: 'output' },
    ],
    geometry: legacyGeometry,
  };

  return {
    payload: {
      ...payload,
      _legacyPanelSnapshot: payload._legacyPanelSnapshot ?? payload.panelState ?? null,
      nodeGraph: graph,
    },
    migrated: true,
    warnings,
  };
}
