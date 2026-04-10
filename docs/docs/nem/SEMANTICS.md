# NEM Core Evaluator Semantics

**Purpose:** Explicit documentation of evaluator behavior rules and design decisions.

**Authority:** These semantics are the accepted contract for `@redbulb/nem-core` evaluation engine.

**Version:** 1.0 (Phase 1 - Week 3)

---

## Core Principles

### 1. Zero/Absence Means Inactive

**Rule:** A value is "inactive" (doesn't affect the image) if and only if:
- It is zero (for numeric fields)
- It is 6500 (for temperature field only)
- It is absent/undefined (for optional fields)

**Implications:**
- UI default values (e.g., vignetteMidpoint=50) ARE active
- Curve endpoints at (0,0) ARE active
- Any non-zero value overwrites previous values in cumulative composition

**Rationale:** The evaluator has no UI knowledge. It operates purely on mathematical neutrality.

**Example:**
```typescript
node1.state = { vignetteMidpoint: 70 }  // Non-default
node2.state = { vignetteMidpoint: 50 }  // UI default, but still active

result.vignetteMidpoint = 50  // Node 2 overwrites Node 1
```

**Alternative (rejected):** Treating UI defaults as inactive would require:
- Evaluator to know all UI default values
- Different behavior for different UIs
- Coupling between core logic and presentation layer

---

### 2. Cumulative Delta Composition

**Rule:** When evaluating a chain of nodes (Node A → Node B → Node C), each node's state composes cumulatively:
- Start with neutral state
- Apply Node A's deltas (only non-zero values)
- Apply Node B's deltas on top
- Apply Node C's deltas on top
- Result is final composed state

**"Last non-zero wins":** If multiple nodes set the same field to non-zero values, the last node wins.

**Example:**
```typescript
neutral = { exposure: 0, contrast: 0 }
node1 = { exposure: 1.0, contrast: 20 }
node2 = { exposure: 0, contrast: 30 }
node3 = { exposure: 0.5, contrast: 0 }

result = {
  exposure: 0.5,  // From node3 (last non-zero)
  contrast: 30    // From node2 (last non-zero, node3's 0 doesn't overwrite)
}
```

**Alternative (rejected):** Additive composition (node1.exposure + node2.exposure) would:
- Make bypass behavior unpredictable
- Require different semantics for different field types
- Complicate user mental model

---

### 3. Temperature Exception

**Rule:** Temperature (white balance in Kelvin) has special neutral value: **6500K**

- `temperature = 0` is NOT neutral (would be meaningless)
- `temperature = 6500` is neutral (daylight white balance)
- Composition rule: 6500 in patch doesn't overwrite base (treated as "no change")

**Example:**
```typescript
node1 = { temperature: 5500 }  // Warm
node2 = { temperature: 6500 }  // Neutral

result.temperature = 5500  // Node 2's neutral doesn't overwrite Node 1
```

**Rationale:** Temperature is a physical quantity with meaningful scale. Zero Kelvin is not a valid white balance.

---

### 4. Optional Field Merging

**Rule:** Optional fields (curves, effects, details, etc.) merge intelligently:
- If base has field and patch doesn't, base survives
- If patch has field, it merges with (or replaces) base
- Merge strategy depends on field type:
  - **Objects** (curveEndpoints, colorWheels): Per-property merge
  - **Arrays** (curves control points): Full replacement
  - **Nested objects** (HSL per-color): Per-key merge

**Example (object merge):**
```typescript
base.colorWheels = {
  shadows: { hue: 10, sat: 5, lum: 0 },
  midtones: { hue: 0, sat: 0, lum: 0 }
}
patch.colorWheels = {
  highlights: { hue: -5, sat: 10, lum: 5 }
}

result.colorWheels = {
  shadows: { hue: 10, sat: 5, lum: 0 },      // From base (patch didn't override)
  midtones: { hue: 0, sat: 0, lum: 0 },      // From base (patch didn't override)
  highlights: { hue: -5, sat: 10, lum: 5 }   // From patch (new)
}
```

**Example (array replacement):**
```typescript
base.curves.master = [{ x: 0, y: 0 }, { x: 0.5, y: 0.6 }, { x: 1, y: 1 }]
patch.curves.master = [{ x: 0, y: 0.1 }, { x: 1, y: 0.9 }]

result.curves.master = [{ x: 0, y: 0.1 }, { x: 1, y: 0.9 }]  // Full replacement
```

**Rationale:** Per-point curve merging would be complex and unpredictable. Full replacement is simpler.

---

### 5. Curve Clipping Policy

**Rule:** Curve control points and endpoints are **NOT clamped** during evaluation.
- Points can have y-values outside [0, 1]
- Clamping happens at render time (if needed), not evaluation time
- This preserves flexibility for extreme adjustments

**Example:**
```typescript
curveEndpoints.master.black = { x: 0.1, y: -0.05 }  // Allowed (y < 0)
curveEndpoints.master.white = { x: 0.9, y: 1.1 }    // Allowed (y > 1)
```

**Rationale:**
- Evaluation is pure data composition (no rendering logic)
- Some rendering engines support extended range (e.g., HDR)
- Clamping at eval time would lose information

**Alternative (rejected):** Clamping during evaluation would:
- Mix data logic with rendering policy
- Prevent extended-range workflows
- Make round-tripping through evaluation lossy

---

### 6. Bypass Semantics

**Rule:** Nodes with `bypass = true` are **skipped by default** during evaluation.
- Option: `includeBypassed: true` forces evaluation of bypassed nodes (for debugging/preview)

**Example:**
```typescript
node1 = { exposure: 1.0, bypass: false }
node2 = { contrast: 20, bypass: true }
node3 = { saturation: 10, bypass: false }

// Default (bypass nodes skipped)
result = { exposure: 1.0, saturation: 10 }  // Node 2 skipped

// With includeBypassed=true
result = { exposure: 1.0, contrast: 20, saturation: 10 }  // Node 2 included
```

**Rationale:** Bypass is a UI convenience (A/B comparison). Default behavior matches user expectation.

---

### 7. Evaluation Order

**Rule:** Nodes are evaluated in **connection order** (input → output chain).
- Linear chain only (no branching)
- Order extracted from `connections` array
- First node = connected from 'input'
- Last node = connected to 'output'

**Example:**
```typescript
connections = [
  { from: 'input', to: 'node1' },
  { from: 'node1', to: 'node2' },
  { from: 'node2', to: 'output' }
]

evaluationOrder = ['node1', 'node2']
```

**Unsupported topologies:**
- Branching (one node → multiple nodes): Only first branch used
- Disconnected nodes: Skipped (not in input→output chain)
- Cycles: Evaluation stops at first revisit (loop broken)

**Rationale:** Serial chain matches DaVinci Resolve's node editor model (target UX).

---

### 8. StopAtNodeId Semantics

**Rule:** `stopAtNodeId` option stops evaluation **at** the specified node (inclusive).
- Node with matching ID is evaluated
- Nodes after it in the chain are skipped
- Useful for "preview up to this node" UX

**Example:**
```typescript
chain = ['node1', 'node2', 'node3']
stopAtNodeId = 'node2'

evaluatedNodes = ['node1', 'node2']  // node3 skipped
```

**Rationale:** Allows incremental preview without creating temporary graphs.

---

### 9. Determinism Guarantee

**Rule:** Same input graph + options → same output state (always).
- No randomness, no timestamps, no external state
- Cross-platform identical (server, web, desktop)
- Order-independent within a composition step (field order doesn't matter)

**Implications:**
- Unit tests can use exact equality checks
- Caching is safe (same input = same output)
- Debugging is predictable

**Enforced by:**
- Pure functions (no side effects)
- Explicit parameter passing (no globals)
- Deterministic iteration (Map order guaranteed in ES2015+)

---

### 10. Error Handling

**Rule:** Evaluator is **forgiving** - returns best-effort result + warnings.
- Invalid graph → neutral state + warning
- Missing node → skip it + warning
- Broken connection → evaluate what's reachable + warning

**Example:**
```typescript
graph.nodes = [{ id: 'node1', ... }]
graph.connections = [
  { from: 'input', to: 'node1' },
  { from: 'node1', to: 'missing-node' }  // Invalid
]

result = {
  flattenedState: { ... },  // Best-effort result (node1 evaluated)
  warnings: ['Node missing-node not found in graph']
}
```

**Rationale:**
- UI should never crash on invalid data
- Warnings help debugging without blocking workflow
- Graceful degradation matches user expectations

**Alternative (rejected):** Throwing errors would:
- Make UI fragile
- Require try-catch everywhere
- Break A/B testing (can't compare broken state)

---

## Accepted Behavioral Changes (Phase 1)

### From Old Web Evaluator to NEM Core

**Change 1: UI Default Handling**
- **Old:** UI defaults (vignetteMidpoint=50, curve endpoints at 0,0) treated as inactive
- **New:** Only zero (or 6500 for temp) is inactive
- **Rationale:** Core evaluator should have no UI knowledge
- **Status:** Accepted (tests updated)

**Change 2: Curve Clipping**
- **Old:** Curve y-values clamped to [0, 1] during evaluation
- **New:** No clamping (preserves full range)
- **Rationale:** Evaluation is data composition, clamping is rendering policy
- **Status:** Accepted (tests updated)

---

## Migration Guide for Platform Implementers

**If you're integrating nem-core into a new platform:**

1. **Import from @redbulb/nem-core** - Single source of truth
2. **Use flat DevelopState** - No nesting (see DEVELOP-STATE-CONTRACT.md)
3. **Respect zero/6500 neutrality** - Don't invent "inactive" values
4. **Test determinism** - Same graph should produce same output across platforms
5. **Handle warnings** - Display to users (don't silently ignore)

---

## References

- Contract: `DEVELOP-STATE-CONTRACT.md`
- Tests: `evaluator.spec.ts` (14 tests covering all semantics)
- Migration: `PHASE-2-TYPE-UNIFICATION-PLAN.md`
- Parity analysis: `web/src/lib/components/asset-viewer/editor/NEM-CORE-PARITY.md`

---

**Status:** Semantics documented and frozen (Phase 1)  
**Next:** Maintain these rules through all future changes  
**Changes:** Must be backward-compatible or require major version bump
