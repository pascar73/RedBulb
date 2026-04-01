# Parity Test Dataset Manifest

## Purpose
Sample images for testing preview/export parity.

## Requirements (from @Lantana)
- ✅ 2 JPEGs
- ⏳ 2 RAWs (different cameras) - Phase 2
- ✅ 1 high-ISO/noisy image

## Dataset

### JPEG Images

#### 1. test-image-01.jpg ✅
- **Source:** Unsplash (Public Domain)
- **URL:** https://unsplash.com/photos/mountain-landscape-21bda4d32df4
- **Resolution:** 1920x1080
- **Size:** 253 KB
- **Format:** JPEG, sRGB, 90% quality
- **Content:** Mountain landscape with varied colors (greens, blues, earth tones)
- **SHA-256:** `ccdc7699cb31debefba3c61425bfa29a64928ef89a7bb9d8a26ecb2cd64d575c`
- **License:** Unsplash License (free to use, commercially and non-commercially)
- **Downloaded:** 2026-04-01

#### 2. test-image-02.jpg ✅
- **Source:** Unsplash (Public Domain)
- **URL:** https://unsplash.com/photos/portrait-woman-94ddf0286df2
- **Resolution:** 1920x1080
- **Size:** 136 KB
- **Format:** JPEG, sRGB, 90% quality
- **Content:** Portrait with skin tones (good for temperature/tint testing)
- **SHA-256:** `a06bd141a400f4f770d08ecd56e8cceebe1a2205ad7383f359a0d6757aa53847`
- **License:** Unsplash License (free to use)
- **Downloaded:** 2026-04-01

### High-ISO/Noisy Image

#### 3. test-noisy-iso6400.jpg ✅
- **Source:** Unsplash (Public Domain)
- **URL:** https://unsplash.com/photos/night-scene-37900150dfca
- **Resolution:** 1920x1080
- **Size:** 499 KB
- **Format:** JPEG, sRGB, 90% quality
- **Content:** Low-light night scene with visible noise
- **SHA-256:** `01f3beeb3ef11f98f1dec3bb60f948938977c955dfafd3bce440f9fa6045cbac`
- **License:** Unsplash License (free to use)
- **Downloaded:** 2026-04-01

### RAW Images (Phase 2)

#### 4. test-raw-nikon.NEF ⏳
- **Status:** Deferred to Phase 2 (RAW support)
- **Planned Source:** Nikon sample images or public dataset
- **Camera:** Nikon D850 or similar

#### 5. test-raw-canon.CR2 ⏳
- **Status:** Deferred to Phase 2 (RAW support)
- **Planned Source:** Canon sample images or public dataset
- **Camera:** Canon EOS 5D Mark IV or similar

## Download Script

To regenerate the dataset:

```bash
cd tests/parity/test-data
./download-images.sh
```

This will download fresh copies from Unsplash with the same parameters.

## Verification

Verify checksums after download:

```bash
cd tests/parity/test-data
sha256sum -c << EOF
ccdc7699cb31debefba3c61425bfa29a64928ef89a7bb9d8a26ecb2cd64d575c  test-image-01.jpg
a06bd141a400f4f770d08ecd56e8cceebe1a2205ad7383f359a0d6757aa53847  test-image-02.jpg
01f3beeb3ef11f98f1dec3bb60f948938977c955dfafd3bce440f9fa6045cbac  test-noisy-iso6400.jpg
EOF
```

## License Information

### Unsplash License Summary

All images are sourced from Unsplash under the Unsplash License:
- ✅ Free to use for commercial and non-commercial purposes
- ✅ No attribution required (but appreciated)
- ✅ Can be modified and distributed
- ❌ Cannot be sold without significant modification
- ❌ Cannot be used to create a similar or competing service

Full license: https://unsplash.com/license

## Notes

- All images are reasonably sized (< 500KB) for CI performance
- Images cover different scenarios:
  - Landscape (varied colors, good for saturation/temperature)
  - Portrait (skin tones, good for color grading)
  - Low-light/noisy (good for denoise testing)
- RAW support deferred to Phase 2 per @Lantana's decision to focus on core parity first
- If RAW files are needed sooner, can be downloaded from:
  - Canon: https://www.canon-europe.com/support/sample-images/
  - Nikon: https://www.nikonusa.com/en/learn-and-explore/a/products-and-innovation/sample-images.page
  - DPReview: https://www.dpreview.com/sample-galleries

## Status

✅ **Phase 1 JPEG dataset complete**  
⏳ RAW dataset pending Phase 2

---

**Last Updated:** 2026-04-01  
**Maintainer:** Cassia 🦐  
**Approved By:** @Paolo (2026-04-01)
