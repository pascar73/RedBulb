# RedBulb Parity Test System

## Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| **Framework Types** | ✅ Complete | Core types, interfaces defined |
| **Image Comparison** | ✅ Complete | sharp + pixelmatch, heatmap generation |
| **Heatmap Generation** | ✅ Complete | Diff images saved to reports/diffs/ |
| **Test Suite Definition** | ✅ Complete | 5 core tests defined |
| **Test Dataset** | ✅ Complete | 3 JPEGs + 3 RAWs (NEF/CR2/ARW) with checksums |
| **CI Workflow** | ✅ Complete | Workflow file committed, awaiting PR demonstration |
| **Tolerance Policy** | ✅ Complete | Strict rules, no stacking, grain seed policy |
| **Grain Seed Control** | 📝 Policy Only | Implementation pending Week 2 |
| **Client Render Engine** | 🟡 Minimal Stub | JPEG re-encode only (no adjustments yet) |
| **Server Render Engine** | 🟡 Minimal Stub | JPEG re-encode only (no adjustments yet) |
| **Golden Image Generation** | ❌ TODO Week 2 | Script not yet implemented |
| **End-to-End Test Run** | 🟡 Possible | Stubs allow execution, real pipeline Week 2 |

**Gate Status:** 🚧 **Awaiting Final Approval** - All corrections complete, CI demo pending

## Purpose

**Non-Negotiable Requirement** (from @Lantana):
> "No implementation without a parity gate (golden-image diff baseline). If parity drifts, we'll lose trust again even with good UX."

This test system ensures that client-side preview and server-side export produce identical (or nearly identical) results.

## Architecture

```
┌─────────────────────────────────────┐
│ Test Input                          │
│ - Source image                      │
│ - Node graph configuration          │
│ - Optional: XMP                     │
└──────────────┬──────────────────────┘
               │
       ┌───────┴────────┐
       ↓                ↓
┌─────────────┐  ┌─────────────┐
│ Client      │  │ Server      │
│ Preview     │  │ Export      │
│ Engine      │  │ Engine      │
└──────┬──────┘  └──────┬──────┘
       │                │
       └────────┬───────┘
                ↓
        ┌───────────────┐
        │ Image Compare │
        │ (Pixel diff)  │
        └───────┬───────┘
                ↓
         ┌──────────────┐
         │ Pass/Fail    │
         │ < tolerance? │
         └──────────────┘
```

## Components

### 1. parity-test-framework.ts ✅
Core framework with:
- `ParityTest` types ✅
- `runParityTest()` - Run single test ✅
- `runParityTests()` - Run test suite ✅
- `compareImages()` - Pixel-level comparison with sharp + pixelmatch ✅
- `hashImage()` - SHA-256 hashing ✅
- `renderClientPreview()` - Minimal stub (JPEG re-encode) 🟡
- `renderServerExport()` - Minimal stub (JPEG re-encode) 🟡

### 2. test-suite.ts ✅
Test definitions:
- `coreTests` - 5 tests defined ✅
- `extendedTests` - Comprehensive coverage (TODO Week 2)

### 3. golden-images/ ⏳
Reference outputs (to be generated Week 2)
- Directory structure ready
- Generation script pending
- Will store one image per test case with SHA-256 hash

### 4. test-data/ ✅
Input images for testing:
- 3 JPEG images (landscape, portrait, noisy) ✅
- 3 RAW files (Nikon NEF, Canon CR2, Sony ARW) ✅
- All with SHA-256 checksums in MANIFEST.md ✅

## Usage

### Generate Golden Images (Week 2)

```bash
cd tests/parity
npm run generate-golden-images  # Script not yet implemented
```

**Status:** TODO - Will be implemented in Week 2 after real render engines are ready.

### Run Parity Tests (Week 2)

```bash
cd tests/parity
npm run test:parity
```

**Status:** Runnable with current stubs, but only tests JPEG re-encoding (no adjustments yet).  
**Week 2:** Will test full render pipeline with node graph adjustments.

### CI Integration ✅

**Status:** Workflow file committed (`.github/workflows/parity-tests.yml`).

**Triggers:** Push to `main` or `phase-*` branches, PRs to `main`.

**Blocks merge on:** Parity test failure (exit code 1).

**Uploads:** Test reports and diff heatmaps as artifacts.

**Evidence pending:** Actual CI run demonstration (red → green) required for gate approval.

## Test Definitions

### Structure

```typescript
const test: ParityTest = {
  input: {
    name: 'exposure-plus-05',
    source: 'test-image-01.jpg',
    nodeGraph: {
      // Full node graph with test parameters
    },
  },
  expected: {
    hash: 'abc123...', // SHA-256 of golden image
    tolerance: 0.01,   // 1% acceptable difference
    goldenImagePath: 'golden-images/exposure-plus-05.jpg',
  },
};
```

### Tolerance Levels

- `0.00` - Pixel-perfect match (unrealistic with compression)
- `0.01` - 1% difference (recommended for lossy formats like JPEG)
- `0.05` - 5% difference (acceptable for complex operations)
- `0.10` - 10% difference (too high, indicates problem)

## Current Test Suite

### Core Tests (Must Pass)

1. **neutral-base** - No adjustments (identity test)
2. **exposure-plus-05** - Exposure +0.5
3. **contrast-plus-03** - Contrast +0.3
4. **temperature-warm** - Temperature +0.2
5. **saturation-plus-02** - Saturation +0.2

### Planned Tests

- [ ] Highlights/shadows adjustments
- [ ] Curves (master, R, G, B)
- [ ] HSL per-channel adjustments
- [ ] Color wheels (shadows/midtones/highlights)
- [ ] Tone mappers (ACES, Filmic, etc.)
- [ ] Multiple nodes (serial chain)
- [ ] Bypass behavior
- [ ] XMP import (Lightroom/Darktable)

## Acceptance Criteria

### Phase 1 Complete When:

- ✅ All core tests passing (5/5)
- ✅ Client preview < 1% diff from server export
- ✅ Golden images generated and stored
- ✅ CI integration working (blocks merges on fail)
- ✅ Visual diff reports generated

### Definition of Done:

```
Parity Gate Passing = 
  Core Tests: 100% pass rate AND
  Max Diff: < 1% AND
  CI Integration: Working AND
  Documentation: Complete
```

## Implementation Notes

### Phase 1 Week 1 Status:

1. ✅ Build parity infrastructure
2. ✅ Implement `compareImages()` with sharp + pixelmatch
3. 🟡 Implement `renderClientPreview()` - minimal stub (JPEG re-encode only)
4. 🟡 Implement `renderServerExport()` - minimal stub (JPEG re-encode only)
5. ⏳ Generate golden images (Week 2)
6. ✅ CI integration (.github/workflows/parity-tests.yml committed)

### Week 2 Implementation Plan:

- [ ] Real client render engine (apply node graph adjustments)
- [ ] Real server render engine (high-quality pipeline with RapidRaw)
- [ ] Golden image generation script
- [ ] Execute end-to-end parity tests
- [ ] Grain seed deterministic implementation

## Review Gates

### Week 1 End:
Tag @Lantana for review of:
- Parity framework completeness
- Test coverage adequacy
- CI integration approach

### Phase 1 End:
Tag @Lantana for review of:
- All tests passing
- Parity validation evidence
- Ready for Phase 2

## Gate Requirements (from @Lantana)

1. ✅ 1% tolerance acceptable for JPEG tests (standard operations)
2. ✅ Neutral test requires 0.001% (near pixel-perfect)
3. ✅ No threshold stacking (each test uses single threshold)
4. ✅ Grain seed must be deterministic (policy defined, implementation Week 2)
5. ⏳ CI must block bad parity (demonstration pending)

---

**Status:** Week 1 infrastructure complete, awaiting gate approval  
**Last Updated:** 2026-04-01  
**Maintainer:** Cassia 🦐  
**Oversight:** Lantana 🌿
