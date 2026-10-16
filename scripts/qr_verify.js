#!/usr/bin/env node
'use strict';

/**
 * qr_verify.js — verification harness and CLI for lib/qr.js.
 *
 * Usage:
 *   node scripts/qr_verify.js --svg "some text" > /tmp/test.svg
 *   node scripts/qr_verify.js --svg "text" --ecc H --scale 10
 *   node scripts/qr_verify.js --ascii "text"        # eyeball it in a terminal
 *   node scripts/qr_verify.js --page [out.html]     # build the decode test page
 *
 * The real proof of correctness is the generated HTML page: it draws the module
 * matrices this encoder produces onto canvases and decodes the pixels with
 * jsQR (a test-only dependency loaded from a CDN — never shipped in lib/qr.js).
 * Open it in a browser and read window.__qrResults / the rendered table.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const qr = require('../lib/qr');

// ---------------------------------------------------------------------------
// Test corpus
// ---------------------------------------------------------------------------

const LONG_URL =
  'https://coralautospa.com/join?ref=inperson&lang=es&utm_source=flyer&utm_medium=print&' +
  'utm_campaign=autumn-2026-launch&promo=FIRSTWASH20&loc=miami-beach&tech=sandin&v=2';

const TEST_STRINGS = [
  { name: 'signup URL', text: 'https://coralautospa.com/join' },
  { name: 'URL with query', text: 'https://coralautospa.com/join?ref=inperson&lang=es' },
  { name: 'short text', text: 'HELLO' },
  { name: '200-char URL', text: LONG_URL.slice(0, 200).padEnd(200, 'x') },
  { name: 'UTF-8 accents', text: 'Coral Auto Spa — Únete hoy' },
];

const ECC_LEVELS = ['M', 'H'];

/**
 * A case per version/ECC combination, each sized to land exactly on that
 * version. Decoding all 160 is what proves the capacity and ECC block tables,
 * not just the handful of realistic payloads above.
 */
function buildSweepCases() {
  const cases = [];
  for (const ecc of ['L', 'M', 'Q', 'H']) {
    for (let version = 1; version <= 40; version++) {
      const capacity = PUBLISHED_BYTE_CAPACITY[ecc][version - 1];
      // Pseudo-random but deterministic payload, so each symbol is distinct and
      // exercises a wide spread of byte values.
      let text = '';
      let seed = version * 31 + ecc.charCodeAt(0);
      for (let i = 0; i < capacity; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        text += String.fromCharCode(33 + (seed % 94)); // printable ASCII
      }
      const result = qr.encode(text, { ecc });
      if (result.version !== version) {
        throw new Error(`sweep: ${ecc} capacity ${capacity} landed on v${result.version}`);
      }
      cases.push({
        name: `sweep v${version} / ${ecc}`,
        text,
        ecc,
        version: result.version,
        mask: result.mask,
        size: result.size,
        rows: result.modules.map((row) => row.map((m) => (m ? '1' : '0')).join('')),
      });
    }
  }
  return cases;
}

/** Build the full matrix of test cases with their encoded module grids. */
function buildCases() {
  const cases = [];
  for (const s of TEST_STRINGS) {
    for (const ecc of ECC_LEVELS) {
      const result = qr.encode(s.text, { ecc });
      cases.push({
        name: `${s.name} / ECC ${ecc}`,
        text: s.text,
        ecc,
        version: result.version,
        mask: result.mask,
        size: result.size,
        // Pack rows as '0'/'1' strings to keep the generated page small.
        rows: result.modules.map((row) => row.map((m) => (m ? '1' : '0')).join('')),
      });
    }
  }
  return cases;
}


// ---------------------------------------------------------------------------
// Table self-validation
// ---------------------------------------------------------------------------

/**
 * The ECC block tables are the easiest thing in a QR implementation to get
 * subtly wrong, and a single wrong entry produces symbols that no scanner can
 * read. Cross-check every version/level against the published byte-mode
 * character-capacity table from ISO/IEC 18004 (table 7): capacity is derived
 * from our own tables, so a typo in either shows up as a mismatch.
 */
const PUBLISHED_BYTE_CAPACITY = {
  L: [17, 32, 53, 78, 106, 134, 154, 192, 230, 271, 321, 367, 425, 458, 520, 586, 644, 718,
      792, 858, 929, 1003, 1091, 1171, 1273, 1367, 1465, 1528, 1628, 1732, 1840, 1952, 2068,
      2188, 2303, 2431, 2563, 2699, 2809, 2953],
  M: [14, 26, 42, 62, 84, 106, 122, 152, 180, 213, 251, 287, 331, 362, 412, 450, 504, 560,
      624, 666, 711, 779, 857, 911, 997, 1059, 1125, 1190, 1264, 1370, 1452, 1538, 1628,
      1722, 1809, 1911, 1989, 2099, 2213, 2331],
  Q: [11, 20, 32, 46, 60, 74, 86, 108, 130, 151, 177, 203, 241, 258, 292, 322, 364, 394,
      442, 482, 509, 565, 611, 661, 715, 751, 805, 868, 908, 982, 1030, 1112, 1168, 1228,
      1283, 1351, 1423, 1499, 1579, 1663],
  H: [7, 14, 24, 34, 44, 58, 64, 84, 98, 119, 137, 155, 177, 194, 220, 250, 280, 310, 338,
      382, 403, 439, 461, 511, 535, 593, 625, 658, 698, 742, 790, 842, 898, 958, 983, 1051,
      1093, 1139, 1219, 1273],
};

/**
 * Probe the encoder's own version selection to recover the byte capacity it
 * believes each version/level has, then compare with the published value.
 */
function validateTables() {
  const problems = [];
  for (const ecc of ['L', 'M', 'Q', 'H']) {
    const published = PUBLISHED_BYTE_CAPACITY[ecc];
    for (let version = 1; version <= 40; version++) {
      const want = published[version - 1];
      // `want` bytes must fit in this version; `want + 1` must not (except
      // where the next version uses a wider character-count field, which can
      // make the boundary land one version later — handled by comparing the
      // version the encoder picks).
      const atCapacity = qr.encode('a'.repeat(want), { ecc }).version;
      if (atCapacity > version) {
        problems.push(
          `${ecc} v${version}: published capacity ${want} bytes but encoder needed v${atCapacity}`
        );
      }
      if (want < published[39]) {
        const over = qr.encode('a'.repeat(want + 1), { ecc }).version;
        if (over <= version && atCapacity === version) {
          problems.push(
            `${ecc} v${version}: encoder fits ${want + 1} bytes, more than published ${want}`
          );
        }
      }
    }
  }

  // Alignment pattern geometry: count, first/last centre, even spacing.
  for (let version = 2; version <= 40; version++) {
    const size = version * 4 + 17;
    const positions = qr.__alignmentPositions(version);
    const expectedCount = Math.floor(version / 7) + 2;
    if (positions.length !== expectedCount) {
      problems.push(`v${version}: ${positions.length} alignment centres, want ${expectedCount}`);
    }
    if (positions[0] !== 6 || positions[positions.length - 1] !== size - 7) {
      problems.push(`v${version}: alignment centres ${positions.join(',')} out of range`);
    }
    for (let i = 2; i < positions.length; i++) {
      if ((positions[i] - positions[i - 1]) % 2 !== 0) {
        problems.push(`v${version}: odd alignment spacing ${positions.join(',')}`);
      }
    }
  }

  return problems;
}

// ---------------------------------------------------------------------------
// HTML decode page
// ---------------------------------------------------------------------------

function buildPage(cases) {
  const data = JSON.stringify(cases);
  // Embed lib/qr.js itself so the page can re-encode in the browser. This lets
  // it cross-check against an independent reference encoder at a matched mask,
  // which validates the codeword stream, Reed-Solomon ECC and interleaving
  // directly — a far sharper test than decoding alone.
  const libSource = fs.readFileSync(path.join(__dirname, '..', 'lib', 'qr.js'), 'utf8');
  return `<!doctype html>
<meta charset="utf-8">
<title>QR decode verification</title>
<style>
  body { font: 13px/1.5 ui-monospace, Menlo, monospace; margin: 24px; }
  table { border-collapse: collapse; margin-bottom: 24px; }
  th, td { border: 1px solid #ccc; padding: 4px 8px; text-align: left; vertical-align: top; }
  .pass { color: #0a7a2f; font-weight: bold; }
  .fail { color: #c00; font-weight: bold; }
  .text { max-width: 420px; word-break: break-all; }
  canvas { image-rendering: pixelated; margin: 2px; border: 1px solid #eee; }
</style>
<h1>QR decode verification</h1>
<p id="status">loading decoder…</p>
<div id="out"></div>
<div id="gallery"></div>
<script src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.5.2/qrcode.min.js"></script>
<script>
// --- lib/qr.js, loaded verbatim with a minimal Buffer shim -----------------
window.Buffer = { from: function (str) { return new TextEncoder().encode(str); } };
var module = { exports: {} };
${libSource}
window.qr = module.exports;
</script>
<script>
var CASES = ${data};
var SCALE = 6;      // px per module when rasterising
var MARGIN = 4;     // quiet zone in modules — decoders need it

// Draw one module grid onto a fresh canvas and return the canvas.
function render(rows) {
  var size = rows.length;
  var dim = (size + MARGIN * 2) * SCALE;
  var canvas = document.createElement('canvas');
  canvas.width = dim;
  canvas.height = dim;
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, dim, dim);
  ctx.fillStyle = '#000';
  for (var y = 0; y < size; y++) {
    for (var x = 0; x < size; x++) {
      if (rows[y][x] === '1') {
        ctx.fillRect((x + MARGIN) * SCALE, (y + MARGIN) * SCALE, SCALE, SCALE);
      }
    }
  }
  return canvas;
}

function run() {
  if (typeof jsQR === 'undefined') {
    document.getElementById('status').textContent =
      'FAILED TO LOAD jsQR from the CDN — results below are not valid.';
    window.__qrResults = { error: 'jsQR did not load' };
    return;
  }

  var results = [];
  var gallery = document.getElementById('gallery');

  for (var i = 0; i < CASES.length; i++) {
    var c = CASES[i];
    var canvas = render(c.rows);
    var ctx = canvas.getContext('2d');
    var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var decoded = null, err = null;
    try {
      var r = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
      decoded = r ? r.data : null;
    } catch (e) {
      err = String(e);
    }
    results.push({
      name: c.name,
      ecc: c.ecc,
      version: c.version,
      mask: c.mask,
      size: c.size,
      inputLength: c.text.length,
      pass: decoded === c.text,
      decoded: decoded,
      error: err,
      input: c.text
    });
    gallery.appendChild(canvas);
  }

  var passed = results.filter(function (r) { return r.pass; }).length;

  // --- Cross-check against an independent encoder, at a matched mask -------
  // qrcode-generator picks masks by its own penalty implementation, so its
  // chosen mask often differs from ours. We read the mask out of its format
  // information, re-encode with ours pinned to that same mask, and require a
  // bit-for-bit identical matrix. That isolates mask *selection* (a quality
  // choice, every mask being legal) from everything that affects decodability.
  var cross = { identical: 0, mismatched: [], skipped: 0 };
  /* eslint-disable no-redeclare */
  if (typeof qrcode === 'function' && window.qr) {
    for (var ci = 0; ci < CASES.length; ci++) {
      var cc = CASES[ci];
      try {
        var ref = qrcode(cc.version, cc.ecc);
        // qrcode-generator's byte mode writes raw UTF-16 code units, so hand it
        // our UTF-8 bytes as a latin1 string to compare like for like.
        var u8 = new TextEncoder().encode(cc.text);
        var latin1 = '';
        for (var bi = 0; bi < u8.length; bi++) latin1 += String.fromCharCode(u8[bi]);
        ref.addData(latin1, 'Byte');
        ref.make();
        var n = ref.getModuleCount();
        // Recover the reference's mask from the top-left format copy.
        var fmt = 0;
        var pos = [];
        for (var i = 0; i <= 5; i++) pos.push([8, i]);
        pos.push([8, 7], [8, 8], [7, 8]);
        for (var i = 9; i < 15; i++) pos.push([14 - i, 8]);
        for (var i = 0; i < 15; i++) {
          if (ref.isDark(pos[i][1], pos[i][0])) fmt |= (1 << i);
        }
        var refMask = ((fmt ^ 0x5412) >>> 10) & 7;

        var mine = window.qr.encode(cc.text, { ecc: cc.ecc, __forceMask: refMask });
        var diff = 0;
        for (var y = 0; y < n; y++) {
          for (var x = 0; x < n; x++) {
            if (ref.isDark(y, x) !== mine.modules[y][x]) diff++;
          }
        }
        if (diff === 0) cross.identical++;
        else cross.mismatched.push(cc.name + ' (mask ' + refMask + ', ' + diff + ' modules)');
      } catch (e) {
        cross.skipped++;
      }
    }
  } else {
    cross.skipped = CASES.length;
  }

  window.__qrResults = {
    total: results.length, passed: passed, results: results, crossCheck: cross,
  };

  document.getElementById('status').innerHTML =
    '<span class="' + (passed === results.length ? 'pass' : 'fail') + '">' +
    passed + ' / ' + results.length + ' decoded exactly by jsQR</span><br>' +
    '<span class="' + (cross.mismatched.length === 0 ? 'pass' : 'fail') + '">' +
    cross.identical + ' / ' + results.length +
    ' bit-for-bit identical to the reference encoder at a matched mask' +
    (cross.skipped ? ' (' + cross.skipped + ' skipped)' : '') + '</span>';

  var html = '<table><tr><th>case</th><th>ver</th><th>ecc</th><th>mask</th>' +
             '<th>modules</th><th>result</th><th>decoded</th></tr>';
  for (var j = 0; j < results.length; j++) {
    var r = results[j];
    html += '<tr><td>' + r.name + '</td><td>' + r.version + '</td><td>' + r.ecc +
            '</td><td>' + r.mask + '</td><td>' + r.size + '×' + r.size + '</td>' +
            '<td class="' + (r.pass ? 'pass">PASS' : 'fail">FAIL') + '</td>' +
            '<td class="text">' +
            (r.decoded === null ? '(no decode) ' + (r.error || '') :
              String(r.decoded).replace(/[<&]/g, function (ch) {
                return ch === '<' ? '&lt;' : '&amp;';
              })) +
            '</td></tr>';
  }
  document.getElementById('out').innerHTML = html + '</table>';
}

window.addEventListener('load', run);
</script>
`;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    mode: 'page', text: null, ecc: 'M', scale: 8, margin: 4, out: null, sweep: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--svg' || a === '--ascii') {
      opts.mode = a.slice(2);
      opts.text = argv[++i];
    } else if (a === '--page') {
      opts.mode = 'page';
      if (argv[i + 1] && !argv[i + 1].startsWith('--')) opts.out = argv[++i];
    } else if (a === '--ecc') {
      opts.ecc = argv[++i];
    } else if (a === '--scale') {
      opts.scale = Number(argv[++i]);
    } else if (a === '--margin') {
      opts.margin = Number(argv[++i]);
    } else if (a === '--sweep') {
      opts.sweep = true;
    } else if (a === '--tables') {
      opts.mode = 'tables';
    } else if (a === '--help' || a === '-h') {
      opts.mode = 'help';
    }
  }
  return opts;
}

function ascii(text, opts) {
  const { size, modules } = qr.encode(text, opts);
  const pad = '  '.repeat(size + 4);
  const lines = [pad, pad];
  for (let y = 0; y < size; y++) {
    lines.push(
      '    ' + modules[y].map((m) => (m ? '██' : '  ')).join('') + '    '
    );
  }
  lines.push(pad, pad);
  return lines.join('\n');
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.mode === 'help') {
    process.stdout.write(
      'node scripts/qr_verify.js --svg "text" [--ecc L|M|Q|H] [--scale N] [--margin N]\n' +
        'node scripts/qr_verify.js --ascii "text" [--ecc L|M|Q|H]\n' +
        'node scripts/qr_verify.js --page [out.html]\n' +
        'node scripts/qr_verify.js --page [out.html] --sweep   # all 160 version/ECC combos\n' +
        'node scripts/qr_verify.js --tables\n'
    );
    return;
  }

  if (opts.mode === 'tables') {
    const problems = validateTables();
    if (problems.length === 0) {
      process.stdout.write(
        'Capacity tables: OK — all 160 version/ECC combinations match the published\n' +
          'byte-mode capacity table, and alignment pattern geometry is consistent.\n'
      );
    } else {
      process.stdout.write('Capacity table problems:\n');
      for (const p of problems) process.stdout.write('  ' + p + '\n');
      process.exitCode = 1;
    }
    return;
  }

  if (opts.mode === 'svg' || opts.mode === 'ascii') {
    if (opts.text === undefined || opts.text === null) {
      process.stderr.write('error: no text given\n');
      process.exitCode = 1;
      return;
    }
    const o = { ecc: opts.ecc, scale: opts.scale, margin: opts.margin };
    process.stdout.write(
      opts.mode === 'svg' ? qr.toSvg(opts.text, o) + '\n' : ascii(opts.text, o) + '\n'
    );
    return;
  }

  // Default: build the decode verification page.
  const cases = opts.sweep ? buildCases().concat(buildSweepCases()) : buildCases();
  const out =
    opts.out || path.join(os.tmpdir(), 'coralauto-qr-verify.html');
  fs.writeFileSync(out, buildPage(cases), 'utf8');

  process.stderr.write('Encoded test cases (version / ECC / mask chosen):\n');
  for (const c of cases.slice(0, 10)) {
    process.stderr.write(
      `  ${c.name.padEnd(28)} v${String(c.version).padStart(2)}  ` +
        `mask ${c.mask}  ${c.size}x${c.size}  ${Buffer.byteLength(c.text)} bytes\n`
    );
  }
  process.stderr.write(`\nDecode test page written to:\n  ${out}\n`);
  process.stderr.write('Open it in a browser; read the table or window.__qrResults.\n');
  process.stdout.write(out + '\n');
}

if (require.main === module) main();

module.exports = { buildCases, buildSweepCases, buildPage, validateTables, TEST_STRINGS, ECC_LEVELS };
