# DevelopState Contract - Canonical Definition

**Authority:** This document defines the authoritative DevelopState structure for RedBulb NEM (Node Editor Module).

**Source of Truth:** `@redbulb/nem-core/src/types.ts`

**Version:** 1.0 (Phase 1 - Week 3)

---

## Purpose

DevelopState represents the complete photographic adjustment state for a single image. It is:
- **Flat structure** - All fields at top level (no nesting)
- **Zero-based neutrality** - Zero (or 6500K for temperature) means "no adjustment"
- **Cumulative composition** - Multiple DevelopStates compose via "last non-zero wins"
- **UI-agnostic** - No knowledge of UI defaults or presentation layer

---

## Canonical Structure

```typescript
interface DevelopState {
  // Basic tonal adjustments (-5.0 to +5.0 typical, -100 to +100 for contrast/etc.)
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  
  // Color adjustments
  temperature: number;     // 2000-50000K (neutral = 6500K)
  tint: number;            // -150 to +150 (neutral = 0)
  saturation: number;      // -100 to +100 (neutral = 0)
  vibrance: number;        // -100 to +100 (neutral = 0)
  hue: number;             // -180 to +180 (neutral = 0)
  
  // Details
  clarity: number;         // -100 to +100 (neutral = 0)
  dehaze: number;          // -100 to +100 (neutral = 0)
  
  // Optional: Tone curves (array of control points)
  curves?: {
    master?: Array<{ x: number; y: number }>;
    red?: Array<{ x: number; y: number }>;
    green?: Array<{ x: number; y: number }>;
    blue?: Array<{ x: number; y: number }>;
  };
  
  // Optional: Curve black/white points
  curveEndpoints?: {
    master?: { black?: { x: number; y: number }; white?: { x: number; y: number } };
    red?: { black?: { x: number; y: number }; white?: { x: number; y: number } };
    green?: { black?: { x: number; y: number }; white?: { x: number; y: number } };
    blue?: { black?: { x: number; y: number }; white?: { x: number; y: number } };
  };
  
  // Optional: Color wheels (lift/gamma/gain style)
  colorWheels?: {
    shadows?: { hue: number; sat: number; lum: number };
    midtones?: { hue: number; sat: number; lum: number };
    highlights?: { hue: number; sat: number; lum: number };
  };
  
  // Optional: Per-channel HSL adjustments
  hsl?: {
    red?: { h: number; s: number; l: number };
    orange?: { h: number; s: number; l: number };
    yellow?: { h: number; s: number; l: number };
    green?: { h: number; s: number; l: number };
    aqua?: { h: number; s: number; l: number };
    blue?: { h: number; s: number; l: number };
    purple?: { h: number; s: number; l: number };
    magenta?: { h: number; s: number; l: number };
  };
  
  // Optional: Detail adjustments
  details?: {
    texture?: number;           // -100 to +100
    sharpness?: number;         // -100 to +100
    noiseReduction?: number;    // 0 to 100
    clarity?: number;           // -100 to +100 (duplicated for compatibility)
  };
  
  // Optional: Effects
  effects?: {
    vignette?: number;          // 0 to 100
    vignetteMidpoint?: number;  // 0 to 100
    vignetteRoundness?: number; // -100 to +100
    vignetteFeather?: number;   // 0 to 100
    vignetteHighlights?: number;// -100 to +100
    grain?: number;             // 0 to 100
    grainSize?: number;         // 0 to 100
    grainRoughness?: number;    // 0 to 100
    fade?: number;              // 0 to 100
  };
  
  // Optional: Tone mapping algorithm
  toneMapper?: 'none' | 'aces' | 'reinhard' | 'filmic' | 'uncharted';
  
  // Optional: Geometric transforms (global, not per-node)
  geometry?: {
    rotation?: number;      // -180 to +180 degrees
    distortion?: number;    // -100 to +100
    vertical?: number;      // -100 to +100
    horizontal?: number;    // -100 to +100
    scale?: number;         // 0.1 to 10.0
  };
}
```

---

## Neutral State

The "neutral" or "zero adjustment" state:

```typescript
function createNeutralDevelopState(): DevelopState {
  return {
    exposure: 0,
    contrast: 0,
    highlights: 0,
    shadows: 0,
    whites: 0,
    blacks: 0,
    temperature: 6500,  // SPECIAL: neutral white balance
    tint: 0,
    saturation: 0,
    vibrance: 0,
    hue: 0,
    clarity: 0,
    dehaze: 0,
  };
}
```

**Key principle:** Only `temperature` has a non-zero neutral value (6500K = daylight).

---

## Composition Rules

When composing two DevelopStates (base + patch):

1. **Zero means "no change"** - A zero value in patch doesn't override base
2. **Non-zero always wins** - A non-zero patch value overwrites base
3. **Temperature exception** - 6500K in patch is treated as "no change"
4. **Optional fields merge** - If patch has optional field, it merges with base
5. **Arrays replace** - Curve arrays are replaced entirely (not merged per-point)

**Example:**
```typescript
base = { exposure: 1.0, contrast: 20, temperature: 5500 }
patch = { exposure: 0, contrast: 30, temperature: 6500 }

result = {
  exposure: 1.0,    // patch is 0 (no change), base survives
  contrast: 30,     // patch is non-zero, overwrites
  temperature: 5500 // patch is neutral (6500), base survives
}
```

---

## Inactive Values

A value is "inactive" (doesn't affect rendering) if:
- It is zero (for most fields)
- It is 6500 (for temperature only)
- It is absent/undefined (for optional fields)

**Not inactive:**
- UI default values (e.g., vignetteMidpoint=50)
- Curve endpoints at (0,0)
- Any other non-zero value

**Rationale:** The evaluator has no UI knowledge. It only knows about mathematical neutrality.

---

## Cross-Platform Guarantees

1. **Determinism** - Same DevelopState produces same output on all platforms (server, web, desktop)
2. **Serialization** - DevelopState must round-trip through JSON without loss
3. **Versioning** - Future versions may add fields, but never remove or change semantics
4. **Type safety** - TypeScript types enforce contract at compile time

---

## Web Migration Notes

**Current web structure (nested):**
```typescript
// OLD (web client only)
interface DevelopState {
  version: 1;
  basic: { exposure, contrast, ... };
  color: { temperature, tint, ... };
  // ... more groups
}
```

**Migration path:** See `PHASE-2-TYPE-UNIFICATION-PLAN.md`

**Fields to map:**
- `basic.exposure` → `exposure`
- `basic.contrast` → `contrast`
- `color.temperature` → `temperature`
- `color.saturation` → `saturation`
- `effects.texture` → `details.texture` (grouping change)
- All other fields map 1:1

**Web-only fields (to drop):**
- `version` - Not part of canonical state
- `basic.brightness` - Not implemented in rendering yet (drop or map to exposure)
- `details.caCorrection` - Not implemented yet (drop)

---

## Future Extensions

**Planned additions (maintain backward compatibility):**
- Split toning controls
- Local adjustments (masks/gradients)
- LUT support
- Film emulation curves

**Versioning strategy:**
- Add new optional fields (old code ignores them)
- Never remove or rename existing fields
- If breaking change needed, bump major version and support migration

---

## References

- Source: `packages/nem-core/src/types.ts`
- Tests: `packages/nem-core/src/evaluator.spec.ts`
- Migration plan: `PHASE-2-TYPE-UNIFICATION-PLAN.md`
- Semantics: `SEMANTICS.md` (evaluator behavior rules)

---

**Status:** Canonical contract defined (Phase 1 complete)  
**Next:** Migrate web client to use canonical structure (Phase 2)
