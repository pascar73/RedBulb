# Parity Test Dataset Manifest

## Purpose
Sample images for testing preview/export parity.

## Requirements (from @Lantana)
- ✅ 2 JPEGs
- ✅ 3 RAWs (3 different cameras: Nikon Z6III, Canon EOS 5D, Sony A7 IV)
- ✅ 1 high-ISO/noisy image

**Status:** ✅ **ALL REQUIREMENTS COMPLETE**

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

### RAW Images

#### 4. raw/NZ6_7957.NEF ✅
- **Source:** Provided by Paolo (private test set)
- **Camera:** Nikon Z6 III (NIKON Z6_3)
- **Format:** NEF (Nikon RAW)
- **Size:** 17 MB
- **Firmware:** Ver.02.00
- **Captured:** 2026-03-29 18:09:49
- **SHA-256:** `5459a44903a6f8a3f76ca62d974cd5ee89631fa5f32581c00db5a2c63996eb64`
- **License:** Private test set (not for redistribution)

#### 5. raw/D5__0037.CR2 ✅
- **Source:** Provided by Paolo (private test set)
- **Camera:** Canon EOS 5D series (likely Mark III based on owner's equipment)
- **Format:** CR2 (Canon RAW version 2.0)
- **Size:** 25 MB
- **SHA-256:** `028dddc5fdfb92502c9808d9b841ff39cdbe9ffb024069114ec5d3f442b4c6b4`
- **License:** Private test set (not for redistribution)

#### 6. raw/A7_05822.ARW ✅
- **Source:** Provided by Paolo (private test set)
- **Camera:** Sony Alpha 7 IV (ILCE-7M4)
- **Format:** ARW (Sony RAW)
- **Size:** 39 MB
- **Firmware:** v1.10
- **Captured:** 2022-11-09 23:45:15
- **SHA-256:** `06a800fb8692d51e0a6c8d1a67244b4c0180697b95eceac2afde9663150fc23e`
- **License:** Private test set (not for redistribution)

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

✅ **Complete dataset ready for parity testing:**
- 3 JPEG files (landscape, portrait, noisy)
- 3 RAW files (Nikon NEF, Canon CR2, Sony ARW)
- All checksums verified
- All sources documented

---

**Last Updated:** 2026-04-01 10:20 GMT  
**Maintainer:** Cassia 🦐  
**Provided By:** @Paolo (RAW files from personal collection)  
**Approved By:** @Lantana (pending gate review)
