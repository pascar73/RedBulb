# Parity Test Dataset Manifest

## Purpose
Sample images for testing preview/export parity.

## Requirements (from @Lantana)
- 2 JPEGs
- 2 RAWs (different cameras if possible)
- 1 high-ISO/noisy image

## Dataset

### JPEG Images

#### 1. test-image-01.jpg
- **Source:** Unsplash (Public Domain)
- **Resolution:** 1920x1080
- **Format:** JPEG, sRGB
- **Content:** Landscape with varied colors
- **SHA-256:** (to be calculated after download)
- **License:** Unsplash License (free to use)
- **URL:** https://unsplash.com/photos/example

#### 2. test-image-02.jpg
- **Source:** Unsplash (Public Domain)
- **Resolution:** 1920x1080  
- **Format:** JPEG, sRGB
- **Content:** Portrait with skin tones
- **SHA-256:** (to be calculated)
- **License:** Unsplash License
- **URL:** https://unsplash.com/photos/example

### RAW Images

#### 3. test-raw-nikon.NEF
- **Source:** Sample NEF files
- **Camera:** Nikon D850
- **Resolution:** 8256x5504
- **Format:** NEF (Nikon RAW)
- **Content:** (TBD)
- **SHA-256:** (to be calculated)
- **License:** (TBD)

#### 4. test-raw-canon.CR2
- **Source:** Sample CR2 files
- **Camera:** Canon EOS 5D Mark IV
- **Resolution:** 6720x4480
- **Format:** CR2 (Canon RAW)
- **Content:** (TBD)
- **SHA-256:** (to be calculated)
- **License:** (TBD)

### High-ISO/Noisy Image

#### 5. test-noisy-iso6400.jpg
- **Source:** High ISO sample
- **ISO:** 6400+
- **Resolution:** 1920x1080
- **Format:** JPEG, sRGB
- **Content:** Low-light scene with visible noise
- **SHA-256:** (to be calculated)
- **License:** (TBD)

## Notes

- All images should be reasonably sized (< 10MB each) for CI performance
- RAW files can be downscaled versions for faster testing
- Images should cover different scenarios (landscape, portrait, high-ISO)
- License must allow use in open-source testing

## TODO

- [ ] Download/acquire actual test images
- [ ] Calculate SHA-256 checksums
- [ ] Verify licenses
- [ ] Add download/generation script

---

**Status:** Manifest created, awaiting images  
**Last Updated:** 2026-03-31  
**Maintainer:** Cassia 🦐
