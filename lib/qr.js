'use strict';

/**
 * qr.js — self-contained QR Code generator (ISO/IEC 18004).
 *
 * Zero dependencies. Byte mode (UTF-8) only, versions 1..40, all four ECC
 * levels, all 8 data masks with spec penalty scoring, format information and
 * version information.
 *
 *   const { toSvg, encode } = require('./lib/qr');
 *   toSvg('https://coralautospa.com/join', { ecc: 'M' });
 *
 * Public API:
 *   encode(text, opts) -> { size, modules }   // modules[y][x] === true means dark
 *   toSvg(text, opts)  -> String              // a complete <svg> element
 *
 * opts: { ecc: 'L'|'M'|'Q'|'H' (default 'M'),
 *         margin: modules of quiet zone (default 4),
 *         scale:  px per module    (default 8),
 *         dark:   dark colour      (default '#000'),
 *         light:  light colour     (default '#fff') }
 */

// ---------------------------------------------------------------------------
// Capacity tables
// ---------------------------------------------------------------------------

const MIN_VERSION = 1;
const MAX_VERSION = 40;

// ECC indicator bits by eccIndex (L, M, Q, H).
const ECC_FORMAT_BITS = [1, 0, 3, 2];

const ECC_NAMES = ['L', 'M', 'Q', 'H'];

// eccIndex by level name, for option parsing.
const ECC_LEVELS = { L: 0, M: 1, Q: 2, H: 3 };

// ISO/IEC 18004 tables 13-22: error-correction codewords per block,
// indexed [eccIndex][version - 1]. Validated against the published byte-mode
// character-capacity table by scripts/qr_verify.js --tables.
const ECC_CODEWORDS_PER_BLOCK = [
  /* L */ [7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28,
           28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  /* M */ [10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26,
           26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  /* Q */ [13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30,
           28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  /* H */ [17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28,
           30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];

// Number of error-correction blocks, indexed [eccIndex][version - 1].
const NUM_ERROR_CORRECTION_BLOCKS = [
  /* L */ [1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8,
           8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  /* M */ [1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16,
           17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  /* Q */ [1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20,
           23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  /* H */ [1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25,
           25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

// Penalty weights N1..N4 from the spec's mask evaluation.
const PENALTY_N1 = 3;
const PENALTY_N2 = 3;
const PENALTY_N3 = 40;
const PENALTY_N4 = 10;

/**
 * Total number of data modules for a version, before subtracting ECC — i.e.
 * every module that is not part of a function pattern. Derived rather than
 * tabulated so the tables above stay small:
 *   (16v + 128)v + 64   all modules minus the three finders+separators+format
 *   minus alignment patterns and the timing modules they overlap
 *   minus 36 for the two version-information blocks (version 7 and up).
 */
function rawDataModules(version) {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

/** Codewords available in total (data + error correction) for a version. */
function totalCodewords(version) {
  return Math.floor(rawDataModules(version) / 8);
}

/** Codewords available for payload data at a given version and ECC level. */
function dataCodewords(version, eccIndex) {
  return (
    totalCodewords(version) -
    ECC_CODEWORDS_PER_BLOCK[eccIndex][version - 1] *
      NUM_ERROR_CORRECTION_BLOCKS[eccIndex][version - 1]
  );
}

/** Bit width of the character-count field for byte mode at this version. */
function charCountBits(version) {
  // Byte mode: 8 bits for versions 1-9, 16 bits for 10 and up.
  return version <= 9 ? 8 : 16;
}

// ---------------------------------------------------------------------------
// GF(256) arithmetic and Reed-Solomon
// ---------------------------------------------------------------------------

// QR uses GF(2^8) with the primitive polynomial x^8 + x^4 + x^3 + x^2 + 1
// (0x11D) and generator element alpha = 2.
const GF_EXP = new Uint8Array(256);
const GF_LOG = new Uint8Array(256);
(function buildGaloisTables() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d; // reduce modulo the primitive polynomial
  }
  GF_EXP[255] = GF_EXP[0];
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[(GF_LOG[a] + GF_LOG[b]) % 255];
}

/**
 * Reed-Solomon generator polynomial of the given degree:
 *   g(x) = (x - a^0)(x - a^1)...(x - a^(degree-1))
 * Returned as coefficients in descending order with the leading 1 dropped,
 * which is the form the remainder loop below wants.
 */
function rsGeneratorPoly(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    // Multiply poly by (x - a^i); in GF(2^k) subtraction is XOR.
    const next = new Array(poly.length + 1).fill(0);
    const root = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], root);
    }
    poly = next;
  }
  return poly.slice(1); // drop the monic leading coefficient
}

/** Compute the `degree` error-correction codewords for one data block. */
function rsRemainder(data, degree) {
  const gen = rsGeneratorPoly(degree);
  const result = new Array(degree).fill(0);
  for (const byte of data) {
    // Synthetic division: the factor is the term shifted out of the register.
    const factor = byte ^ result.shift();
    result.push(0);
    for (let i = 0; i < degree; i++) {
      result[i] ^= gfMul(gen[i], factor);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Bit buffer
// ---------------------------------------------------------------------------

class BitBuffer {
  constructor() {
    this.bits = [];
  }
  /** Append the low `len` bits of `value`, most significant first. */
  push(value, len) {
    for (let i = len - 1; i >= 0; i--) {
      this.bits.push((value >>> i) & 1);
    }
  }
  get length() {
    return this.bits.length;
  }
}

// ---------------------------------------------------------------------------
// Segment / codeword assembly
// ---------------------------------------------------------------------------

function utf8Bytes(text) {
  return Array.from(Buffer.from(String(text), 'utf8'));
}

/** Smallest version that fits `numBytes` bytes in byte mode at this ECC. */
function chooseVersion(numBytes, eccIndex) {
  for (let version = MIN_VERSION; version <= MAX_VERSION; version++) {
    const capacityBits = dataCodewords(version, eccIndex) * 8;
    const neededBits = 4 + charCountBits(version) + numBytes * 8;
    if (neededBits <= capacityBits) return version;
  }
  const maxBytes = Math.floor(
    (dataCodewords(MAX_VERSION, eccIndex) * 8 - 4 - charCountBits(MAX_VERSION)) / 8
  );
  throw new RangeError(
    `Data too long: ${numBytes} bytes does not fit in version ${MAX_VERSION} at ECC level ` +
      `${ECC_NAMES[eccIndex]} (max ${maxBytes} bytes)`
  );
}

/** Build the padded data codeword sequence for one message. */
function buildDataCodewords(bytes, version, eccIndex) {
  const capacity = dataCodewords(version, eccIndex);
  const bb = new BitBuffer();
  bb.push(0b0100, 4); // byte-mode indicator
  bb.push(bytes.length, charCountBits(version));
  for (const b of bytes) bb.push(b, 8);

  // Terminator: up to four 0 bits, then zero-fill to the next byte boundary.
  const capacityBits = capacity * 8;
  bb.push(0, Math.min(4, capacityBits - bb.length));
  bb.push(0, (8 - (bb.length % 8)) % 8);

  const codewords = [];
  for (let i = 0; i < bb.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bb.bits[i + j];
    codewords.push(byte);
  }
  // Pad bytes alternate 0xEC / 0x11 as mandated by the spec.
  for (let i = 0; codewords.length < capacity; i++) {
    codewords.push(i % 2 === 0 ? 0xec : 0x11);
  }
  return codewords;
}

/**
 * Split data into blocks, append each block's ECC, then interleave.
 *
 * Blocks come in (at most) two sizes: `numLong` blocks hold one more data
 * codeword than the `numShort` ones. Interleaving reads the i-th data codeword
 * of every block in turn (short blocks simply have nothing to contribute on
 * the final data pass), then the i-th ECC codeword of every block — all ECC
 * blocks are the same length, so that pass is uniform.
 */
function interleaveBlocks(data, version, eccIndex) {
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[eccIndex][version - 1];
  const eccPerBlock = ECC_CODEWORDS_PER_BLOCK[eccIndex][version - 1];
  const shortBlockLen = Math.floor(data.length / numBlocks);
  const numLong = data.length % numBlocks; // these get shortBlockLen + 1

  const dataBlocks = [];
  const eccBlocks = [];
  for (let i = 0, offset = 0; i < numBlocks; i++) {
    const len = shortBlockLen + (i >= numBlocks - numLong ? 1 : 0);
    const block = data.slice(offset, offset + len);
    offset += len;
    dataBlocks.push(block);
    eccBlocks.push(rsRemainder(block, eccPerBlock));
  }

  const result = [];
  const longestData = shortBlockLen + (numLong > 0 ? 1 : 0);
  for (let i = 0; i < longestData; i++) {
    for (let b = 0; b < numBlocks; b++) {
      if (i < dataBlocks[b].length) result.push(dataBlocks[b][i]);
    }
  }
  for (let i = 0; i < eccPerBlock; i++) {
    for (let b = 0; b < numBlocks; b++) result.push(eccBlocks[b][i]);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Matrix construction
// ---------------------------------------------------------------------------

/** Centre coordinates of the alignment patterns for a version (empty for v1). */
function alignmentPatternPositions(version) {
  if (version === 1) return [];
  const numAlign = Math.floor(version / 7) + 2;
  const size = version * 4 + 17;
  // Spacing is even, chosen so the first centre is at 6 and the last at size-7.
  // Spacing must be even and <= 26; version 32 is the one case where the
  // generic formula disagrees with the spec's table, so it is special-cased.
  const step =
    version === 32 ? 26 : Math.ceil((size - 13) / (2 * numAlign - 2)) * 2;
  const positions = [6];
  for (let pos = size - 7; positions.length < numAlign; pos -= step) {
    positions.splice(1, 0, pos);
  }
  return positions;
}

class Matrix {
  constructor(version) {
    this.version = version;
    this.size = version * 4 + 17;
    this.modules = Array.from({ length: this.size }, () =>
      new Array(this.size).fill(false)
    );
    // Function modules (finders, timing, alignment, format/version areas, dark
    // module) are never masked and never receive data.
    this.isFunction = Array.from({ length: this.size }, () =>
      new Array(this.size).fill(false)
    );
  }

  set(x, y, dark, isFunction) {
    this.modules[y][x] = dark;
    if (isFunction) this.isFunction[y][x] = true;
  }

  inBounds(x, y) {
    return x >= 0 && x < this.size && y >= 0 && y < this.size;
  }

  drawFunctionPatterns(eccIndex) {
    const size = this.size;

    // Timing patterns: alternating modules along row 6 and column 6.
    for (let i = 0; i < size; i++) {
      this.set(6, i, i % 2 === 0, true);
      this.set(i, 6, i % 2 === 0, true);
    }

    // Three finder patterns plus their separators (the 8x8 reserved corners).
    this.drawFinder(3, 3);
    this.drawFinder(size - 4, 3);
    this.drawFinder(3, size - 4);

    // Alignment patterns, skipping the three that would collide with finders.
    const positions = alignmentPatternPositions(this.version);
    for (let i = 0; i < positions.length; i++) {
      for (let j = 0; j < positions.length; j++) {
        const first = 0;
        const last = positions.length - 1;
        if (
          (i === first && j === first) ||
          (i === first && j === last) ||
          (i === last && j === first)
        ) {
          continue;
        }
        this.drawAlignment(positions[i], positions[j]);
      }
    }

    // Reserve the format area (drawn for real once a mask is chosen) and the
    // version area, and set the always-dark module.
    this.drawFormatBits(eccIndex, 0);
    this.drawVersionBits();
  }

  /** 7x7 finder pattern centred at (cx, cy), with its 8x8 separator ring. */
  drawFinder(cx, cy) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (!this.inBounds(x, y)) continue;
        const ring = Math.max(Math.abs(dx), Math.abs(dy));
        // Chebyshev rings: 0..1 dark core, 2 light, 3 dark, 4 light separator.
        this.set(x, y, ring !== 2 && ring !== 4, true);
      }
    }
  }

  /** 5x5 alignment pattern centred at (cx, cy). */
  drawAlignment(cx, cy) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const ring = Math.max(Math.abs(dx), Math.abs(dy));
        this.set(cx + dx, cy + dy, ring !== 1, true);
      }
    }
  }

  /**
   * 15-bit format information: 2 bits of ECC level + 3 bits of mask, protected
   * by a (15,5) BCH code using generator 0x537, then XORed with 0x5412 so the
   * all-zero case is not an all-light run. Written twice for redundancy.
   */
  drawFormatBits(eccIndex, mask) {
    const data = (ECC_FORMAT_BITS[eccIndex] << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) {
      rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    }
    const bits = ((data << 10) | rem) ^ 0x5412;
    const size = this.size;
    const bit = (i) => ((bits >>> i) & 1) === 1;

    // First copy: around the top-left finder (least significant bit first).
    for (let i = 0; i <= 5; i++) this.set(8, i, bit(i), true);
    this.set(8, 7, bit(6), true);
    this.set(8, 8, bit(7), true);
    this.set(7, 8, bit(8), true);
    for (let i = 9; i < 15; i++) this.set(14 - i, 8, bit(i), true);

    // Second copy: split between the bottom-left and top-right finders.
    for (let i = 0; i < 8; i++) this.set(size - 1 - i, 8, bit(i), true);
    for (let i = 8; i < 15; i++) this.set(8, size - 15 + i, bit(i), true);

    this.set(8, size - 8, true, true); // the mandatory dark module
  }

  /**
   * 18-bit version information (versions 7+ only): 6 version bits protected by
   * an (18,6) BCH code with generator 0x1F25. No final XOR mask. Written in two
   * 3x6 blocks, beside the bottom-left and above the top-right finder.
   */
  drawVersionBits() {
    if (this.version < 7) return;
    let rem = this.version;
    for (let i = 0; i < 12; i++) {
      rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    }
    const bits = (this.version << 12) | rem;
    const size = this.size;
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.set(a, b, dark, true); // top-right block
      this.set(b, a, dark, true); // bottom-left block
    }
  }

  /**
   * Place the interleaved codewords in the two-module-wide vertical columns
   * that snake upward then downward from the bottom-right corner, skipping the
   * vertical timing pattern at column 6 and every function module.
   */
  drawCodewords(codewords) {
    let bitIndex = 0;
    const totalBits = codewords.length * 8;
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5; // column 6 is timing; shift the pair left
      for (let vert = 0; vert < this.size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? this.size - 1 - vert : vert;
          if (!this.isFunction[y][x] && bitIndex < totalBits) {
            const byte = codewords[bitIndex >>> 3];
            this.modules[y][x] = ((byte >>> (7 - (bitIndex & 7))) & 1) === 1;
            bitIndex++;
          }
          // Remaining modules stay light, as the spec requires.
        }
      }
    }
  }

  /** XOR the given mask over all non-function modules. Self-inverse. */
  applyMask(mask) {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (this.isFunction[y][x]) continue;
        let invert;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
          case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          case 7: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          default: throw new RangeError('bad mask');
        }
        if (invert) this.modules[y][x] = !this.modules[y][x];
      }
    }
  }

  /**
   * Mask penalty score (lower is better). Four spec rules:
   *   N1  runs of 5+ same-colour modules in a row/column: 3 + (runLength - 5)
   *   N2  each 2x2 block of one colour: 3
   *   N3  each 1:1:3:1:1 finder-lookalike with 4 light modules on one side: 40
   *   N4  10 for every 5% the dark-module proportion deviates from 50%
   */
  penaltyScore() {
    const size = this.size;
    const m = this.modules;
    let score = 0;

    // --- N1 and N3, scanned horizontally then vertically ------------------
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < size; i++) {
        const at = (j) => (pass === 0 ? m[i][j] : m[j][i]);
        let runColour = at(0);
        let runLength = 1;
        for (let j = 1; j < size; j++) {
          if (at(j) === runColour) {
            runLength++;
          } else {
            if (runLength >= 5) score += PENALTY_N1 + (runLength - 5);
            runColour = at(j);
            runLength = 1;
          }
        }
        if (runLength >= 5) score += PENALTY_N1 + (runLength - 5);

        // N3: slide an 11-module window looking for dark:light:dark*3:light:dark
        // preceded or followed by four light modules.
        for (let j = 0; j + 11 <= size; j++) {
          let window = 0;
          for (let k = 0; k < 11; k++) window = (window << 1) | (at(j + k) ? 1 : 0);
          if (window === 0b10111010000 || window === 0b00001011101) {
            score += PENALTY_N3;
          }
        }
      }
    }

    // --- N2: 2x2 single-colour blocks -------------------------------------
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const c = m[y][x];
        if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) {
          score += PENALTY_N2;
        }
      }
    }

    // --- N4: deviation of dark proportion from 50% ------------------------
    let dark = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) if (m[y][x]) dark++;
    }
    const total = size * size;
    // k = number of whole 5% steps away from 50%, computed without floats.
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    score += Math.max(k, 0) * PENALTY_N4;

    return score;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Escape a colour (or any attribute value) for safe interpolation into SVG. */
function escapeAttr(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function normalizeOptions(opts) {
  const o = opts || {};
  const ecc = String(o.ecc || 'M').toUpperCase();
  if (ECC_LEVELS[ecc] === undefined) {
    throw new RangeError(`Unknown ECC level ${JSON.stringify(o.ecc)}; use L, M, Q or H`);
  }
  const num = (value, fallback, name, min) => {
    if (value === undefined || value === null) return fallback;
    const n = Number(value);
    if (!Number.isFinite(n) || n < min) {
      throw new RangeError(`${name} must be a finite number >= ${min}`);
    }
    return n;
  };
  return {
    ecc,
    eccIndex: ECC_LEVELS[ecc],
    // Internal, test-only: pin the data mask instead of choosing by penalty.
    // Used by scripts/qr_verify.js to compare against a reference encoder at a
    // matched mask; every mask is spec-legal, so output stays scannable.
    forceMask: o.__forceMask,
    margin: num(o.margin, 4, 'margin', 0),
    scale: num(o.scale, 8, 'scale', 1),
    dark: escapeAttr(o.dark || '#000'),
    light: escapeAttr(o.light || '#fff'),
  };
}

/**
 * Encode text as a QR symbol.
 * @returns {{size: number, modules: boolean[][], version: number, ecc: string, mask: number}}
 */
function encode(text, opts) {
  const o = normalizeOptions(opts);
  const bytes = utf8Bytes(text);
  const version = chooseVersion(bytes.length, o.eccIndex);

  const data = buildDataCodewords(bytes, version, o.eccIndex);
  const codewords = interleaveBlocks(data, version, o.eccIndex);

  const matrix = new Matrix(version);
  matrix.drawFunctionPatterns(o.eccIndex);
  matrix.drawCodewords(codewords);

  // Try all eight masks and keep the lowest-penalty one.
  let bestMask = 0;
  if (o.forceMask !== undefined && o.forceMask !== null) {
    bestMask = o.forceMask;
  } else {
    let bestScore = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      matrix.applyMask(mask);
      matrix.drawFormatBits(o.eccIndex, mask);
      const score = matrix.penaltyScore();
      if (score < bestScore) {
        bestScore = score;
        bestMask = mask;
      }
      matrix.applyMask(mask); // XOR again to undo
    }
  }
  matrix.applyMask(bestMask);
  matrix.drawFormatBits(o.eccIndex, bestMask);

  return {
    size: matrix.size,
    modules: matrix.modules,
    version,
    ecc: o.ecc,
    mask: bestMask,
  };
}

/**
 * Render text as an SVG QR code. The geometry is expressed in module units via
 * the viewBox (so every rect lands on integer coordinates and the symbol stays
 * crisp at any rendered size); `scale` only sets the default width/height.
 */
function toSvg(text, opts) {
  const o = normalizeOptions(opts);
  const { size, modules } = encode(text, opts);
  const dim = size + o.margin * 2;
  const px = dim * o.scale;

  // One path with a subpath per dark module: far smaller than one rect each,
  // and still perfectly aligned to the module grid.
  const parts = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (modules[y][x]) {
        parts.push(`M${x + o.margin} ${y + o.margin}h1v1h-1z`);
      }
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" ` +
    `viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges" role="img" ` +
    `aria-label="QR code">` +
    `<rect width="${dim}" height="${dim}" fill="${o.light}"/>` +
    `<path fill="${o.dark}" d="${parts.join('')}"/>` +
    `</svg>`
  );
}

module.exports = { toSvg, encode };

// Exposed for scripts/qr_verify.js --tables; not part of the public API.
module.exports.__alignmentPositions = alignmentPatternPositions;
