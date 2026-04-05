# Canonical DevelopState Contract

**Authority:** This document defines the authoritative `DevelopState` structure for RedBulb NEM (Node Editor Module).

**Source of Truth:** `@redbulb/nem-core/src/types.ts`

**Version:** 1.0 (Phase 1 complete, Phase 2 in progress)

---

## Overview

`DevelopState` represents the complete photographic adjustment state for a single image in RedBulb. It is:

- **Flat structure** - All primary fields at top level (no nesting for basic/color groups)
- **Zero-based neutrality** - Zero (or 6500K for temperature) means "no adjustment"
- **Cumulative composition** - Multiple DevelopStates compose via "last non-zero wins"
- **UI-agnostic** - No knowledge of UI defaults or presentation layer
- **Cross-platform identical** - Server, web, and desktop use the same structure

---

## Field-by-Field Reference Table

### Primary Tonal Adjustments

| Canonical Name | Type | Range | Web Source (Nested) | Server Source | Status | Notes |
|---|---|---|---|---|---|---|
| `exposure` | number | -5.0 to +5.0 | `basic.exposure` | `exposure` | **keep** | Direct mapping |
| `contrast` | number | -100 to +100 | `basic.contrast` | `contrast` | **keep** | Direct mapping |
| `highlights` | number | -100 to +100 | `basic.highlights` | `highlights` | **keep** | Direct mapping |
| `shadows` | number | -100 to +100 | `basic.shadows` | `shadows` | **keep** | Direct mapping |
| `whites` | number | -100 to +100 | `basic.whites` | `whites` | **keep** | Direct mapping |
| `blacks` | number | -100 to +100 | `basic.blacks` | `blacks` | **keep** | Direct mapping |
| `brightness` | number | -100 to +100 | `basic.brightness` | *(absent)* | **deprecate** | Not implemented in rendering engine; drop for v1 |

**Migration Note:** `brightness` is web-only, not implemented. Drop during migration or map to `exposure` as approximation.

---

### Color Adjustments

| Canonical Name | Type | Range | Web Source (Nested) | Server Source | Status | Notes |
|---|---|---|---|---|---|---|
| `temperature` | number | 2000-50000 | `color.temperature` | `temperature` | **keep** | Kelvin; neutral = 6500K |
| `tint` | number | -150 to +150 | `color.tint` | `tint` | **keep** | Direct mapping |
| `saturation` | number | -100 to +100 | `color.saturation` | `saturation` | **keep** | Direct mapping |
| `vibrance` | number | -100 to +100 | `color.vibrance` | `vibrance` | **keep** | Direct mapping |
| `hue` | number | -180 to +180 | *(absent)* | `hue` | **keep** | Add to web with neutral value (0) |

**Migration Note:** `hue` is missing in web client. Add with default value `0` during migration.

---

### Detail Adjustments

| Canonical Name | Type | Range | Web Source (Nested) | Server Source | Status | Notes |
|---|---|---|---|---|---|---|
| `clarity` | number | -100 to +100 | `details.clarity` | `clarity` | **keep** | Top-level for backward compat |
| `dehaze` | number | -100 to +100 | `details.dehaze` | `dehaze` | **keep** | Top-level for backward compat |

**Note:** `clarity` and `dehaze` exist both at top level AND in optional `details` group for compatibility.

---

### Optional: Details Group

| Canonical Name | Type | Range | Web Source (Nested) | Server Source | Status | Notes |
|---|---|---|---|---|---|---|
| `details.texture` | number | -100 to +100 | `effects.texture` | `details.texture` | **keep** | **Grouping change:** moves from `effects` to `details` |
| `details.sharpness` | number | -100 to +100 | `details.sharpness` | `details.sharpness` | **keep** | Direct mapping |
| `details.noiseReduction` | number | 0 to 100 | `details.noiseReduction` | `details.noiseReduction` | **keep** | Direct mapping |
| `details.clarity` | number | -100 to +100 | `details.clarity` | `details.clarity` | **keep** | Duplicate for compatibility |
| `details.caCorrection` | number | 0 to 100 | `details.caCorrection` | *(absent)* | **deprecate** | Not implemented; drop for v1 |

**Migration Note:** `texture` moves from `effects` group to `details` group. `caCorrection` is web-only, not implemented—drop during migration.

---

### Optional: Effects Group

| Canonical Name | Type | Range | Web Source (Nested) | Server Source | Status | Notes |
|---|---|---|---|---|---|---|
| `effects.vignette` | number | 0 to 100 | `effects.vignette` | `effects.vignette` | **keep** | Direct mapping |
| `effects.vignetteMidpoint` | number | 0 to 100 | `effects.vignetteMidpoint` | `effects.vignetteMidpoint` | **keep** | UI default = 50 (treated as active) |
| `effects.vignetteRoundness` | number | -100 to +100 | `effects.vignetteRoundness` | `effects.vignetteRoundness` | **keep** | Direct mapping |
| `effects.vignetteFeather` | number | 0 to 100 | `effects.vignetteFeather` | `effects.vignetteFeather` | **keep** | Direct mapping |
| `effects.vignetteHighlights` | number | -100 to +100 | `effects.vignetteHighlights` | `effects.vignetteHighlights` | **keep** | Direct mapping |
| `effects.grain` | number | 0 to 100 | `effects.grain` | `effects.grain` | **keep** | Direct mapping |
| `effects.grainSize` | number | 0 to 100 | `effects.grainSize` | `effects.grainSize` | **keep** | Direct mapping |
| `effects.grainRoughness` | number | 0 to 100 | `effects.grainRoughness` | `effects.grainRoughness` | **keep** | Direct mapping |
| `effects.fade` | number | 0 to 100 | `effects.fade` | `effects.fade` | **keep** | Direct mapping |

**Migration Note:** `effects.texture` moves to `details.texture` (see Details Group above).

---

### Optional: Tone Curves

| Canonical Name | Type | Web Source | Server Source | Status | Notes |
|---|---|---|---|---|---|
| `curves` | object | `curves` | `curves` | **keep** | Control points for master/red/green/blue channels |
| `curves.master` | Array<{x,y}> | `curves.master` | `curves.master` | **keep** | Master curve control points |
| `curves.red` | Array<{x,y}> | `curves.red` | `curves.red` | **keep** | Red channel curve |
| `curves.green` | Array<{x,y}> | `curves.green` | `curves.green` | **keep** | Green channel curve |
| `curves.blue` | Array<{x,y}> | `curves.blue` | `curves.blue` | **keep** | Blue channel curve |

**Migration Note:** Curves array replacement (not per-point merge) during composition.

---

### Optional: Curve Endpoints

| Canonical Name | Type | Web Source | Server Source | Status | Notes |
|---|---|---|---|---|---|
| `curveEndpoints` | object | `curveEndpoints` | `curveEndpoints` | **keep** | Black/white points per channel |
| `curveEndpoints.master.black` | {x,y} | `curveEndpoints.master.black` | `curveEndpoints.master.black` | **keep** | Default (0,0) treated as active |
| `curveEndpoints.master.white` | {x,y} | `curveEndpoints.master.white` | `curveEndpoints.master.white` | **keep** | Default (1,1) treated as active |
| `curveEndpoints.red.*` | {x,y} | `curveEndpoints.red.*` | `curveEndpoints.red.*` | **keep** | Per-channel black/white |
| `curveEndpoints.green.*` | {x,y} | `curveEndpoints.green.*` | `curveEndpoints.green.*` | **keep** | Per-channel black/white |
| `curveEndpoints.blue.*` | {x,y} | `curveEndpoints.blue.*` | `curveEndpoints.blue.*` | **keep** | Per-channel black/white |

**Migration Note:** Curve endpoint values at (0,0) or (1,1) are considered active (not inactive).

---

### Optional: Color Wheels

| Canonical Name | Type | Range | Web Source | Server Source | Status | Notes |
|---|---|---|---|---|---|---|
| `colorWheels` | object | `colorWheels` | `colorWheels` | **keep** | Lift/gamma/gain style adjustments |
| `colorWheels.shadows` | {hue,sat,lum} | `colorWheels.shadows` | `colorWheels.shadows` | **keep** | Shadows wheel |
| `colorWheels.midtones` | {hue,sat,lum} | `colorWheels.midtones` | `colorWheels.midtones` | **keep** | Midtones wheel |
| `colorWheels.highlights` | {hue,sat,lum} | `colorWheels.highlights` | `colorWheels.highlights` | **keep** | Highlights wheel |

---

### Optional: HSL Adjustments

| Canonical Name | Type | Range | Web Source | Server Source | Status | Notes |
|---|---|---|---|---|---|---|
| `hsl` | object | `hsl` | `hsl` | **keep** | Per-color HSL adjustments |
| `hsl.red` | {h,s,l} | `hsl.red` | `hsl.red` | **keep** | Red channel HSL |
| `hsl.orange` | {h,s,l} | `hsl.orange` | `hsl.orange` | **keep** | Orange channel HSL |
| `hsl.yellow` | {h,s,l} | `hsl.yellow` | `hsl.yellow` | **keep** | Yellow channel HSL |
| `hsl.green` | {h,s,l} | `hsl.green` | `hsl.green` | **keep** | Green channel HSL |
| `hsl.aqua` | {h,s,l} | `hsl.aqua` | `hsl.aqua` | **keep** | Aqua channel HSL |
| `hsl.blue` | {h,s,l} | `hsl.blue` | `hsl.blue` | **keep** | Blue channel HSL |
| `hsl.purple` | {h,s,l} | `hsl.purple` | `hsl.purple` | **keep** | Purple channel HSL |
| `hsl.magenta` | {h,s,l} | `hsl.magenta` | `hsl.magenta` | **keep** | Magenta channel HSL |

---

### Optional: Tone Mapper

| Canonical Name | Type | Values | Web Source | Server Source | Status | Notes |
|---|---|---|---|---|---|---|
| `toneMapper` | string | 'none' \| 'aces' \| 'reinhard' \| 'filmic' \| 'uncharted' | `toneMapper` | `toneMapper` | **keep** | Tone mapping algorithm selection |

---

### Optional: Geometry

| Canonical Name | Type | Range | Web Source | Server Source | Status | Notes |
|---|---|---|---|---|---|---|
| `geometry` | object | *(separate)* | `geometry` | **keep** | Global transforms (not per-node in web v1) |
| `geometry.rotation` | number | -180 to +180 | `geometry.rotation` | `geometry.rotation` | **keep** | Rotation in degrees |
| `geometry.distortion` | number | -100 to +100 | `geometry.distortion` | `geometry.distortion` | **keep** | Lens distortion correction |
| `geometry.vertical` | number | -100 to +100 | `geometry.vertical` | `geometry.vertical` | **keep** | Vertical perspective |
| `geometry.horizontal` | number | -100 to +100 | `geometry.horizontal` | `geometry.horizontal` | **keep** | Horizontal perspective |
| `geometry.scale` | number | 0.1 to 10.0 | `geometry.scale` | `geometry.scale` | **keep** | Scale factor |

**Migration Note:** In web client v1, geometry may stay separate (global state, not per-node). Optional for Phase 2.

---

### Metadata (Web-Only)

| Canonical Name | Type | Web Source | Server Source | Status | Notes |
|---|---|---|---|---|---|
| `version` | number | `version` | *(absent)* | **deprecate** | Metadata, not photographic state; belongs in container (Node, XMP), not state |

**Migration Note:** `version` field is dropped. Versioning should be handled at serialization layer, not in DevelopState itself.

---

## Summary Statistics

**Total Fields:**
- Primary (top-level): 12 fields (exposure through dehaze)
- Optional groups: 6 groups (details, effects, curves, curveEndpoints, colorWheels, hsl, geometry)
- Web-only deprecated: 3 fields (version, brightness, caCorrection)
- Missing in web: 1 field (hue)

**Migration Impact:**
- **Keep (flatten):** 24 fields
- **Drop:** 3 fields (version, brightness, caCorrection)
- **Add:** 1 field (hue)
- **Grouping change:** texture moves from effects → details

---

## Neutral State

The "neutral" or "zero adjustment" state:

```typescript
const neutralDevelopState: DevelopState = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  temperature: 6500,  // SPECIAL: neutral white balance (6500K)
  tint: 0,
  saturation: 0,
  vibrance: 0,
  hue: 0,
  clarity: 0,
  dehaze: 0,
};
```

**Key principle:** Only `temperature` has a non-zero neutral value (6500K = daylight white balance).

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

## Type Definition (TypeScript)

```typescript
interface DevelopState {
  // Primary tonal adjustments
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  
  // Color adjustments
  temperature: number;     // 2000-50000K (neutral = 6500K)
  tint: number;            // -150 to +150
  saturation: number;      // -100 to +100
  vibrance: number;        // -100 to +100
  hue: number;             // -180 to +180
  
  // Detail adjustments (top-level for backward compat)
  clarity: number;         // -100 to +100
  dehaze: number;          // -100 to +100
  
  // Optional: Details group
  details?: {
    texture?: number;           // -100 to +100
    sharpness?: number;         // -100 to +100
    noiseReduction?: number;    // 0 to 100
    clarity?: number;           // -100 to +100 (duplicate)
  };
  
  // Optional: Effects
  effects?: {
    vignette?: number;          // 0 to 100
    vignetteMidpoint?: number;  // 0 to 100 (UI default = 50)
    vignetteRoundness?: number; // -100 to +100
    vignetteFeather?: number;   // 0 to 100
    vignetteHighlights?: number;// -100 to +100
    grain?: number;             // 0 to 100
    grainSize?: number;         // 0 to 100
    grainRoughness?: number;    // 0 to 100
    fade?: number;              // 0 to 100
  };
  
  // Optional: Tone curves
  curves?: {
    master?: Array<{ x: number; y: number }>;
    red?: Array<{ x: number; y: number }>;
    green?: Array<{ x: number; y: number }>;
    blue?: Array<{ x: number; y: number }>;
  };
  
  // Optional: Curve endpoints
  curveEndpoints?: {
    master?: { black?: { x: number; y: number }; white?: { x: number; y: number } };
    red?: { black?: { x: number; y: number }; white?: { x: number; y: number } };
    green?: { black?: { x: number; y: number }; white?: { x: number; y: number } };
    blue?: { black?: { x: number; y: number }; white?: { x: number; y: number } };
  };
  
  // Optional: Color wheels
  colorWheels?: {
    shadows?: { hue: number; sat: number; lum: number };
    midtones?: { hue: number; sat: number; lum: number };
    highlights?: { hue: number; sat: number; lum: number };
  };
  
  // Optional: HSL per-color adjustments
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

## Cross-Platform Guarantees

1. **Determinism** - Same DevelopState produces same output on all platforms (server, web, desktop)
2. **Serialization** - DevelopState must round-trip through JSON without loss
3. **Versioning** - Future versions may add fields, but never remove or change semantics
4. **Type safety** - TypeScript types enforce contract at compile time

---

## Migration Path

See companion documents:
- **Field mapping:** `WEB-FIELD-MAPPING.md` (detailed migration rules)
- **Semantics:** `SEMANTICS.md` (evaluator behavior rules)
- **Phase 2 plan:** `PHASE-2-TYPE-UNIFICATION-PLAN.md` (6-day migration schedule)

---

**Status:** Contract defined and frozen (Phase 1)  
**Next:** Migrate web client to use canonical structure (Phase 2)  
**Version:** 1.0 (no breaking changes allowed without major version bump)
