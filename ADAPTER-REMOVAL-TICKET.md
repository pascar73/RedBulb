# Ticket: Remove nem-core-adapter After Type Unification

**ID:** NEM-PHASE2-CLEANUP  
**Priority:** P1 (after Phase 2.2 complete)  
**Status:** Blocked (waiting for UI component migration)  
**Assignee:** TBD  
**Created:** 2026-04-04  

---

## Summary

Remove temporary adapter layer (`nem-core-adapter.ts`) after web client DevelopState type unification is complete.

---

## Context

**Why adapter was created:**
- Web client uses nested DevelopState (`basic: {}, color: {}, etc.`)
- Server/core use flat DevelopState (`exposure, temperature, etc.`)
- Adapter bridges the two structures temporarily

**Current state (Phase 1):**
- ✅ Adapter working (`web/src/lib/nem-core-adapter.ts`)
- ✅ Adapter tests passing (10/10)
- ✅ Web evaluation uses adapter to call nem-core
- ⚠️ Adapter is TEMPORARY - to be removed in Phase 2

---

## Dependencies

**Blocked by:**
- Phase 2.1: Dual-access helpers implemented
- Phase 2.2: All UI components migrated to flat structure
- Phase 2.3: This cleanup work

**Must complete first:**
1. Flatten `DevelopState` interface in `web/src/lib/components/asset-viewer/editor/node-types.ts`
2. Update all UI components to use flat property access
3. Verify all tests passing (maintain 100% pass rate)

---

## Acceptance Criteria

**Definition of Done:**

1. ✅ Files deleted:
   - `web/src/lib/nem-core-adapter.ts`
   - `web/src/lib/nem-core-adapter.test.ts`

2. ✅ Updated files:
   - `web/src/lib/components/asset-viewer/editor/node-graph-evaluate.ts`
     * Remove adapter imports
     * Call nem-core directly (no conversion)
   - `web/src/lib/components/asset-viewer/editor/node-types.ts`
     * Remove nested structure
     * Only flat structure remains

3. ✅ All tests passing:
   - Web node-graph tests: 15/15 passing
   - Web integration tests: 2/2 passing
   - Total: Maintain 100% pass rate

4. ✅ No behavior change:
   - UI controls work identically
   - Node graph operations unchanged
   - XMP round-trip still works

5. ✅ Documentation updated:
   - Remove references to adapter from README
   - Update architecture diagrams
   - Mark WEB-FIELD-MAPPING.md as historical reference

---

## Implementation Steps

### Step 1: Verify Prerequisites (5 min)

**Check that Phase 2.2 is complete:**
```bash
# All UI components should be using flat structure
grep -r "state.basic\." web/src/lib/components/asset-viewer/editor/ | wc -l
# Should return 0 (no nested access remaining)

grep -r "state.color\." web/src/lib/components/asset-viewer/editor/ | wc -l
# Should return 0 (no nested access remaining)
```

### Step 2: Remove Adapter Files (2 min)

```bash
cd ~/Projects/RedBulb
git rm web/src/lib/nem-core-adapter.ts
git rm web/src/lib/nem-core-adapter.test.ts
```

### Step 3: Update node-graph-evaluate.ts (10 min)

**Before:**
```typescript
import { evaluateNodeGraph as evaluateCore } from '@redbulb/nem-core';
import { webToCore, coreToWeb } from '../../../nem-core-adapter';

export function evaluateNodeGraph(graph: NodeGraph, opts: EvalOptions = {}): EvalResult {
  // Convert web graph to core graph
  const coreGraph = {
    nodes: graph.nodes.map((node) => ({
      ...node,
      state: webToCore(node.state),  // ADAPTER
    })),
    connections: graph.connections,
  };

  const coreResult = evaluateCore(coreGraph, opts);

  return {
    flattenedState: coreToWeb(coreResult.flattenedState),  // ADAPTER
    evaluatedNodeIds: coreResult.evaluatedNodeIds,
    warnings: [...warnings, ...coreResult.warnings],
  };
}
```

**After:**
```typescript
import { evaluateNodeGraph as evaluateCore } from '@redbulb/nem-core';
// No adapter import needed

export function evaluateNodeGraph(graph: NodeGraph, opts: EvalOptions = {}): EvalResult {
  // Direct call to core (no conversion needed - types match)
  const coreResult = evaluateCore(graph, opts);

  return {
    flattenedState: coreResult.flattenedState,
    evaluatedNodeIds: coreResult.evaluatedNodeIds,
    warnings: [...warnings, ...coreResult.warnings],
  };
}
```

### Step 4: Run Tests (5 min)

```bash
# NEM Core tests
cd packages/nem-core && npm test

# Web tests
cd web && npm test -- node-graph.test.ts
cd web && npm test -- nem-core-integration.test.ts

# All should pass
```

### Step 5: Manual UI Validation (15 min)

**Test all develop controls:**
- [ ] Exposure slider works
- [ ] Contrast slider works
- [ ] Temperature slider works
- [ ] Saturation slider works
- [ ] All advanced controls work

**Test node graph operations:**
- [ ] Add node
- [ ] Remove node
- [ ] Bypass node
- [ ] Reorder nodes
- [ ] Save/load state

### Step 6: Commit and Push (2 min)

```bash
git add -A
git commit -m "Remove nem-core adapter (Phase 2.3 cleanup)

Adapter removal complete - web now uses flat DevelopState directly.

Removed:
- web/src/lib/nem-core-adapter.ts
- web/src/lib/nem-core-adapter.test.ts

Updated:
- node-graph-evaluate.ts: Call nem-core directly (no conversion)

All tests passing (100% pass rate).
Web and server now use identical DevelopState structure."

git push origin week-3-nem-core
```

---

## Rollback Plan

**If removal causes issues:**

1. Revert commit: `git revert HEAD`
2. Restore adapter files from Phase 1
3. Investigate root cause (likely UI component not fully migrated)
4. Fix remaining nested access in UI
5. Retry removal

---

## Verification Script

```bash
#!/bin/bash
# verify-adapter-removal.sh

echo "Verifying adapter removal..."

# Check files deleted
if [ -f "web/src/lib/nem-core-adapter.ts" ]; then
  echo "❌ FAIL: Adapter file still exists"
  exit 1
fi

if [ -f "web/src/lib/nem-core-adapter.test.ts" ]; then
  echo "❌ FAIL: Adapter test file still exists"
  exit 1
fi

# Check no nested access in UI
NESTED_ACCESS=$(grep -r "state\.basic\." web/src/lib/components/asset-viewer/editor/ | wc -l)
if [ "$NESTED_ACCESS" -gt 0 ]; then
  echo "❌ FAIL: Found $NESTED_ACCESS nested 'state.basic' accesses"
  exit 1
fi

NESTED_ACCESS=$(grep -r "state\.color\." web/src/lib/components/asset-viewer/editor/ | wc -l)
if [ "$NESTED_ACCESS" -gt 0 ]; then
  echo "❌ FAIL: Found $NESTED_ACCESS nested 'state.color' accesses"
  exit 1
fi

# Check tests passing
cd packages/nem-core && npm test > /dev/null 2>&1
if [ $? -ne 0 ]; then
  echo "❌ FAIL: NEM core tests failing"
  exit 1
fi

cd ../../web && npm test -- node-graph.test.ts > /dev/null 2>&1
if [ $? -ne 0 ]; then
  echo "❌ FAIL: Web node-graph tests failing"
  exit 1
fi

echo "✅ PASS: Adapter successfully removed"
echo "  - Files deleted"
  echo "  - No nested access remaining"
  echo "  - All tests passing"
```

---

## Related Documents

- Phase 2 Plan: `PHASE-2-TYPE-UNIFICATION-PLAN.md`
- Field Mapping: `WEB-FIELD-MAPPING.md`
- Contract: `packages/nem-core/DEVELOP-STATE-CONTRACT.md`
- Semantics: `packages/nem-core/SEMANTICS.md`

---

## Success Metrics

**After completion:**
- ✅ Code reduction: -300 lines (adapter + tests)
- ✅ Type safety: Full compile-time checking (no runtime conversion)
- ✅ Performance: Eliminate conversion overhead
- ✅ Maintenance: Single DevelopState structure across all platforms

---

**Status:** READY FOR IMPLEMENTATION (after Phase 2.2 complete)  
**Est. Time:** 40 minutes  
**Risk:** LOW (incremental approach minimizes risk)
