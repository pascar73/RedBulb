# Topology Rules - NEM Core

**Purpose:** Define expected evaluator behavior for each graph topology case.

**Authority:** These rules are enforced by `@redbulb/nem-core` evaluator.

---

## Supported Topology: Linear Chain

**Pattern:**
```
input → Node A → Node B → Node C → output
```

**Behavior:**
- Nodes evaluated in connection order (A, then B, then C)
- Cumulative delta composition (each node builds on previous)
- No warnings generated
- Deterministic output

**Example:**
```typescript
connections: [
  { from: 'input', to: 'A' },
  { from: 'A', to: 'B' },
  { from: 'B', to: 'C' },
  { from: 'C', to: 'output' },
]
```

**Result:** `evaluatedNodeIds = ['A', 'B', 'C']`, `warnings = []`

---

## Unsupported: Branching

**Pattern:**
```
input → Node A → Node B
                ↓
                Node C
```

**Behavior:**
- **Uses first connection only** (A → B in connection array order)
- Node C is ignored (not in main chain)
- Warning generated: `"Topology: Node A has 2 outgoing connections (branching not supported, using first connection only)"`
- Evaluation continues with first path

**Example:**
```typescript
connections: [
  { from: 'input', to: 'A' },
  { from: 'A', to: 'B' },  // First connection (used)
  { from: 'A', to: 'C' },  // Second connection (ignored)
  { from: 'B', to: 'output' },
]
```

**Result:**
- `evaluatedNodeIds = ['A', 'B']`
- `warnings = ['Topology: Node A has 2 outgoing connections (branching not supported, using first connection only)']`

**Rationale:** Linear chain model matches DaVinci Resolve node editor (target UX). Branching would require parallel evaluation and merging logic (not supported in v1).

---

## Unsupported: Multiple Input Roots

**Pattern:**
```
input → Node A
       ↓
       Node B
```

**Behavior:**
- **Uses first input connection only** (A in connection array order)
- Other roots ignored (B not evaluated)
- Warning generated: `"Topology: Multiple nodes connected from input (2 found, using first: A)"`
- Evaluation continues from first root

**Example:**
```typescript
connections: [
  { from: 'input', to: 'A' },  // First root (used)
  { from: 'input', to: 'B' },  // Second root (ignored)
  { from: 'A', to: 'output' },
]
```

**Result:**
- `evaluatedNodeIds = ['A']`
- `warnings = ['Topology: Multiple nodes connected from input (2 found, using first: A)']`

**Rationale:** Single evaluation path ensures deterministic composition. Multiple roots would require defining merge behavior.

---

## Unsupported: Cycles

**Pattern (Simple Cycle):**
```
input → Node A → Node B → Node A (cycle)
```

**Pattern (Self-Loop):**
```
input → Node A → Node A (self-loop)
```

**Behavior:**
- Evaluates nodes **until cycle is detected**
- When revisiting a node, **evaluation stops** (cycle broken)
- Warning generated: `"Topology: Cycle detected at node A (evaluation stopped)"`
- Partial evaluation result returned

**Example (Simple Cycle):**
```typescript
connections: [
  { from: 'input', to: 'A' },
  { from: 'A', to: 'B' },
  { from: 'B', to: 'A' },  // Cycle back to A
  { from: 'B', to: 'output' },
]
```

**Result:**
- `evaluatedNodeIds = ['A', 'B']` (stopped before revisiting A)
- `warnings = ['Topology: Cycle detected at node A (evaluation stopped)']`

**Example (Self-Loop):**
```typescript
connections: [
  { from: 'input', to: 'A' },
  { from: 'A', to: 'A' },  // Self-loop
  { from: 'A', to: 'output' },
]
```

**Result:**
- `evaluatedNodeIds = ['A']` (evaluated once, then stopped)
- `warnings = ['Topology: Cycle detected at node A (evaluation stopped)']`

**Rationale:** Cycles would cause infinite loops. Early detection prevents hang.

---

## Unsupported: Disconnected Nodes

**Pattern:**
```
input → Node A → output

Node B → Node C (disconnected subgraph)
```

**Behavior:**
- Main chain evaluated normally (A)
- Disconnected nodes **not evaluated** (B, C)
- Warning generated: `"Topology: 2 node(s) disconnected from main chain: B, C"`
- Main chain output returned

**Example:**
```typescript
nodes: [
  createNode('A'),
  createNode('B'),
  createNode('C'),
]
connections: [
  { from: 'input', to: 'A' },
  { from: 'A', to: 'output' },
  { from: 'B', to: 'C' },  // Disconnected subgraph
]
```

**Result:**
- `evaluatedNodeIds = ['A']`
- `warnings = ['Topology: 2 node(s) disconnected from main chain: B, C']`

**Note:** Nodes with **no connections at all** are not warned about (they're truly unused). Only nodes with connections that aren't part of input→output chain produce warnings.

**Rationale:** User may have forgotten to connect nodes. Warning helps debugging.

---

## Empty Graph

**Pattern:**
```
(no nodes)
```

**Behavior:**
- Returns neutral state (all zeros, temperature=6500)
- Warning generated: `"Empty node graph"`
- Empty evaluatedNodeIds

**Example:**
```typescript
nodes: []
connections: []
```

**Result:**
- `flattenedState = createNeutralDevelopState()`
- `evaluatedNodeIds = []`
- `warnings = ['Empty node graph']`

**Rationale:** Graceful degradation. UI may create empty graphs during initialization.

---

## Warning Determinism

**Guarantee:** Same graph topology produces **identical warnings in identical order** on every evaluation.

**Tested by:** `determinism.spec.ts` (warnings consistency tests)

**Warning order:**
1. Branching warnings (in node iteration order)
2. Multiple input roots warning
3. Cycle warning (when detected during traversal)
4. Disconnected nodes warning

**Example (Multiple Issues):**
```typescript
// Graph with branching + multiple roots
warnings = [
  'Topology: Node A has 2 outgoing connections (...)',  // Branching first
  'Topology: Multiple nodes connected from input (...)', // Roots second
]
```

---

## Migration Path

**Current (v1):** Linear chain only, warnings for unsupported topologies

**Future (v2+):**
- **Branching:** Parallel evaluation with configurable merge strategy
- **Multiple roots:** Define merge behavior (OR, AND, weighted)
- **Cycles:** Detect + reject during graph validation (before evaluation)

**Backward Compatibility:** Warnings preserve forward compatibility. Code expecting only linear chains will continue to work.

---

## Testing

**Test Coverage:**
- Valid topologies: `topology.spec.ts` (3 tests)
- Branching detection: `topology.spec.ts` (2 tests)
- Multiple roots: `topology.spec.ts` (2 tests)
- Cycles: `topology.spec.ts` (3 tests)
- Disconnected nodes: `topology.spec.ts` (3 tests)
- Determinism: `determinism.spec.ts` (2 tests)

**Total:** 15 topology-specific tests

---

## Summary Table

| Topology | Supported? | Behavior | Warning |
|----------|-----------|----------|---------|
| Linear chain | ✅ Yes | Evaluate all nodes in order | None |
| Branching | ❌ No | Use first connection only | Yes |
| Multiple roots | ❌ No | Use first root only | Yes |
| Cycles | ❌ No | Stop at cycle detection | Yes |
| Disconnected | ❌ No | Skip disconnected nodes | Yes |
| Empty graph | ⚠️ Special | Return neutral state | Yes |

**All unsupported topologies produce deterministic warnings and graceful degradation (no crashes).**

---

**Status:** Topology rules documented (Block 2C requirement)  
**Next:** Shared fixture suite for cross-runtime topology testing
