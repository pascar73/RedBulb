# Phase 3 Execution Issues

**Created:** 2026-04-05 20:53 GMT+1  
**Phase:** Phase 3 - Type Unification + Adapter Removal  
**Duration:** 14 days (April 5-18, 2026)

---

## P3-1: Web Type Unification (Canonical DevelopState)

**Priority:** P0  
**Owner:** Cassia  
**Reviewer:** Lantana  
**Target:** Day 2 (April 6, 2026)

### Objective
Flatten web `DevelopState` model toward canonical contract defined in `docs/docs/nem/CANONICAL-DEVELOP-STATE.md`.

### Deliverables
- [ ] Update web `DevelopState` type to match canonical contract
- [ ] Remove web-specific fields not in canonical contract (or mark as @deprecated)
- [ ] Add migration helpers for old saved states
- [ ] Update all web code to use new type
- [ ] Keep UI behavior unchanged (no feature scope creep)

### Success Criteria
- All web tests passing
- No UI behavior changes
- Migration helpers tested with old state files
- Parity tests still passing

### Files
- `web/src/lib/types/develop-state.ts` (or similar)
- Migration helper module (new)
- Test files for migration

### Gate
- [ ] All web tests green
- [ ] No UI regressions
- [ ] Migration helpers tested
- [ ] Lantana approval

---

## P3-2: Adapter Touchpoints 3→0

**Priority:** P0  
**Owner:** Cassia  
**Reviewer:** Lantana  
**Target:** Day 3-4 (April 7-8, 2026)

### Objective
Remove all adapter touchpoints and delete `nem-core-adapter.ts`.

### Current State
- **Touchpoints:** 3 (all in `web/src/lib/components/asset-viewer/editor/node-graph-evaluate.ts`)
- **Documented in:** `web/ADAPTER-TOUCHPOINTS.md`

### Deliverables

**Day 3 (April 7):**
- [ ] Remove 1/2 adapter touchpoints
- [ ] Update web manager/evaluator boundaries
- [ ] Run parity + determinism suites
- [ ] Commit + push

**Day 4 (April 8):**
- [ ] Remove remaining adapter touchpoints (3→0)
- [ ] Delete `nem-core-adapter.ts`
- [ ] Delete `nem-core-adapter.test.ts`
- [ ] Update `ADAPTER-TOUCHPOINTS.md` (mark as removed)
- [ ] Update docs + removal ticket closure notes

### Success Criteria
- Zero adapter touchpoints
- All tests passing (core/server/web/topology/determinism)
- Parity tests still green
- No UI regressions

### Files
- `web/src/lib/nem-core-adapter.ts` (DELETE)
- `web/src/lib/nem-core-adapter.test.ts` (DELETE)
- `web/src/lib/components/asset-viewer/editor/node-graph-evaluate.ts` (UPDATE)
- `web/ADAPTER-TOUCHPOINTS.md` (UPDATE)

### Gate
- [ ] Adapter file deleted
- [ ] All tests green
- [ ] Parity validated
- [ ] Lantana approval

---

## P3-3: Migration Helpers for Old States

**Priority:** P1  
**Owner:** Cassia  
**Reviewer:** Lantana  
**Target:** Day 2 (April 6, 2026)

### Objective
Create migration helpers to convert old saved states to new canonical format.

### Deliverables
- [ ] Migration helper module (`web/src/lib/migration/`)
- [ ] Version detection logic
- [ ] Field mapping (old → canonical)
- [ ] Default value injection for new fields
- [ ] Test suite with old state fixtures

### Success Criteria
- Old states load without errors
- UI behavior matches original
- Migration logged (for debugging)
- Tests with old state fixtures passing

### Files
- `web/src/lib/migration/migrate-develop-state.ts` (NEW)
- `web/src/lib/migration/migrate-develop-state.test.ts` (NEW)
- Test fixtures: old state JSON files

### Gate
- [ ] Migration helpers tested
- [ ] Old states load correctly
- [ ] No UI behavior changes
- [ ] Lantana approval

---

## P3-4: Regression/Perf Gate Pack

**Priority:** P0  
**Owner:** Cassia  
**Reviewer:** Lantana  
**Target:** Day 5-6 (April 9-10, 2026)

### Objective
Full regression + performance stress pass after adapter removal.

### Deliverables

**Day 5 (April 9) - Full Regression:**
- [ ] Run all critical test suites:
  - [ ] nem-core (43 tests)
  - [ ] server NEM (41 tests)
  - [ ] web adapter/parity (should collapse to single path parity)
  - [ ] topology fixtures
  - [ ] determinism tests
  - [ ] cross-runtime parity
- [ ] Document any failures
- [ ] Fix P0 blockers
- [ ] Commit regression report

**Day 6 (April 10) - Performance Pass:**
- [ ] Performance pass on node editor:
  - [ ] Large graphs (100+ nodes)
  - [ ] Drag/wire/viewport operations
  - [ ] Evaluation latency
- [ ] Fix top UX regressions only (no new features)
- [ ] Document performance baselines
- [ ] Commit performance report

### Success Criteria
- All critical tests passing
- No P0 regressions
- Performance within agreed budget
- UX stable (no floating terminals, wire desync, drag jitter)

### Files
- `REGRESSION-REPORT.md` (NEW)
- `PERFORMANCE-REPORT.md` (NEW)

### Gate (Day 7 - April 11)
- [ ] No red CI
- [ ] No unresolved P0 bugs
- [ ] Parity green
- [ ] Performance acceptable
- [ ] Lantana approval for Week 1 merge

---

## Issue Summary

| Issue | Priority | Target | Owner | Status |
|-------|----------|--------|-------|--------|
| P3-1 | P0 | Day 2 | Cassia | ⏳ Pending |
| P3-2 | P0 | Day 3-4 | Cassia | ⏳ Pending |
| P3-3 | P1 | Day 2 | Cassia | ⏳ Pending |
| P3-4 | P0 | Day 5-6 | Cassia | ⏳ Pending |

---

**Next:** Start P3-1 (Web Type Unification) on Day 2 (April 6, 2026)
