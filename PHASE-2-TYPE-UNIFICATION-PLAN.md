# Phase 2: Type Unification Plan
## Remove Adapter Layer, Flatten Web DevelopState

**Goal:** Unify web and server DevelopState structures to eliminate temporary adapter layer

**Current State:**
- Server: Uses flat DevelopState from `@redbulb/nem-core` directly
- Web: Uses nested DevelopState (basic: {}, color: {}, etc.) with adapter conversion
- Adapter: `web/src/lib/nem-core-adapter.ts` (temporary compatibility layer)

**Target State:**
- Both server and web use flat DevelopState from `@redbulb/nem-core`
- Adapter removed
- All web UI code updated to work with flat structure

---

## Analysis

### Current Web Structure (Nested)
```typescript
interface DevelopState {
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
  // ... more nested groups
}
```

### Target Structure (Flat)
```typescript
interface DevelopState {
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  temperature: number;
  tint: number;
  saturation: number;
  vibrance: number;
  // ... all at top level
}
```

---

## Impact Assessment

### Files to Update

**1. Type Definitions (1 file)**
- `web/src/lib/components/asset-viewer/editor/node-types.ts`
  - Flatten DevelopState interface
  - Update createEmptyDevelopState()
  - Keep backward compat for migration

**2. UI Components (~10-15 files)**
- All develop panel sliders/controls
- Update property access: `state.basic.exposure` → `state.exposure`
- Update property access: `state.color.temperature` → `state.temperature`

**3. Serialization/Persistence (2-3 files)**
- XMP sidecar adapter (may need migration logic)
- Node graph serialization
- Local storage/cache

**4. Tests (~5-10 files)**
- Update test fixtures
- Update expectations

**5. Remove Adapter (3 files)**
- Delete `web/src/lib/nem-core-adapter.ts`
- Delete `web/src/lib/nem-core-adapter.test.ts`
- Update `node-graph-evaluate.ts` to use nem-core directly

---

## Execution Strategy

### Option A: Big-Bang Migration (NOT RECOMMENDED)
- Update all files in one pass
- High risk of breaking UI
- Difficult to test incrementally

### Option B: Gradual Migration with Compat Layer (RECOMMENDED)
- Add dual-access helpers (read old path, write new path)
- Update UI components incrementally
- Remove compat layer only after all components migrated
- Lower risk, testable at each step

### Option C: Parallel Types with Feature Flag
- Support both structures temporarily
- Use feature flag to switch between old/new
- Highest safety, but more complex

**Recommendation: Option B** - Balance of safety and simplicity

---

## Implementation Plan (Option B)

### Phase 2.1: Preparation (Day 1)
**Goal:** Add dual-access support without breaking existing code

1. Update `DevelopState` interface to include both old (nested) and new (flat) properties
2. Create migration helpers:
   - `migrateDevelopStateToFlat()` - One-time migration
   - `getDevelopValue(state, 'exposure')` - Read from either structure
   - `setDevelopValue(state, 'exposure', value)` - Write to flat structure
3. Update `createEmptyDevelopState()` to populate both structures
4. All tests remain green (no behavior change)

**Deliverable:** Dual-access helpers working, tests passing

---

### Phase 2.2: UI Component Migration (Days 2-4)
**Goal:** Update UI components to use flat structure

**Batch 1: Basic Controls (Day 2)**
- Exposure slider
- Contrast slider
- Highlights/Shadows/Whites/Blacks
- Update to read/write flat properties

**Batch 2: Color Controls (Day 3)**
- Temperature slider
- Tint slider
- Saturation slider
- Vibrance slider

**Batch 3: Advanced Controls (Day 4)**
- Details (clarity, dehaze, sharpness, noise reduction)
- Effects (vignette, grain, etc.)
- Curves
- Color wheels
- HSL adjustments

**Validation:** After each batch, verify:
- UI controls work correctly
- State persistence works
- Node graph evaluation works

---

### Phase 2.3: Cleanup (Day 5)
**Goal:** Remove adapter and dual-access layer

1. Remove adapter files:
   - `web/src/lib/nem-core-adapter.ts`
   - `web/src/lib/nem-core-adapter.test.ts`
2. Update `node-graph-evaluate.ts` to use nem-core directly (no adapter)
3. Remove nested properties from `DevelopState` interface
4. Remove dual-access helpers
5. Update all tests
6. Verify all 68+ tests passing

**Deliverable:** Clean flat structure, adapter removed

---

### Phase 2.4: Validation & Polish (Day 6)
**Goal:** Ensure no regressions

1. Manual UI testing (all controls)
2. Node graph operations (add/remove/bypass nodes)
3. State persistence (save/load)
4. XMP round-trip (export/import)
5. Performance check (no slowdowns)
6. Documentation update

---

## Risk Mitigation

### High Risks
1. **Breaking existing user workflows**
   - Mitigation: Incremental migration, test each batch
2. **Data loss on migration**
   - Mitigation: Add migration validation, keep backups
3. **UI controls stop working**
   - Mitigation: Update in small batches, test thoroughly

### Medium Risks
1. **XMP compatibility issues**
   - Mitigation: Test with real XMP files from Lightroom/Darktable
2. **Performance regression**
   - Mitigation: Benchmark before/after
3. **Test suite maintenance**
   - Mitigation: Update tests incrementally with code

### Low Risks
1. **TypeScript compilation errors**
   - Mitigation: Fix as they appear (caught immediately)

---

## Acceptance Criteria

**Phase 2 is complete when:**

1. ✅ DevelopState is flat (no nested groups) in web client
2. ✅ All UI controls work correctly
3. ✅ Adapter layer removed (`nem-core-adapter.ts` deleted)
4. ✅ Web imports from `@redbulb/nem-core` directly (no adapter)
5. ✅ All tests passing (maintain 100% pass rate)
6. ✅ No behavior change from user perspective
7. ✅ XMP round-trip works
8. ✅ Manual UI testing complete

---

## Timeline Estimate

**Total:** 6 days (assuming 4-6 hours/day focused work)

- Day 1: Preparation (dual-access helpers)
- Days 2-4: UI component migration (3 batches)
- Day 5: Cleanup (remove adapter)
- Day 6: Validation & polish

**Aggressive:** 4 days  
**Conservative:** 8 days  
**Realistic:** 6 days

---

## Dependencies

- ✅ Phase 1 complete (shared core created)
- ✅ Server using nem-core directly
- ✅ Web using nem-core via adapter
- ⏸️ No parallel feature work on web UI during migration

---

## Success Metrics

1. **Code reduction:** Remove ~300 lines (adapter + dual-access code)
2. **Test coverage:** Maintain 100% pass rate
3. **Performance:** No regression (benchmark)
4. **Type safety:** Full TypeScript safety (no `any` casts)
5. **User impact:** Zero breaking changes to existing workflows

---

## Next Steps

**Immediate:**
1. Review this plan with Paolo + Lantana
2. Get approval to proceed
3. Start Phase 2.1 (preparation)

**After Phase 2:**
- Desktop app integration (use same flat DevelopState)
- Plugin SDK finalization (uses shared types)
- DCTL compatibility layer

---

## Questions for Review

1. **Scope:** Is 6-day estimate acceptable?
2. **Strategy:** Approve Option B (gradual migration)?
3. **Batching:** Are the 3 UI batches sensible?
4. **Timing:** Start immediately or after other priorities?

**Status:** Awaiting approval to proceed with Phase 2.1
