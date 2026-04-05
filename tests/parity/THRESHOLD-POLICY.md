# Parity Threshold Policy

## Overview

This document defines acceptable tolerance levels for preview/export parity tests.

## Philosophy

**Goal:** Client preview and server export should be **visually indistinguishable** to the human eye.

**Reality:** Due to:
- Floating-point precision differences (JavaScript vs server)
- JPEG compression artifacts
- Rounding in color space conversions

...pixel-perfect matching is unrealistic. We define thresholds that ensure visual parity while accounting for technical limitations.

## Threshold Definitions

### Measurement

Difference measured as: **percentage of pixels with any RGB channel difference**

```
diff_percentage = pixels_different / total_pixels
```

### Tolerance Levels

| Level | Threshold | Use Case | Explanation |
|-------|-----------|----------|-------------|
| **Strict** | 0.001 (0.1%) | Simple operations with no compression | Near pixel-perfect, allows for minimal rounding |
| **Standard** | 0.01 (1%) | Most operations with JPEG output | Accounts for compression artifacts |
| **Relaxed** | 0.05 (5%) | Complex operations (curves, HSL, tone mapping) | Allows for algorithm implementation differences |
| **Warning** | 0.10 (10%) | Should not be used | Indicates likely bug |

### Per-Module Thresholds

| Module | Operation | Threshold | Rationale |
|--------|-----------|-----------|-----------|
| **Basic** | Exposure | 0.01 | Simple linear operation, JPEG compression |
| **Basic** | Contrast | 0.01 | Simple curve operation |
| **Basic** | Highlights/Shadows | 0.01 | Linear adjustments |
| **Basic** | Temperature | 0.01 | Color shift, minor compression impact |
| **Basic** | Saturation | 0.01 | Color adjustment, minor compression |
| **Curves** | Master curve | 0.02 | Curve interpolation differences |
| **Curves** | RGB curves | 0.02 | Per-channel curves |
| **Curves** | Endpoints | 0.02 | Black/white point adjustments |
| **Color Wheels** | Shadows/Mid/High | 0.02 | Complex color math |
| **HSL** | Per-channel | 0.03 | Hue/sat/lum in specific ranges |
| **Tone Mapper** | ACES | 0.05 | Complex non-linear transform |
| **Tone Mapper** | Filmic | 0.05 | Complex non-linear transform |
| **Tone Mapper** | Reinhard | 0.02 | Simpler tone mapping |
| **Effects** | Vignette | 0.01 | Gradient overlay |
| **Effects** | Grain | 0.02 | Random noise (seed-dependent) |
| **Geometry** | Rotation | 0.02 | Interpolation differences |

## Exception Rules

### When to Increase Threshold

1. **Grain Effect:** Deterministic seed control required
   - **Policy:** Client and server MUST use same grain seed for given image
   - **Implementation:** Seed = hash(image_path + node_id + grain_params)
   - **Acceptable difference:** < 0.5% (seed ensures identical noise pattern)
   - **If seed control not implemented:** Test will fail (no exception)
   - **Exception ONLY valid after:** Seed implementation is tested and passing

2. **Tone Mapping:** Complex non-linear transforms
   - Acceptable: 5% (visual similarity more important than pixel-perfect)
   - Must document rationale for any test using relaxed threshold

3. **Multi-Operation Tests:** NO THRESHOLD STACKING
   - **Policy:** Each test uses single threshold, not sum of operations
   - **Rationale:** Prevents additive drift hiding real parity issues
   - Multi-op tests use standard 1% threshold unless specific operation requires relaxed
   - If multi-op test fails at 1%, investigate which operation causes drift

### When to Decrease Threshold (Stricter Requirements)

1. **Neutral State:** No adjustments applied
   - **Requirement: < 0.001% (0.001)** - Should be pixel-identical or nearly so
   - Rationale: No operations = no differences, only possible source is compression
   - If neutral test fails, indicates fundamental parity problem

2. **Simple Linear Operations:** Exposure, brightness
   - Requirement: < 1% (minimal compression impact)
   - These are baseline operations, must be highly accurate

## Pass/Fail Criteria

### Individual Test

```
PASS if diff_percentage < threshold
FAIL if diff_percentage >= threshold
```

### Test Suite

```
PASS if ALL tests pass
FAIL if ANY test fails
```

No exceptions. Every test must pass.

## Debugging Failed Tests

When a test fails (diff > threshold):

1. **Generate visual diff image**
   - Highlight pixels with differences
   - Save to `reports/diffs/[test-name]-diff.png`

2. **Analyze difference pattern**
   - Random scatter → likely JPEG compression (acceptable if < threshold)
   - Systematic pattern → algorithm bug (investigate)
   - Large blocks → serious issue (fix immediately)

3. **Compare hashes**
   - If client/server hashes match but golden doesn't → regenerate golden
   - If client/server hashes differ → parity bug (fix before proceeding)

## Golden Image Regeneration

Golden images should be regenerated when:
- ✅ Server render engine changes (intentional improvement)
- ✅ JPEG quality settings change
- ❌ Client render engine changes (fix client to match server!)
- ❌ Test is failing (never just update golden to pass test)

**Process:**
1. Ensure server render is correct (visual inspection)
2. Run `npm run generate-golden-images`
3. Commit updated golden images with explanation
4. Tag @Lantana for review of regeneration

## Review Gates

### Before Implementation (Week 1)
- ✅ Threshold policy approved by @Lantana
- ✅ Test suite covers critical operations
- ✅ Tolerance levels justified

### Before Deployment (Phase 1 End)
- ✅ All tests passing at defined thresholds
- ✅ Visual inspection confirms parity
- ✅ No threshold exceptions without documented rationale

## Open Questions for @Lantana

1. **Grain tolerance:** Is 2% acceptable given randomness?
2. **Tone mapper tolerance:** Is 5% too high for ACES/Filmic?
3. **Multi-operation accumulation:** Should we allow threshold stacking?
4. **Neutral test:** Should it be pixel-perfect (0.001%) or allow compression (0.01%)?

---

**Status:** Draft pending @Lantana approval  
**Version:** 1.0  
**Last Updated:** 2026-03-31  
**Author:** Cassia 🦐

## Grain Seed Control (Mandatory)

### Problem

Film grain adds random noise to images. If client and server use different random seeds, outputs will differ significantly even with identical algorithms.

### Solution

**Deterministic seed generation:**

```typescript
function getGrainSeed(
  imagePath: string,
  nodeId: string,
  grainParams: { size: number; roughness: number }
): number {
  // Seed based on image path + node + params = deterministic across runs
  const seedString = `${imagePath}:${nodeId}:${grainParams.size}:${grainParams.roughness}`;
  const hash = crypto.createHash('sha256').update(seedString).digest();
  return hash.readUInt32LE(0); // Convert first 4 bytes to number
}
```

### Implementation Requirements

1. **Both client and server** must use `getGrainSeed()` for grain effect
2. **Never use** `Math.random()` directly for grain
3. **Always pass** same imagePath, nodeId, grainParams to seed function
4. **Test** grain parity explicitly (test case in core suite)

### Parity Test

When grain is applied:
- ✅ Client and server use same seed → diff < 0.5%
- ❌ Different seeds → diff > 10% (test fails, as expected)

This ensures grain looks identical, not just "similar."

---

**Status:** Policy defined, implementation pending  
**Gate Requirement:** Grain seed control must be implemented before Phase 2
