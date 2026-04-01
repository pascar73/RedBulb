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

### 1. parity-test-framework.ts
Core framework with:
- `ParityTest` types
- `runParityTest()` - Run single test
- `runParityTests()` - Run test suite
- `compareImages()` - Pixel-level comparison
- `hashImage()` - SHA-256 hashing

### 2. test-suite.ts
Test definitions:
- `coreTests` - Must pass before deploy (5 tests currently)
- `extendedTests` - Comprehensive coverage (TODO)

### 3. golden-images/
Reference outputs (generated once, stored permanently)
- One per test case
- SHA-256 hash stored in test definition
- Used for visual comparison

### 4. test-data/
Input images for testing
- JPEG test images (to start)
- RAW files (Phase 2)

## Usage

### Generate Golden Images (First Time)

```bash
cd tests/parity
npm run generate-golden-images
```

This will:
1. Render each test case with server engine (authoritative)
2. Save output to `golden-images/`
3. Calculate SHA-256 hash
4. Update test definitions with hashes

### Run Parity Tests

```bash
cd tests/parity
npm run test:parity
```

This will:
1. Run all tests in current suite
2. Compare client vs server output
3. Generate report (pass/fail)
4. Save diff images (if failures)
5. Exit with code 0 (pass) or 1 (fail)

### CI Integration

```yaml
# .github/workflows/parity.yml
name: Parity Tests
on: [push, pull_request]
jobs:
  parity:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
      - name: Install deps
        run: npm install
      - name: Run parity tests
        run: npm run test:parity
```

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

### Phase 1 Week 1 Focus:

1. Build parity infrastructure (this)
2. Implement `compareImages()` with actual image library
3. Implement `renderClientPreview()` (JavaScript pipeline)
4. Implement `renderServerExport()` (RapidRaw pipeline)
5. Generate golden images
6. CI integration

### Not Implemented Yet:

- [ ] Actual image comparison (currently placeholder)
- [ ] Client render engine
- [ ] Server render engine
- [ ] Golden image generation script
- [ ] CI workflow file

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

## Questions for @Lantana

1. Is 1% tolerance acceptable for JPEG tests?
2. Should we require pixel-perfect for operations like exposure (no compression artifacts)?
3. Do we need performance benchmarks as part of parity gate?
4. Any additional test cases to add to core suite?

---

**Status:** Framework complete, implementation in progress  
**Last Updated:** 2026-03-31  
**Maintainer:** Cassia 🦐  
**Oversight:** Lantana 🌿
