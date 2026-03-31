// node-graph-validate.ts
import type { Edge, GraphValidationResult, NodeGraph, NodeId } from './node-graph-types';

export function validateGraph(graph: NodeGraph): GraphValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  if (nodeIds.size !== graph.nodes.length) errors.push('Duplicate node IDs.');

  // Endpoint checks
  for (const e of graph.connections) {
    if (e.from !== 'input' && e.from !== 'output' && !nodeIds.has(e.from)) {
      errors.push(`Edge.from references missing node: ${e.from}`);
    }
    if (e.to !== 'input' && e.to !== 'output' && !nodeIds.has(e.to)) {
      errors.push(`Edge.to references missing node: ${e.to}`);
    }
    if (e.from === e.to) errors.push(`Self-loop edge: ${e.from} -> ${e.to}`);
    if (e.to === 'input') errors.push('Invalid edge into input.');
    if (e.from === 'output') errors.push('Invalid edge out of output.');
  }

  // Duplicate edges
  const seen = new Set<string>();
  for (const e of graph.connections) {
    const k = `${e.from}->${e.to}`;
    if (seen.has(k)) errors.push(`Duplicate edge: ${k}`);
    seen.add(k);
  }

  // v1 serial-ish constraints
  const incoming = new Map<NodeId | 'output', number>();
  const outgoing = new Map<NodeId | 'input', number>();

  for (const e of graph.connections) {
    if (e.to !== 'input') incoming.set(e.to as NodeId | 'output', (incoming.get(e.to as NodeId | 'output') ?? 0) + 1);
    if (e.from !== 'output') outgoing.set(e.from as NodeId | 'input', (outgoing.get(e.from as NodeId | 'input') ?? 0) + 1);
  }

  if ((outgoing.get('input') ?? 0) !== 1) errors.push('input must have exactly one outgoing edge.');
  if ((incoming.get('output') ?? 0) !== 1) errors.push('output must have exactly one incoming edge.');

  for (const id of nodeIds) {
    if ((incoming.get(id) ?? 0) > 1) errors.push(`Node ${id} has >1 incoming edge.`);
    if ((outgoing.get(id) ?? 0) > 1) errors.push(`Node ${id} has >1 outgoing edge.`);
  }

  // Cycle detection among node->node edges
  const adj = new Map<NodeId, NodeId[]>();
  for (const id of nodeIds) adj.set(id, []);
  for (const e of graph.connections) {
    if (e.from !== 'input' && e.from !== 'output' && e.to !== 'input' && e.to !== 'output') {
      adj.get(e.from as NodeId)!.push(e.to as NodeId);
    }
  }

  const visiting = new Set<NodeId>();
  const visited = new Set<NodeId>();

  function dfs(id: NodeId): boolean {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const nxt of adj.get(id) ?? []) {
      if (dfs(nxt)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  }

  for (const id of nodeIds) {
    if (dfs(id)) {
      errors.push('Cycle detected in node graph.');
      break;
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
