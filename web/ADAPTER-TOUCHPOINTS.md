# Adapter Touchpoints - Web Client

**Purpose:** Document all remaining usage of `nem-core-adapter.ts` (temporary conversion layer).

**Context:** Block 2D requirement - catalog adapter usage for eventual removal.

**Target:** Zero adapter usage after Phase 2 type unification.

---

## Current Touchpoints (3 total)

### File: `web/src/lib/components/asset-viewer/editor/node-graph-evaluate.ts`

**Line 20: Import statement**
```typescript
import { webToCore, coreToWeb } from '../../../nem-core-adapter';
```
- **Purpose:** Import conversion functions
- **Removal plan:** Delete after type unification (Phase 2.3)
- **Ticket:** See `ADAPTER-REMOVAL-TICKET.md`

---

**Line 49: webToCore conversion (node states)**
```typescript
nodes: graph.nodes.map((node) => ({
  ...node,
  state: webToCore(node.state),  // Convert nested → flat
}))
```
- **Purpose:** Convert web client nested DevelopState to core flat structure
- **Direction:** Web (nested) → Core (flat)
- **Frequency:** Once per evaluation (per node)
- **Removal plan:** After web DevelopState flattened, pass through directly
- **Ticket:** See `ADAPTER-REMOVAL-TICKET.md`

---

**Line 59: coreToWeb conversion (result state)**
```typescript
return {
  flattenedState: coreToWeb(coreResult.flattenedState),  // Convert flat → nested
  evaluatedNodeIds: coreResult.evaluatedNodeIds,
  warnings: [...warnings, ...coreResult.warnings],
};
```
- **Purpose:** Convert core flat DevelopState back to web nested structure
- **Direction:** Core (flat) → Web (nested)
- **Frequency:** Once per evaluation
- **Removal plan:** After web DevelopState flattened, return core result directly
- **Ticket:** See `ADAPTER-REMOVAL-TICKET.md`

---

## Adapter Functions (2 total)

### Function: `webToCore(web: WebDevelopState): CoreDevelopState`

**Location:** `web/src/lib/nem-core-adapter.ts`

**Conversion map:**
- `web.basic.*` → `core.*` (flatten basic group)
- `web.color.*` → `core.*` (flatten color group)
- `web.details.*` → `core.*` + `core.details.*` (split)
- `web.effects.texture` → `core.details.texture` (move to details)
- `web.effects.*` → `core.effects.*` (preserve effects group)

**Special handling:**
- Adds `hue: 0` (missing in web client)
- Passes through curves, curveEndpoints, colorWheels, hsl, toneMapper

**Current test coverage:** 35/35 tests passing

---

### Function: `coreToWeb(core: CoreDevelopState): WebDevelopState`

**Location:** `web/src/lib/nem-core-adapter.ts`

**Conversion map:**
- `core.*` → `web.basic.*` (nest basic fields)
- `core.*` → `web.color.*` (nest color fields)
- `core.*` + `core.details.*` → `web.details.*` (merge details)
- `core.details.texture` → `web.effects.texture` (move to effects)
- `core.effects.*` → `web.effects.*` (preserve effects group)

**Special handling:**
- Adds `version: 1` (web metadata)
- Provides defaults for all optional groups
- Normalizes temperature (0 → 6500 workaround for web bug)

**Current test coverage:** 35/35 tests passing

---

## Usage Patterns

### Pattern 1: Node Graph Evaluation (Primary Use)

**Flow:**
```
User edits node state (nested)
    ↓
webToCore() converts to flat
    ↓
nem-core evaluates (flat → flat)
    ↓
coreToWeb() converts back to nested
    ↓
UI displays result (nested)
```

**Frequency:** Every time user adjusts a slider or previews changes

**Performance:** ~2ms overhead for conversion (negligible)

---

### Pattern 2: Test Fixtures

**Usage:** Cross-runtime parity tests convert fixtures for web client

**Files:**
- `dual-path-parity.test.ts` (uses adapter for fixture conversion)
- `topology-cross-runtime.test.ts` (uses coreToWeb for fixture conversion)

**Note:** Test usage will remain even after production removal (tests validate backward compatibility)

---

## Reduction Progress

### Phase 1 (Complete) ✅
- Created shared nem-core package
- Server uses flat DevelopState directly (no adapter)
- Web uses adapter at evaluation boundary only

**Result:** Adapter usage reduced to 3 touchpoints (from ~30 potential sites)

---

### Phase 2 (Planned) - Type Unification

**Timeline:** 6 days (see `PHASE-2-TYPE-UNIFICATION-PLAN.md`)

**Milestones:**
1. **Phase 2.1:** Add dual-access helpers (Day 1)
2. **Phase 2.2:** Migrate UI components to flat DevelopState (Days 2-4)
   - Batch 1: Basic controls (exposure, contrast, etc.)
   - Batch 2: Color controls (temperature, saturation, etc.)
   - Batch 3: Advanced controls (details, effects, curves)
3. **Phase 2.3:** Remove adapter (Day 5)
   - Delete `nem-core-adapter.ts`
   - Delete `nem-core-adapter.test.ts`
   - Update `node-graph-evaluate.ts` to use core directly
4. **Phase 2.4:** Validation (Day 6)

**Expected outcome:** Zero adapter touchpoints

---

## Deprecation Tags

### Current Status: Not yet tagged (waiting for Phase 2 start)

**When Phase 2 begins:**
- Add `@deprecated` JSDoc tags to `webToCore` and `coreToWeb`
- Add inline comments at each call site: `// TODO: Remove after type unification (Phase 2.3) - See ADAPTER-REMOVAL-TICKET.md`
- Link to removal ticket in deprecation message

**Example:**
```typescript
/**
 * @deprecated Temporary adapter - remove after type unification (Phase 2.3)
 * @see ADAPTER-REMOVAL-TICKET.md
 */
export function webToCore(web: WebDevelopState): CoreDevelopState {
  // ...
}
```

---

## Removal Ticket

**File:** `ADAPTER-REMOVAL-TICKET.md`

**Ticket ID:** NEM-PHASE2-CLEANUP

**Acceptance Criteria:**
- ✅ DevelopState is flat in web client
- ✅ All UI components use flat property access
- ✅ Adapter files deleted
- ✅ All tests passing

**Estimated effort:** 40 minutes (Day 5 of Phase 2)

---

## Metrics

**Current State:**
- Adapter files: 2 (adapter.ts + adapter.test.ts)
- Adapter lines of code: ~200 lines
- Production touchpoints: 3 (all in node-graph-evaluate.ts)
- Test touchpoints: ~10 (in test files)

**Target State:**
- Adapter files: 0
- Adapter lines of code: 0
- Production touchpoints: 0
- Test touchpoints: 0 (except backward compatibility tests)

**Reduction:** 100% adapter removal

---

## Risk Assessment

**Risk: Breaking UI during migration**
- **Likelihood:** Medium
- **Mitigation:** Incremental migration in 3 batches, test after each
- **Rollback:** Revert to adapter if issues found

**Risk: Data loss during conversion**
- **Likelihood:** Low
- **Mitigation:** Migration validation, XMP round-trip tests
- **Rollback:** Restore from backup

**Risk: Performance regression**
- **Likelihood:** Very Low (removing conversion overhead improves performance)
- **Mitigation:** Benchmark before/after

---

## Summary

**Current adapter usage: MINIMAL (3 touchpoints)**
- All usage contained in single file (`node-graph-evaluate.ts`)
- Adapter functions well-tested (35/35 tests)
- Reduction already achieved (from ~30 potential sites to 3)

**Next step: Phase 2 Type Unification**
- Flatten web DevelopState structure
- Remove adapter entirely
- Target: Zero touchpoints

**Status:** Ready for Phase 2 execution

---

**Document Version:** 1.0 (Block 2D requirement)  
**Last Updated:** 2026-04-04  
**Next Review:** After Phase 2.3 (adapter removal complete)
