# Web Field Mapping - Migration Guide

**Purpose:** Explicit mapping of web client fields to canonical DevelopState structure.

**Context:** Web client currently uses nested DevelopState. This document maps all fields to canonical flat structure.

---

## Mapping Table

### Fields with 1:1 Mapping (Keep, Flatten)

| Web Path (Nested) | Canonical Path (Flat) | Notes |
|---|---|---|
| `basic.exposure` | `exposure` | Direct mapping |
| `basic.contrast` | `contrast` | Direct mapping |
| `basic.highlights` | `highlights` | Direct mapping |
| `basic.shadows` | `shadows` | Direct mapping |
| `basic.whites` | `whites` | Direct mapping |
| `basic.blacks` | `blacks` | Direct mapping |
| `color.temperature` | `temperature` | Direct mapping |
| `color.tint` | `tint` | Direct mapping |
| `color.saturation` | `saturation` | Direct mapping |
| `color.vibrance` | `vibrance` | Direct mapping |
| `details.clarity` | `clarity` | Direct mapping |
| `details.dehaze` | `dehaze` | Direct mapping |
| `details.sharpness` | `details.sharpness` | Moves to optional `details` group |
| `details.noiseReduction` | `details.noiseReduction` | Moves to optional `details` group |
| `effects.texture` | `details.texture` | **Grouping change:** effects → details |
| `effects.vignette` | `effects.vignette` | Moves to optional `effects` group |
| `effects.vignetteMidpoint` | `effects.vignetteMidpoint` | Moves to optional `effects` group |
| `effects.vignetteRoundness` | `effects.vignetteRoundness` | Moves to optional `effects` group |
| `effects.vignetteFeather` | `effects.vignetteFeather` | Moves to optional `effects` group |
| `effects.vignetteHighlights` | `effects.vignetteHighlights` | Moves to optional `effects` group |
| `effects.grain` | `effects.grain` | Moves to optional `effects` group |
| `effects.grainSize` | `effects.grainSize` | Moves to optional `effects` group |
| `effects.grainRoughness` | `effects.grainRoughness` | Moves to optional `effects` group |
| `effects.fade` | `effects.fade` | Moves to optional `effects` group |
| `toneMapper` | `toneMapper` | Direct mapping |
| `curves` | `curves` | Direct mapping |
| `curveEndpoints` | `curveEndpoints` | Direct mapping |
| `colorWheels` | `colorWheels` | Direct mapping |
| `hsl` | `hsl` | Direct mapping |

### Fields to DROP (Web-Only, Not Implemented)

| Web Path | Reason | Migration Strategy |
|---|---|---|
| `version` | Metadata, not state | Drop (not part of DevelopState) |
| `basic.brightness` | Not implemented in rendering | Drop for v1 (or map to exposure as approximation) |
| `details.caCorrection` | Not implemented yet | Drop for v1 (add in future version) |

### Fields to ADD (Missing in Web)

| Canonical Path | Web Equivalent | Migration Strategy |
|---|---|---|
| `hue` | None | Add with default value (0) |
| `geometry` | Separate global state | Keep separate for v1 (geometry is global, not per-node) |

---

## Detailed Migration Rules

### Rule 1: Flatten Basic Group

**Before (web):**
```typescript
state.basic = {
  exposure: 1.0,
  contrast: 20,
  highlights: -10,
  shadows: 15,
  whites: 5,
  blacks: -5,
  brightness: 10  // TO DROP
}
```

**After (canonical):**
```typescript
state = {
  exposure: 1.0,
  contrast: 20,
  highlights: -10,
  shadows: 15,
  whites: 5,
  blacks: -5,
  // brightness dropped
}
```

**Migration code:**
```typescript
const canonical = {
  exposure: web.basic.exposure,
  contrast: web.basic.contrast,
  highlights: web.basic.highlights,
  shadows: web.basic.shadows,
  whites: web.basic.whites,
  blacks: web.basic.blacks,
  // brightness dropped (not implemented)
};
```

---

### Rule 2: Flatten Color Group

**Before (web):**
```typescript
state.color = {
  saturation: 10,
  temperature: 5500,
  tint: 5,
  vibrance: 8
}
```

**After (canonical):**
```typescript
state = {
  saturation: 10,
  temperature: 5500,
  tint: 5,
  vibrance: 8,
  hue: 0  // NEW: add with neutral value
}
```

**Migration code:**
```typescript
const canonical = {
  saturation: web.color.saturation,
  temperature: web.color.temperature,
  tint: web.color.tint,
  vibrance: web.color.vibrance,
  hue: 0,  // Add missing field with neutral value
};
```

---

### Rule 3: Consolidate Details

**Before (web):**
```typescript
state.details = {
  sharpness: 20,
  noiseReduction: 15,
  clarity: 10,
  dehaze: 5,
  caCorrection: 0  // TO DROP
}

state.effects = {
  texture: 15  // TO MOVE
}
```

**After (canonical):**
```typescript
state = {
  clarity: 10,  // Top-level for backward compat
  dehaze: 5,    // Top-level for backward compat
  details: {
    sharpness: 20,
    noiseReduction: 15,
    clarity: 10,      // Also in group (duplicated)
    texture: 15       // MOVED from effects
  }
}
```

**Migration code:**
```typescript
const canonical = {
  clarity: web.details.clarity,
  dehaze: web.details.dehaze,
  details: {
    sharpness: web.details.sharpness,
    noiseReduction: web.details.noiseReduction,
    clarity: web.details.clarity,  // Duplicate for compatibility
    texture: web.effects.texture,  // Move from effects
  },
  // caCorrection dropped (not implemented)
};
```

---

### Rule 4: Preserve Effects (Minus Texture)

**Before (web):**
```typescript
state.effects = {
  texture: 15,  // TO MOVE to details
  vignette: 30,
  vignetteMidpoint: 50,
  vignetteRoundness: 0,
  vignetteFeather: 50,
  vignetteHighlights: 0,
  grain: 10,
  grainSize: 25,
  grainRoughness: 50,
  fade: 0
}
```

**After (canonical):**
```typescript
state = {
  effects: {
    // texture moved to details
    vignette: 30,
    vignetteMidpoint: 50,
    vignetteRoundness: 0,
    vignetteFeather: 50,
    vignetteHighlights: 0,
    grain: 10,
    grainSize: 25,
    grainRoughness: 50,
    fade: 0
  }
}
```

**Migration code:**
```typescript
const canonical = {
  effects: {
    vignette: web.effects.vignette,
    vignetteMidpoint: web.effects.vignetteMidpoint,
    vignetteRoundness: web.effects.vignetteRoundness,
    vignetteFeather: web.effects.vignetteFeather,
    vignetteHighlights: web.effects.vignetteHighlights,
    grain: web.effects.grain,
    grainSize: web.effects.grainSize,
    grainRoughness: web.effects.grainRoughness,
    fade: web.effects.fade,
    // texture moved to details
  }
};
```

---

### Rule 5: Drop Metadata

**Before (web):**
```typescript
state.version = 1;  // TO DROP
```

**After (canonical):**
```typescript
// No version field in canonical DevelopState
```

**Rationale:** `version` is metadata about serialization format, not photographic state. It belongs in the container (Node, XMP file), not the state itself.

---

### Rule 6: Geometry Stays Separate

**Before (web):**
```typescript
// Geometry is separate from DevelopState in web client
geometry = {
  rotation: 0,
  distortion: 0,
  vertical: 0,
  horizontal: 0,
  scale: 1.0
}
```

**After (canonical):**
```typescript
// Geometry is optional field in DevelopState
state = {
  geometry: {
    rotation: 0,
    distortion: 0,
    vertical: 0,
    horizontal: 0,
    scale: 1.0
  }
}
```

**Note:** In web client v1, geometry may stay separate (it's global, not per-node). Phase 2 doesn't require moving it into DevelopState.

---

## Migration Validation

**After migrating a DevelopState, verify:**

1. ✅ All top-level basic fields present (exposure, contrast, etc.)
2. ✅ All top-level color fields present (temperature, tint, saturation, vibrance, hue)
3. ✅ clarity and dehaze at top level
4. ✅ `details` group has sharpness, noiseReduction, clarity, texture
5. ✅ `effects` group has all vignette/grain/fade fields (minus texture)
6. ✅ Optional groups (curves, colorWheels, hsl) preserved if present
7. ✅ No `version` field
8. ✅ No `basic` or `color` groups (flattened)

---

## Backward Compatibility

**For reading old (nested) web states:**

Create dual-access helper that reads from both locations:
```typescript
function getValue(state: any, field: string): number {
  // Try flat first (new)
  if (state[field] !== undefined) return state[field];
  
  // Try nested (old)
  if (state.basic?.[field] !== undefined) return state.basic[field];
  if (state.color?.[field] !== undefined) return state.color[field];
  if (state.details?.[field] !== undefined) return state.details[field];
  
  // Default
  return 0;
}
```

**For writing new (flat) states:**

Always write to flat structure. Old readers can be updated incrementally.

---

## Rollout Strategy

**Phase 2.1 (Preparation):** Add dual-access helpers
- Read from both old and new locations
- Write to flat locations
- Tests pass with both structures

**Phase 2.2 (Migration):** Update UI components batch by batch
- Each batch switches to flat access
- Dual-access helpers removed after all components migrated

**Phase 2.3 (Cleanup):** Remove nested structure
- Delete old nested fields from type definition
- Remove dual-access helpers
- Only flat structure remains

---

## Summary

**Fields to keep (flatten):** 24 fields  
**Fields to drop:** 3 fields (version, brightness, caCorrection)  
**Fields to add:** 1 field (hue)  
**Grouping changes:** texture moves from effects to details

**Net change:** Simpler, flatter structure matching canonical contract.

**Status:** Field mapping defined, ready for Phase 2.1 implementation
