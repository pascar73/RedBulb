# Web Migration Notes - Web-Only Fields

**Purpose:** Detailed migration guidance for web-only fields that don't exist in canonical DevelopState.

**Context:** Web client currently has 3 web-only fields that need special handling during Phase 2 migration.

---

## Web-Only Fields Summary

| Field Name | Web Location | Status | Action | Rationale |
|---|---|---|---|---|
| `version` | Top-level | **DROP** | Remove from DevelopState | Metadata, not photographic state |
| `brightness` | `basic.brightness` | **DROP** | Remove (not implemented) | No rendering engine support |
| `caCorrection` | `details.caCorrection` | **DROP** | Remove (not implemented) | Feature planned for v2+ |

---

## Field 1: `version` (Metadata Field)

### Current State (Web Client)

```typescript
interface DevelopState {
  version: 1;  // <-- WEB-ONLY
  basic: { ... };
  color: { ... };
  // ...
}
```

### Problem

The `version` field is **metadata about the serialization format**, not part of the photographic state itself. It:
- Doesn't affect rendering
- Isn't needed by the evaluator
- Belongs at the container level (Node, XMP file), not in DevelopState

### Migration Action: **DROP**

**Remove `version` from DevelopState interface:**

```typescript
// BEFORE (web nested)
interface DevelopState {
  version: 1;  // <-- REMOVE THIS
  basic: { ... };
  // ...
}

// AFTER (canonical flat)
interface DevelopState {
  // No version field
  exposure: number;
  contrast: number;
  // ...
}
```

### Versioning Strategy Going Forward

**Where versioning belongs:**

1. **Node level** (for node graph serialization):
   ```typescript
   interface Node {
     id: string;
     type: string;
     state: DevelopState;  // No version here
     version: 1;           // Version at Node level
   }
   ```

2. **XMP sidecar** (for XMP serialization):
   ```xml
   <rdf:Description rdf:about=""
     xmlns:rb="http://redbulb.io/ns/1.0/"
     rb:version="1">
     <!-- DevelopState fields here, no version inside -->
   </rdf:Description>
   ```

3. **API envelope** (for server responses):
   ```typescript
   interface DevelopStateResponse {
     version: 1;           // Version at envelope level
     data: DevelopState;   // Clean state, no version
   }
   ```

**Rationale:** Versioning is a serialization concern, not a state concern. Keeping DevelopState clean makes it easier to:
- Compose multiple states
- Test evaluation logic
- Use same structure across all platforms

---

## Field 2: `brightness` (Not Implemented)

### Current State (Web Client)

```typescript
interface DevelopState {
  basic: {
    exposure: number;
    contrast: number;
    brightness: number;  // <-- WEB-ONLY, NOT IMPLEMENTED
    // ...
  };
}
```

### Problem

The `brightness` field exists in web UI but is **not implemented in the rendering engine**. It:
- Has no effect on output images
- Was placeholder for future feature
- Confuses users (slider exists but does nothing)

### Migration Action: **DROP**

**Remove `brightness` from DevelopState:**

```typescript
// BEFORE (web nested)
interface DevelopState {
  basic: {
    exposure: number;
    brightness: number;  // <-- REMOVE THIS
    // ...
  };
}

// AFTER (canonical flat)
interface DevelopState {
  exposure: number;
  // No brightness field
  // ...
}
```

### Alternative: Map to Exposure (Optional)

**If you want to preserve existing user data:**

During migration, you could map `brightness` to `exposure` as an approximation:

```typescript
function migrateBrightness(webState: WebDevelopState): DevelopState {
  const canonical: DevelopState = {
    exposure: webState.basic.exposure + (webState.basic.brightness * 0.01),
    // ^ Combine exposure + brightness (brightness is typically -100 to +100)
    // ...
  };
  return canonical;
}
```

**Recommendation:** **Don't map it**. Since it had no effect in the original implementation, there's no user expectation to preserve. Clean drop is better.

### UI Changes Required

**Remove brightness slider from UI:**

1. Delete `BasicPanel.svelte` brightness slider component
2. Remove brightness from default state factory
3. Update UI tests to remove brightness assertions

**Timeline:** Phase 2.2 (UI component migration)

---

## Field 3: `caCorrection` (Planned Feature)

### Current State (Web Client)

```typescript
interface DevelopState {
  details: {
    clarity: number;
    dehaze: number;
    sharpness: number;
    caCorrection: number;  // <-- WEB-ONLY, NOT IMPLEMENTED
    // ...
  };
}
```

### Problem

The `caCorrection` (Chromatic Aberration Correction) field exists in web UI but is **not implemented in the rendering engine**. It:
- Was planned for v1 but didn't make the cut
- Has no effect on output images
- Is a legitimate future feature (unlike `brightness`)

### Migration Action: **DROP** (for v1)

**Remove `caCorrection` from DevelopState for v1:**

```typescript
// BEFORE (web nested)
interface DevelopState {
  details: {
    clarity: number;
    caCorrection: number;  // <-- REMOVE THIS FOR V1
    // ...
  };
}

// AFTER (canonical flat)
interface DevelopState {
  details?: {
    clarity: number;
    // No caCorrection yet
    // ...
  };
}
```

### Future Re-Addition Plan

**When CA correction is implemented (v2+):**

1. Add field back to canonical DevelopState:
   ```typescript
   interface DevelopState {
     details?: {
       caCorrection?: number;  // 0 to 100
       // ...
     };
   }
   ```

2. Implement rendering logic in RapidRAW shader

3. Add UI control back

**Versioning:** This would be a **backward-compatible addition** (optional field), not a breaking change.

**Migration of old data:** Any DevelopStates from v1 (without `caCorrection`) will work fine in v2+ (field is optional).

### UI Changes Required

**Remove CA correction slider from UI:**

1. Delete `DetailsPanel.svelte` caCorrection slider component
2. Remove caCorrection from default state factory
3. Update UI tests to remove caCorrection assertions

**Timeline:** Phase 2.2 (UI component migration)

---

## Migration Validation Checklist

**After removing web-only fields, verify:**

1. ✅ No `version` field in DevelopState interface
2. ✅ No `brightness` field in basic group
3. ✅ No `caCorrection` field in details group
4. ✅ All UI components updated (sliders removed)
5. ✅ All tests updated (no assertions on removed fields)
6. ✅ No runtime errors from accessing undefined fields
7. ✅ XMP adapter doesn't try to serialize removed fields

---

## Code Search Commands

**To verify complete removal:**

```bash
# Search for 'version' in DevelopState contexts
grep -r "version.*:" web/src/lib/components/asset-viewer/editor/

# Search for 'brightness' references
grep -r "brightness" web/src/lib/components/asset-viewer/editor/

# Search for 'caCorrection' references
grep -r "caCorrection" web/src/lib/components/asset-viewer/editor/
```

**After migration, all searches should return 0 results** (or only comments/docs).

---

## Backward Compatibility

### Reading Old Web States

**If you need to read old (pre-migration) web states:**

```typescript
function readLegacyWebState(legacy: any): DevelopState {
  // Drop version, brightness, caCorrection
  const canonical: DevelopState = {
    exposure: legacy.basic?.exposure ?? 0,
    contrast: legacy.basic?.contrast ?? 0,
    // ... other fields
    // Explicitly skip: version, brightness, caCorrection
  };
  
  return canonical;
}
```

### Writing New States

**Always write canonical structure:**

```typescript
function writeCanonicalState(state: DevelopState): string {
  // No version, brightness, or caCorrection
  return JSON.stringify(state);
}
```

**Old readers:** If old code tries to read new states, it will simply ignore unknown fields (forward compatible).

---

## Summary

**Web-Only Fields Disposition:**

| Field | Action | Reason | Data Loss Risk |
|---|---|---|---|
| `version` | **Drop** | Metadata, not state | None (no user data) |
| `brightness` | **Drop** | Not implemented | None (had no effect) |
| `caCorrection` | **Drop for v1, add in v2+** | Not implemented yet | None (had no effect) |

**No user data loss:** All three fields had no effect on rendered images, so dropping them doesn't lose any actual photographic adjustments.

**Clean migration:** Removing these fields simplifies the codebase and aligns web client with canonical structure.

---

## Related Documents

- Canonical contract: `CANONICAL-DEVELOP-STATE.md`
- Semantics: `SEMANTICS.md`
- Field mapping: `WEB-FIELD-MAPPING.md` (root of repo)
- Phase 2 plan: `PHASE-2-TYPE-UNIFICATION-PLAN.md` (root of repo)

---

**Status:** Migration notes documented (Block 2A Task 3)  
**Next:** Execute migration during Phase 2.2 (UI component updates)
