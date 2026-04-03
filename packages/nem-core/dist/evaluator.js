"use strict";
/**
 * evaluator.ts — Core NEM evaluation engine
 *
 * Pure TypeScript implementation (no framework dependencies)
 * Can be used in server, web, and desktop applications
 *
 * Core principles:
 * - Serial chain evaluation (input → Node A → Node B → output)
 * - Cumulative delta composition (only non-zero values override)
 * - Bypass nodes skipped by default
 * - Deterministic output (same graph + input = same output)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateNodeGraph = evaluateNodeGraph;
const types_1 = require("./types");
/**
 * Evaluate a node graph into a single flattened DevelopState
 *
 * @param graph - Node graph to evaluate
 * @param opts - Evaluation options
 * @returns Flattened state + metadata
 */
function evaluateNodeGraph(graph, opts = {}) {
    const warnings = [];
    // Basic validation
    if (!graph || !graph.nodes || graph.nodes.length === 0) {
        warnings.push('Empty node graph');
        return {
            flattenedState: (0, types_1.createNeutralDevelopState)(),
            evaluatedNodeIds: [],
            warnings,
        };
    }
    // Get linear evaluation order from connections
    const order = linearOrderFromConnections(graph);
    const includeBypassed = opts.includeBypassed === true;
    // Optionally stop at specific node
    const selectedOrder = opts.stopAtNodeId
        ? order.slice(0, Math.max(0, order.findIndex((id) => id === opts.stopAtNodeId) + 1))
        : order;
    // Build node lookup
    const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
    const evaluatedNodeIds = [];
    let flattenedState = (0, types_1.createNeutralDevelopState)();
    // Evaluate nodes in order
    for (const id of selectedOrder) {
        const node = nodeById.get(id);
        if (!node) {
            warnings.push(`Node ${id} not found in graph`);
            continue;
        }
        // Skip bypassed nodes by default
        if (node.bypass && !includeBypassed) {
            continue;
        }
        // Compose state (cumulative deltas)
        flattenedState = composeDevelopState(flattenedState, node.state);
        evaluatedNodeIds.push(id);
    }
    return { flattenedState, evaluatedNodeIds, warnings };
}
/**
 * Extract linear evaluation order from graph connections
 * Follows: input → Node A → Node B → output
 *
 * @param graph - Node graph
 * @returns Array of node IDs in evaluation order
 */
function linearOrderFromConnections(graph) {
    const next = new Map();
    let first = null;
    for (const edge of graph.connections) {
        // Find first node (connected from input)
        if (edge.from === 'input' && edge.to !== 'output') {
            first = edge.to;
        }
        // Build chain map
        if (edge.from !== 'input' &&
            edge.from !== 'output' &&
            edge.to !== 'input' &&
            edge.to !== 'output') {
            next.set(edge.from, edge.to);
        }
    }
    // Walk the chain
    const order = [];
    const seen = new Set();
    let current = first;
    while (current && !seen.has(current)) {
        order.push(current);
        seen.add(current);
        current = next.get(current) ?? null;
    }
    return order;
}
/**
 * Compose two DevelopStates (cumulative delta logic)
 * Only non-zero/non-default values from patch override base
 *
 * @param base - Base state
 * @param patch - Delta to apply
 * @returns Composed state
 */
function composeDevelopState(base, patch) {
    const result = { ...base };
    // Basic numeric fields (override if patch != 0, except temperature which uses != 6500)
    const numericFields = [
        'exposure',
        'contrast',
        'highlights',
        'shadows',
        'whites',
        'blacks',
        'tint',
        'vibrance',
        'saturation',
        'hue',
        'clarity',
        'dehaze',
    ];
    for (const field of numericFields) {
        const patchValue = patch[field];
        if (typeof patchValue === 'number' && patchValue !== 0) {
            result[field] = patchValue;
        }
    }
    // Temperature (neutral = 6500)
    if (patch.temperature !== undefined && patch.temperature !== 6500) {
        result.temperature = patch.temperature;
    }
    // Curves (take patch if defined)
    if (patch.curves) {
        result.curves = { ...base.curves, ...patch.curves };
    }
    // Curve endpoints (take patch if defined)
    if (patch.curveEndpoints) {
        result.curveEndpoints = {
            ...base.curveEndpoints,
            ...patch.curveEndpoints,
        };
    }
    // Color wheels (merge per-wheel)
    if (patch.colorWheels) {
        result.colorWheels = {
            shadows: mergeColorWheel(base.colorWheels?.shadows, patch.colorWheels.shadows),
            midtones: mergeColorWheel(base.colorWheels?.midtones, patch.colorWheels.midtones),
            highlights: mergeColorWheel(base.colorWheels?.highlights, patch.colorWheels.highlights),
        };
    }
    // HSL (merge per-channel)
    if (patch.hsl) {
        result.hsl = { ...base.hsl };
        for (const [color, values] of Object.entries(patch.hsl)) {
            if (values && (values.h !== 0 || values.s !== 0 || values.l !== 0)) {
                result.hsl[color] = { ...values };
            }
        }
    }
    // Details (merge if any non-zero)
    if (patch.details) {
        result.details = { ...base.details, ...patch.details };
    }
    // Effects (merge if any non-zero)
    if (patch.effects) {
        result.effects = { ...base.effects, ...patch.effects };
    }
    // Tone mapper (override if set)
    if (patch.toneMapper && patch.toneMapper !== 'none') {
        result.toneMapper = patch.toneMapper;
    }
    // Geometry (merge if any non-zero)
    if (patch.geometry) {
        result.geometry = { ...base.geometry, ...patch.geometry };
    }
    return result;
}
/**
 * Merge color wheel values (only override non-zero)
 *
 * @param base - Base color wheel
 * @param patch - Patch color wheel
 * @returns Merged color wheel
 */
function mergeColorWheel(base, patch) {
    const defaultWheel = { hue: 0, sat: 0, lum: 0 };
    if (!patch)
        return base || defaultWheel;
    if (!base)
        return patch;
    return {
        hue: patch.hue !== 0 ? patch.hue : base.hue,
        sat: patch.sat !== 0 ? patch.sat : base.sat,
        lum: patch.lum !== 0 ? patch.lum : base.lum,
    };
}
