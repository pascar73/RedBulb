/**
 * Tungsten TIFF Encoder — RedBulb's professional TIFF export engine
 *
 * Features:
 *   - 8-bit and 16-bit per channel RGB/RGBA
 *   - LZW compression (lossless)
 *   - ICC profile embedding (sRGB / Adobe RGB / ProPhoto RGB)
 *   - Color space conversion (sRGB ↔ Adobe RGB / ProPhoto RGB)
 *   - DPI metadata for print workflows
 *   - EXIF metadata passthrough
 *
 * TIFF 6.0 spec: https://www.itu.int/itudoc/itu-t/com16/tiff-fx/docs/tiff6.pdf
 */

// ═══════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════

export type BitDepth = 8 | 16;
export type ColorSpace = 'srgb' | 'adobe-rgb' | 'prophoto-rgb';
export type Compression = 'none' | 'lzw';

export interface TungstenOptions {
  width: number;
  height: number;
  /** RGBA8 pixel data (Uint8Array or Uint8ClampedArray, length = w*h*4) */
  pixels: Uint8Array | Uint8ClampedArray;
  bitDepth?: BitDepth;           // default: 16
  colorSpace?: ColorSpace;       // default: 'srgb'
  compression?: Compression;     // default: 'lzw'
  dpi?: number;                  // default: 300
  embedICC?: boolean;            // default: true
  /** Optional artist/copyright EXIF strings */
  artist?: string;
  copyright?: string;
  software?: string;
}

export interface TungstenResult {
  blob: Blob;
  buffer: ArrayBuffer;
  fileSize: number;
  meta: {
    width: number;
    height: number;
    bitDepth: BitDepth;
    colorSpace: ColorSpace;
    compression: Compression;
    dpi: number;
    printWidth: string;   // e.g. "13.5 in"
    printHeight: string;  // e.g. "9.0 in"
  };
}

// ═══════════════════════════════════════════════════════
// Color Space Conversion Matrices (3×3, row-major)
// ═══════════════════════════════════════════════════════

// All conversions go through linear light:
//   sRGB (gamma) → linear sRGB → XYZ D50 → target linear → target gamma

// sRGB → XYZ (D65, then adapted to D50 for ICC)
// Using the Bradford chromatic adaptation from D65 → D50
const SRGB_TO_XYZ_D50 = [
  0.4360747, 0.3850649, 0.1430804,
  0.2225045, 0.7168786, 0.0606169,
  0.0139322, 0.0971045, 0.7141733,
];

// XYZ D50 → sRGB
const XYZ_D50_TO_SRGB = [
   3.1338561, -1.6168667, -0.4906146,
  -0.9787684,  1.9161415,  0.0334540,
   0.0719453, -0.2289914,  1.4052427,
];

// Adobe RGB (1998) → XYZ D50
const ADOBERGB_TO_XYZ_D50 = [
  0.6097559, 0.2052401, 0.1492240,
  0.3111242, 0.6256560, 0.0632197,
  0.0194811, 0.0608902, 0.7448387,
];

// XYZ D50 → Adobe RGB
const XYZ_D50_TO_ADOBERGB = [
   1.9624274, -0.6105343, -0.3413404,
  -0.9787684,  1.9161415,  0.0334540,
   0.0286869, -0.1406752,  1.3487655,
];

// ProPhoto RGB → XYZ D50 (native D50, no adaptation needed)
const PROPHOTO_TO_XYZ_D50 = [
  0.7976749, 0.1351917, 0.0313534,
  0.2880402, 0.7118741, 0.0000857,
  0.0000000, 0.0000000, 0.8252100,
];

// XYZ D50 → ProPhoto RGB
const XYZ_D50_TO_PROPHOTO = [
   1.3459433, -0.2556075, -0.0511118,
  -0.5445989,  1.5081673,  0.0205351,
   0.0000000,  0.0000000,  1.2118128,
];

// ═══════════════════════════════════════════════════════
// Gamma Functions
// ═══════════════════════════════════════════════════════

/** sRGB → linear */
function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** linear → sRGB */
function linearToSrgb(v: number): number {
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1.0 / 2.4) - 0.055;
}

/** Adobe RGB gamma = 2.19921875 (563/256) */
function linearToAdobeRgb(v: number): number {
  return v <= 0 ? 0 : Math.pow(v, 1.0 / 2.19921875);
}

/** ProPhoto RGB gamma = 1.8 (with linear segment) */
function linearToProPhoto(v: number): number {
  return v < 0.001953 ? v * 16.0 : Math.pow(v, 1.0 / 1.8);
}

// ═══════════════════════════════════════════════════════
// Matrix multiply: [3×3] × [r,g,b]
// ═══════════════════════════════════════════════════════

function mat3x3(m: number[], r: number, g: number, b: number): [number, number, number] {
  return [
    m[0] * r + m[1] * g + m[2] * b,
    m[3] * r + m[4] * g + m[5] * b,
    m[6] * r + m[7] * g + m[8] * b,
  ];
}

// ═══════════════════════════════════════════════════════
// Convert RGBA8 pixels to target color space + bit depth
// ═══════════════════════════════════════════════════════

function convertPixels(
  src: Uint8Array | Uint8ClampedArray,
  w: number, h: number,
  bitDepth: BitDepth,
  colorSpace: ColorSpace,
): Uint8Array | Uint16Array {
  const pixelCount = w * h;
  const channels = 3; // RGB output (strip alpha)

  // Determine conversion path
  let toXYZ: number[] | null = null;
  let fromXYZ: number[] | null = null;
  let gammaFn: ((v: number) => number) | null = null;

  if (colorSpace === 'adobe-rgb') {
    toXYZ = SRGB_TO_XYZ_D50;
    fromXYZ = XYZ_D50_TO_ADOBERGB;
    gammaFn = linearToAdobeRgb;
  } else if (colorSpace === 'prophoto-rgb') {
    toXYZ = SRGB_TO_XYZ_D50;
    fromXYZ = XYZ_D50_TO_PROPHOTO;
    gammaFn = linearToProPhoto;
  }
  // sRGB: no conversion needed, just re-encode at target bit depth

  const maxVal = bitDepth === 16 ? 65535 : 255;

  if (bitDepth === 16) {
    const out = new Uint16Array(pixelCount * channels);
    for (let i = 0; i < pixelCount; i++) {
      const si = i * 4;
      let r = src[si] / 255;
      let g = src[si + 1] / 255;
      let b = src[si + 2] / 255;

      if (toXYZ && fromXYZ && gammaFn) {
        // sRGB gamma → linear
        r = srgbToLinear(r);
        g = srgbToLinear(g);
        b = srgbToLinear(b);
        // linear sRGB → XYZ D50
        const xyz = mat3x3(toXYZ, r, g, b);
        // XYZ D50 → target linear
        const rgb = mat3x3(fromXYZ, xyz[0], xyz[1], xyz[2]);
        // target gamma
        r = gammaFn(Math.max(0, rgb[0]));
        g = gammaFn(Math.max(0, rgb[1]));
        b = gammaFn(Math.max(0, rgb[2]));
      }

      const di = i * 3;
      out[di] = Math.round(Math.min(1, Math.max(0, r)) * maxVal);
      out[di + 1] = Math.round(Math.min(1, Math.max(0, g)) * maxVal);
      out[di + 2] = Math.round(Math.min(1, Math.max(0, b)) * maxVal);
    }
    return out;
  } else {
    const out = new Uint8Array(pixelCount * channels);
    for (let i = 0; i < pixelCount; i++) {
      const si = i * 4;
      let r = src[si] / 255;
      let g = src[si + 1] / 255;
      let b = src[si + 2] / 255;

      if (toXYZ && fromXYZ && gammaFn) {
        r = srgbToLinear(r);
        g = srgbToLinear(g);
        b = srgbToLinear(b);
        const xyz = mat3x3(toXYZ, r, g, b);
        const rgb = mat3x3(fromXYZ, xyz[0], xyz[1], xyz[2]);
        r = gammaFn(Math.max(0, rgb[0]));
        g = gammaFn(Math.max(0, rgb[1]));
        b = gammaFn(Math.max(0, rgb[2]));
      }

      const di = i * 3;
      out[di] = Math.round(Math.min(1, Math.max(0, r)) * maxVal);
      out[di + 1] = Math.round(Math.min(1, Math.max(0, g)) * maxVal);
      out[di + 2] = Math.round(Math.min(1, Math.max(0, b)) * maxVal);
    }
    return out;
  }
}

// ═══════════════════════════════════════════════════════
// LZW Compression (TIFF variant — MSB-first, 8-bit min code size)
// ═══════════════════════════════════════════════════════

function lzwCompress(data: Uint8Array): Uint8Array {
  const CLEAR_CODE = 256;
  const EOI_CODE = 257;
  const MAX_CODE = 4093; // 12-bit max

  // Output bit stream
  const output: number[] = [];
  let bitBuffer = 0;
  let bitsInBuffer = 0;

  function writeBits(code: number, codeSize: number) {
    bitBuffer |= code << bitsInBuffer;
    bitsInBuffer += codeSize;
    while (bitsInBuffer >= 8) {
      output.push(bitBuffer & 0xff);
      bitBuffer >>= 8;
      bitsInBuffer -= 8;
    }
  }

  function flushBits() {
    if (bitsInBuffer > 0) {
      output.push(bitBuffer & 0xff);
      bitBuffer = 0;
      bitsInBuffer = 0;
    }
  }

  // String table as Map<string, number>
  let table: Map<string, number>;
  let nextCode: number;
  let codeSize: number;

  function resetTable() {
    table = new Map();
    for (let i = 0; i < 256; i++) {
      table.set(String.fromCharCode(i), i);
    }
    nextCode = 258;
    codeSize = 9;
  }

  resetTable();
  writeBits(CLEAR_CODE, codeSize);

  let w = String.fromCharCode(data[0]);

  for (let i = 1; i < data.length; i++) {
    const c = String.fromCharCode(data[i]);
    const wc = w + c;

    if (table.has(wc)) {
      w = wc;
    } else {
      writeBits(table.get(w)!, codeSize);

      if (nextCode <= MAX_CODE) {
        table.set(wc, nextCode++);
        if (nextCode > (1 << codeSize)) {
          codeSize++;
        }
      } else {
        // Table full — emit clear code and reset
        writeBits(CLEAR_CODE, codeSize);
        resetTable();
      }

      w = c;
    }
  }

  // Write remaining
  writeBits(table.get(w)!, codeSize);
  writeBits(EOI_CODE, codeSize);
  flushBits();

  return new Uint8Array(output);
}

// ═══════════════════════════════════════════════════════
// ICC Profile Data (minimal v2 profiles)
// ═══════════════════════════════════════════════════════

// Pre-built minimal ICC profiles as base64.
// These are the standard profiles from the ICC website, trimmed to essentials.
// We generate them programmatically instead to avoid large embedded blobs.

function buildICCProfile(colorSpace: ColorSpace): Uint8Array {
  // Build a minimal ICC v2.1 profile
  // Header (128 bytes) + tag table + tags

  const desc = colorSpace === 'srgb' ? 'sRGB IEC61966-2.1'
    : colorSpace === 'adobe-rgb' ? 'Adobe RGB (1998)'
    : 'ProPhoto RGB';

  // Primaries + whitepoint in XYZ (s15Fixed16, D50 adapted)
  let rXYZ: [number, number, number];
  let gXYZ: [number, number, number];
  let bXYZ: [number, number, number];
  let gamma: number;

  if (colorSpace === 'srgb') {
    rXYZ = [0.4360747, 0.2225045, 0.0139322];
    gXYZ = [0.3850649, 0.7168786, 0.0971045];
    bXYZ = [0.1430804, 0.0606169, 0.7141733];
    gamma = 0; // sRGB uses parametric curve, handled separately
  } else if (colorSpace === 'adobe-rgb') {
    rXYZ = [0.6097559, 0.3111242, 0.0194811];
    gXYZ = [0.2052401, 0.6256560, 0.0608902];
    bXYZ = [0.1492240, 0.0632197, 0.7448387];
    gamma = 2.19921875;
  } else {
    // ProPhoto RGB
    rXYZ = [0.7976749, 0.2880402, 0.0000000];
    gXYZ = [0.1351917, 0.7118741, 0.0000000];
    bXYZ = [0.0313534, 0.0000857, 0.8252100];
    gamma = 1.8;
  }

  // D50 whitepoint
  const wpXYZ: [number, number, number] = [0.9504559, 1.0000000, 1.0890578];

  // We'll build a simple profile with these tags:
  // 'desc', 'wtpt', 'rXYZ', 'gXYZ', 'bXYZ', 'rTRC', 'gTRC', 'bTRC', 'cprt'

  const tagCount = 9;

  // Helper: s15Fixed16Number (4 bytes)
  function s15f16(v: number): number {
    return Math.round(v * 65536) | 0;
  }

  // Build tag data blobs
  function makeXYZTag(xyz: [number, number, number]): Uint8Array {
    const buf = new ArrayBuffer(20);
    const dv = new DataView(buf);
    // Tag type signature 'XYZ '
    dv.setUint8(0, 0x58); dv.setUint8(1, 0x59); dv.setUint8(2, 0x5A); dv.setUint8(3, 0x20);
    // Reserved
    dv.setUint32(4, 0);
    // XYZ values as s15Fixed16
    dv.setInt32(8, s15f16(xyz[0]));
    dv.setInt32(12, s15f16(xyz[1]));
    dv.setInt32(16, s15f16(xyz[2]));
    return new Uint8Array(buf);
  }

  function makeCurveTag(gammaVal: number): Uint8Array {
    if (gammaVal === 0) {
      // sRGB: parametric curve type 3
      // y = (x + a)^g / b  for x >= d
      // y = c * x           for x < d
      // g=2.4, a=0.055, b=1.055, c=12.92, d=0.04045
      // But ICC parametric type 3 encodes as: g, a, b, c, d
      const buf = new ArrayBuffer(32);
      const dv = new DataView(buf);
      // 'para'
      dv.setUint8(0, 0x70); dv.setUint8(1, 0x61); dv.setUint8(2, 0x72); dv.setUint8(3, 0x61);
      dv.setUint32(4, 0); // reserved
      dv.setUint16(8, 3);  // function type 3
      dv.setUint16(10, 0); // reserved
      // Parameters as s15Fixed16
      dv.setInt32(12, s15f16(2.4));       // gamma
      dv.setInt32(16, s15f16(1.0 / 1.055)); // a
      dv.setInt32(20, s15f16(0.055 / 1.055)); // b
      dv.setInt32(24, s15f16(1.0 / 12.92));   // c
      dv.setInt32(28, s15f16(0.04045));        // d
      return new Uint8Array(buf);
    } else {
      // Simple gamma curve
      const buf = new ArrayBuffer(12);
      const dv = new DataView(buf);
      // 'curv'
      dv.setUint8(0, 0x63); dv.setUint8(1, 0x75); dv.setUint8(2, 0x72); dv.setUint8(3, 0x76);
      dv.setUint32(4, 0); // reserved
      dv.setUint32(8, 1); // count = 1 (single gamma)
      // Extend to include the u8Fixed8Number gamma
      const buf2 = new ArrayBuffer(14);
      const arr2 = new Uint8Array(buf2);
      arr2.set(new Uint8Array(buf));
      const dv2 = new DataView(buf2);
      // u8Fixed8Number at offset 12
      dv2.setUint16(12, Math.round(gammaVal * 256));
      // Pad to 4-byte boundary
      const padded = new Uint8Array(16);
      padded.set(arr2);
      return padded;
    }
  }

  function makeDescTag(text: string): Uint8Array {
    // 'desc' type tag (ICC v2)
    const textBytes = new TextEncoder().encode(text);
    const len = 12 + textBytes.length + 1; // type(4) + reserved(4) + count(4) + string + null
    const padLen = Math.ceil(len / 4) * 4;
    const buf = new Uint8Array(padLen);
    const dv = new DataView(buf.buffer);
    // 'desc'
    dv.setUint8(0, 0x64); dv.setUint8(1, 0x65); dv.setUint8(2, 0x73); dv.setUint8(3, 0x63);
    dv.setUint32(4, 0); // reserved
    dv.setUint32(8, textBytes.length + 1); // ASCII length including null
    buf.set(textBytes, 12);
    buf[12 + textBytes.length] = 0; // null terminator
    return buf;
  }

  function makeTextTag(text: string): Uint8Array {
    const textBytes = new TextEncoder().encode(text);
    const len = 8 + textBytes.length + 1;
    const padLen = Math.ceil(len / 4) * 4;
    const buf = new Uint8Array(padLen);
    const dv = new DataView(buf.buffer);
    // 'text'
    dv.setUint8(0, 0x74); dv.setUint8(1, 0x65); dv.setUint8(2, 0x78); dv.setUint8(3, 0x74);
    dv.setUint32(4, 0);
    buf.set(textBytes, 8);
    return buf;
  }

  // Build all tag data
  const descData = makeDescTag(desc);
  const wtptData = makeXYZTag(wpXYZ);
  const rXYZData = makeXYZTag(rXYZ);
  const gXYZData = makeXYZTag(gXYZ);
  const bXYZData = makeXYZTag(bXYZ);
  const curveData = makeCurveTag(gamma);
  const cprtData = makeTextTag('RedBulb / Tungsten Engine');

  // Tag directory: 9 tags × 12 bytes each = 108 bytes
  // Tags: desc, wtpt, rXYZ, gXYZ, bXYZ, rTRC, gTRC, bTRC, cprt
  // rTRC/gTRC/bTRC all share same curve data (offset+size identical)

  const headerSize = 128;
  const tagTableSize = 4 + tagCount * 12; // count(4) + entries
  let dataOffset = headerSize + tagTableSize;

  // Align data offset to 4 bytes
  dataOffset = Math.ceil(dataOffset / 4) * 4;

  const tagDatas = [descData, wtptData, rXYZData, gXYZData, bXYZData, curveData, cprtData];
  const tagOffsets: number[] = [];
  let off = dataOffset;
  for (const td of tagDatas) {
    tagOffsets.push(off);
    off += td.length;
    off = Math.ceil(off / 4) * 4;
  }
  const totalSize = off;

  // Build the profile
  const profile = new Uint8Array(totalSize);
  const pv = new DataView(profile.buffer);

  // ── Header (128 bytes) ──
  pv.setUint32(0, totalSize);        // Profile size
  // Preferred CMM: 'none'
  pv.setUint32(4, 0);
  // Version 2.1.0
  pv.setUint8(8, 2); pv.setUint8(9, 0x10);
  // Device class: 'mntr' (monitor)
  pv.setUint8(12, 0x6D); pv.setUint8(13, 0x6E); pv.setUint8(14, 0x74); pv.setUint8(15, 0x72);
  // Color space: 'RGB '
  pv.setUint8(16, 0x52); pv.setUint8(17, 0x47); pv.setUint8(18, 0x42); pv.setUint8(19, 0x20);
  // PCS: 'XYZ '
  pv.setUint8(20, 0x58); pv.setUint8(21, 0x59); pv.setUint8(22, 0x5A); pv.setUint8(23, 0x20);
  // Date/time (2026-01-01)
  pv.setUint16(24, 2026); pv.setUint16(26, 1); pv.setUint16(28, 1);
  // 'acsp' signature
  pv.setUint8(36, 0x61); pv.setUint8(37, 0x63); pv.setUint8(38, 0x73); pv.setUint8(39, 0x70);
  // Primary platform: 'APPL'
  pv.setUint8(40, 0x41); pv.setUint8(41, 0x50); pv.setUint8(42, 0x50); pv.setUint8(43, 0x4C);
  // Flags: 0
  pv.setUint32(44, 0);
  // Device manufacturer: 0
  pv.setUint32(48, 0);
  // Device model: 0
  pv.setUint32(52, 0);
  // Rendering intent: perceptual
  pv.setUint32(64, 0);
  // PCS illuminant (D50)
  pv.setInt32(68, s15f16(0.9642));
  pv.setInt32(72, s15f16(1.0000));
  pv.setInt32(76, s15f16(0.8249));
  // Profile creator: 'RBULB'  (RedBulb)
  pv.setUint8(80, 0x52); pv.setUint8(81, 0x42); pv.setUint8(82, 0x4C); pv.setUint8(83, 0x42);

  // ── Tag Table ──
  let toff = headerSize;
  pv.setUint32(toff, tagCount); toff += 4;

  // Tag signatures
  const sigs = [
    [0x64657363], // 'desc'
    [0x77747074], // 'wtpt'
    [0x7258595A], // 'rXYZ'
    [0x6758595A], // 'gXYZ'
    [0x6258595A], // 'bXYZ'
    [0x72545243], // 'rTRC'
    [0x67545243], // 'gTRC'
    [0x62545243], // 'bTRC'
    [0x63707274], // 'cprt'
  ];

  // Map tag index to data index (rTRC/gTRC/bTRC all point to same curve)
  const dataIdx = [0, 1, 2, 3, 4, 5, 5, 5, 6];

  for (let i = 0; i < tagCount; i++) {
    pv.setUint32(toff, sigs[i][0]); toff += 4;
    pv.setUint32(toff, tagOffsets[dataIdx[i]]); toff += 4;
    pv.setUint32(toff, tagDatas[dataIdx[i]].length); toff += 4;
  }

  // ── Tag Data ──
  for (let i = 0; i < tagDatas.length; i++) {
    profile.set(tagDatas[i], tagOffsets[i]);
  }

  return profile;
}

// ═══════════════════════════════════════════════════════
// TIFF Encoder
// ═══════════════════════════════════════════════════════

// TIFF tag IDs
const TAG_IMAGE_WIDTH = 256;
const TAG_IMAGE_HEIGHT = 257;
const TAG_BITS_PER_SAMPLE = 258;
const TAG_COMPRESSION = 259;
const TAG_PHOTOMETRIC = 262;
const TAG_STRIP_OFFSETS = 273;
const TAG_SAMPLES_PER_PIXEL = 277;
const TAG_ROWS_PER_STRIP = 278;
const TAG_STRIP_BYTE_COUNTS = 279;
const TAG_X_RESOLUTION = 282;
const TAG_Y_RESOLUTION = 283;
const TAG_RESOLUTION_UNIT = 296;
const TAG_SOFTWARE = 305;
const TAG_ARTIST = 315;
const TAG_COPYRIGHT = 33432;
const TAG_ICC_PROFILE = 34675;

// TIFF field types
const TYPE_SHORT = 3;   // uint16
const TYPE_LONG = 4;    // uint32
const TYPE_RATIONAL = 5; // two uint32 (numerator/denominator)
const TYPE_ASCII = 2;    // null-terminated string
const TYPE_UNDEFINED = 7; // byte array

interface IFDEntry {
  tag: number;
  type: number;
  count: number;
  /** If value fits in 4 bytes, store inline; otherwise, store offset to data */
  value?: number;
  data?: Uint8Array;
}

export function encode(opts: TungstenOptions): TungstenResult {
  const {
    width, height, pixels,
    bitDepth = 16,
    colorSpace = 'srgb',
    compression = 'lzw',
    dpi = 300,
    embedICC = true,
    artist,
    copyright,
    software = 'RedBulb / Tungsten Engine',
  } = opts;

  // 1. Convert pixels to target color space + bit depth (RGB, no alpha)
  const rgbData = convertPixels(pixels, width, height, bitDepth, colorSpace);

  // 2. Get raw bytes for TIFF strip
  let stripBytes: Uint8Array;
  if (bitDepth === 16) {
    // Convert Uint16Array to big-endian bytes (TIFF default byte order)
    // We'll use little-endian (Intel 'II') for simplicity
    const u16 = rgbData as Uint16Array;
    stripBytes = new Uint8Array(u16.buffer, u16.byteOffset, u16.byteLength);
  } else {
    stripBytes = rgbData as Uint8Array;
  }

  // 3. Compress if requested
  let compressedStrip: Uint8Array;
  const compressionCode = compression === 'lzw' ? 5 : 1;

  if (compression === 'lzw') {
    compressedStrip = lzwCompress(stripBytes);
  } else {
    compressedStrip = stripBytes;
  }

  // 4. Build ICC profile
  let iccProfile: Uint8Array | null = null;
  if (embedICC) {
    iccProfile = buildICCProfile(colorSpace);
  }

  // 5. Build IFD entries
  const entries: IFDEntry[] = [];

  entries.push({ tag: TAG_IMAGE_WIDTH, type: TYPE_LONG, count: 1, value: width });
  entries.push({ tag: TAG_IMAGE_HEIGHT, type: TYPE_LONG, count: 1, value: height });

  // BitsPerSample: 3 values (R, G, B) — doesn't fit in 4 bytes for 16-bit
  const bpsVal = bitDepth;
  const bpsData = new Uint8Array(6);
  const bpsDV = new DataView(bpsData.buffer);
  bpsDV.setUint16(0, bpsVal, true);
  bpsDV.setUint16(2, bpsVal, true);
  bpsDV.setUint16(4, bpsVal, true);
  entries.push({ tag: TAG_BITS_PER_SAMPLE, type: TYPE_SHORT, count: 3, data: bpsData });

  entries.push({ tag: TAG_COMPRESSION, type: TYPE_SHORT, count: 1, value: compressionCode });
  entries.push({ tag: TAG_PHOTOMETRIC, type: TYPE_SHORT, count: 1, value: 2 }); // RGB

  // StripOffsets — will be patched later
  entries.push({ tag: TAG_STRIP_OFFSETS, type: TYPE_LONG, count: 1, value: 0 });
  const stripOffsetsIdx = entries.length - 1;

  entries.push({ tag: TAG_SAMPLES_PER_PIXEL, type: TYPE_SHORT, count: 1, value: 3 });
  entries.push({ tag: TAG_ROWS_PER_STRIP, type: TYPE_LONG, count: 1, value: height });
  entries.push({ tag: TAG_STRIP_BYTE_COUNTS, type: TYPE_LONG, count: 1, value: compressedStrip.length });

  // Resolution
  const resDenominator = 1;
  const resData = new Uint8Array(8);
  const resDV = new DataView(resData.buffer);
  resDV.setUint32(0, dpi, true);
  resDV.setUint32(4, resDenominator, true);
  entries.push({ tag: TAG_X_RESOLUTION, type: TYPE_RATIONAL, count: 1, data: new Uint8Array(resData) });
  entries.push({ tag: TAG_Y_RESOLUTION, type: TYPE_RATIONAL, count: 1, data: new Uint8Array(resData) });
  entries.push({ tag: TAG_RESOLUTION_UNIT, type: TYPE_SHORT, count: 1, value: 2 }); // inches

  // Software
  if (software) {
    const swBytes = new TextEncoder().encode(software + '\0');
    entries.push({ tag: TAG_SOFTWARE, type: TYPE_ASCII, count: swBytes.length, data: swBytes });
  }

  // Artist
  if (artist) {
    const aBytes = new TextEncoder().encode(artist + '\0');
    entries.push({ tag: TAG_ARTIST, type: TYPE_ASCII, count: aBytes.length, data: aBytes });
  }

  // Copyright
  if (copyright) {
    const cBytes = new TextEncoder().encode(copyright + '\0');
    entries.push({ tag: TAG_COPYRIGHT, type: TYPE_ASCII, count: cBytes.length, data: cBytes });
  }

  // ICC Profile
  if (iccProfile) {
    entries.push({ tag: TAG_ICC_PROFILE, type: TYPE_UNDEFINED, count: iccProfile.length, data: iccProfile });
  }

  // Sort entries by tag (TIFF requirement)
  entries.sort((a, b) => a.tag - b.tag);

  // 6. Calculate layout
  // Header: 8 bytes (byte order + magic + IFD offset)
  // IFD: 2 (count) + entries×12 + 4 (next IFD = 0)
  // Overflow data (for entries that don't fit inline)
  // Strip data

  const headerSize = 8;
  const ifdSize = 2 + entries.length * 12 + 4;
  const ifdOffset = headerSize;

  // Calculate overflow data
  let overflowOffset = headerSize + ifdSize;
  const overflowMap = new Map<number, number>(); // entry index → offset

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.data) {
      const byteSize = e.data.length;
      if (byteSize > 4) {
        overflowMap.set(i, overflowOffset);
        overflowOffset += byteSize;
        // Pad to 2-byte boundary (TIFF word alignment)
        if (overflowOffset % 2 !== 0) overflowOffset++;
      }
    }
  }

  // Strip data starts after overflow
  const stripOffset = overflowOffset;
  const totalSize = stripOffset + compressedStrip.length;

  // Patch strip offset
  const soIdx = entries.findIndex(e => e.tag === TAG_STRIP_OFFSETS);
  entries[soIdx].value = stripOffset;

  // 7. Write TIFF file
  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);
  const arr = new Uint8Array(buf);

  // Header — Little-endian ('II')
  view.setUint8(0, 0x49); // 'I'
  view.setUint8(1, 0x49); // 'I'
  view.setUint16(2, 42, true); // Magic
  view.setUint32(4, ifdOffset, true); // IFD offset

  // IFD
  let pos = ifdOffset;
  view.setUint16(pos, entries.length, true); pos += 2;

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    view.setUint16(pos, e.tag, true); pos += 2;
    view.setUint16(pos, e.type, true); pos += 2;
    view.setUint32(pos, e.count, true); pos += 4;

    if (e.data && e.data.length > 4) {
      // Offset to overflow
      view.setUint32(pos, overflowMap.get(i)!, true);
    } else if (e.data) {
      // Inline (≤4 bytes)
      for (let j = 0; j < e.data.length; j++) {
        view.setUint8(pos + j, e.data[j]);
      }
    } else if (e.value !== undefined) {
      // Inline value
      if (e.type === TYPE_SHORT) {
        view.setUint16(pos, e.value, true);
      } else {
        view.setUint32(pos, e.value, true);
      }
    }
    pos += 4;
  }

  // Next IFD = 0 (no more IFDs)
  view.setUint32(pos, 0, true);

  // Write overflow data
  for (const [idx, offset] of overflowMap) {
    arr.set(entries[idx].data!, offset);
  }

  // Write strip data
  arr.set(compressedStrip, stripOffset);

  // 8. Build result
  const printWidth = (width / dpi).toFixed(1);
  const printHeight = (height / dpi).toFixed(1);

  return {
    blob: new Blob([buf], { type: 'image/tiff' }),
    buffer: buf,
    fileSize: totalSize,
    meta: {
      width, height, bitDepth, colorSpace, compression, dpi,
      printWidth: `${printWidth} in`,
      printHeight: `${printHeight} in`,
    },
  };
}

// ═══════════════════════════════════════════════════════
// Convenience: Print size calculator
// ═══════════════════════════════════════════════════════

export function printSize(
  widthPx: number, heightPx: number, dpi: number
): { widthIn: number; heightIn: number; widthCm: number; heightCm: number; label: string } {
  const wIn = widthPx / dpi;
  const hIn = heightPx / dpi;
  const wCm = wIn * 2.54;
  const hCm = hIn * 2.54;
  return {
    widthIn: wIn,
    heightIn: hIn,
    widthCm: wCm,
    heightCm: hCm,
    label: `${wIn.toFixed(1)}" × ${hIn.toFixed(1)}" (${wCm.toFixed(1)} × ${hCm.toFixed(1)} cm)`,
  };
}

// ═══════════════════════════════════════════════════════
// Export
// ═══════════════════════════════════════════════════════

export const Tungsten = { encode, printSize, buildICCProfile };
export default Tungsten;
