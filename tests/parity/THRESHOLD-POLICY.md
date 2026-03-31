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

1. **Grain Effect:** Random seed differences between client/server
   - Acceptable: 2% (as long as grain looks visually similar)

2. **Tone Mapping:** Complex non-linear transforms
   - Acceptable: 5% (visual similarity more important than pixel-perfect)

3. **Multi-Operation Tests:** Combinations of adjustments
   - Threshold = Sum of individual thresholds (max 5%)

### When to Decrease Threshold

1. **Neutral State:** No adjustments applied
   - Requirement: < 0.1% (should be near-identical)

2. **Simple Linear Operations:** Exposure, brightness
   - Requirement: < 1% (minimal compression impact)

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
