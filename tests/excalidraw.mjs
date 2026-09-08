#!/usr/bin/env node
// Deterministic, offline test suite.
//
//   node tests/run-tests.mjs
//
// No network, no npm dependencies, no Docker. Tests that need real reference
// scenes read their paths from .analysis/sources.local.json (gitignored);
// without that file they skip rather than fail, so the suite runs on a clean
// checkout.
//
// The icon-store tests write into the real store under a `zz-test-` prefix and
// clean up after themselves, because the alternative - a mock filesystem -
// would stop testing the thing that actually breaks.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SKILL = join(ROOT, 'skills', 'arkitect-excalidraw');
const SCRIPTS = join(SKILL, 'scripts');
const TMP = join(HERE, 'output', 'excalidraw');
const SOURCES_FILE = join(ROOT, '.analysis', 'sources.local.json');

let pass = 0; let fail = 0; let skip = 0;
const failures = [];

function test(name, fn) {
  try {
    const r = fn();
    if (r === 'skip') { skip++; console.log(`skip  ${name}`); return; }
    pass++; console.log(`ok    ${name}`);
  } catch (e) {
    fail++; failures.push(`${name}: ${e.message}`);
    console.log(`FAIL  ${name}\n        ${e.message}`);
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg} (expected ${JSON.stringify(b)}, got ${JSON.stringify(a)})`); }

const mod = (p) => import(`file://${join(SCRIPTS, p).replace(/\\/g, '/')}`);
const node = (script, args) =>
  execFileSync(process.execPath, [join(SCRIPTS, script), ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

const core = await mod('lib/excalidraw-core.mjs');
const svgPath = await mod('lib/svg-path.mjs');
const rough = await mod('lib/rough.mjs');
const builder = await mod('build-diagram.mjs');
const validator = await mod('validate-excalidraw.mjs');
const renderer = await mod('render-excalidraw.mjs');
const analyzer = await mod('analyze-excalidraw.mjs');
const icons = await mod('make-icon.mjs');
const finder = await mod('find-icon.mjs');
const libIndex = await mod('index-libraries.mjs');

const sources = existsSync(SOURCES_FILE) ? JSON.parse(readFileSync(SOURCES_FILE, 'utf8')) : null;
const sourceList = sources ? (sources.excalidraw ?? sources.files ?? sources.scenes ?? []) : [];
// An empty list must not count as "have sources": every reference test would
// then loop over nothing and report a pass it never earned.
const haveSources = sourceList.length > 0 && sourceList.every((p) => existsSync(p));

// ------------------------------------------------------------- fixtures

// A real PNG, built here rather than committed, so transparency detection is
// tested against actual IHDR bytes.
function makePng({ alpha }) {
  const w = 4; const h = 4;
  const colorType = alpha ? 6 : 2;
  const channels = alpha ? 4 : 3;
  const raw = Buffer.alloc(h * (1 + w * channels));
  for (let y = 0; y < h; y++) {
    const off = y * (1 + w * channels);
    raw[off] = 0;
    for (let x = 0; x < w; x++) {
      const p = off + 1 + x * channels;
      raw[p] = 0x22; raw[p + 1] = 0x88; raw[p + 2] = 0xcc;
      if (alpha) raw[p + 3] = 0x80;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crcBuf]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = colorType;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

// A ring with a hole: outer square wound one way, inner square the other.
const DONUT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
  + '<path fill="#1971c2" d="M0 0 H100 V100 H0 Z M30 30 V70 H70 V30 Z"/></svg>';

const TEST_PREFIX = 'zz-test-';
function cleanTestIcons() {
  for (const name of Object.keys(icons.loadIndex())) {
    if (name.startsWith(TEST_PREFIX)) { try { icons.removeIcon(name); } catch { /* already gone */ } }
  }
}
cleanTestIcons();

// ------------------------------------------------------------- core

test('element factories produce the fields Excalidraw requires', () => {
  const r = core.rectangle({ x: 0, y: 0, width: 10, height: 10 });
  for (const k of ['id', 'type', 'x', 'y', 'width', 'height', 'angle', 'strokeColor', 'backgroundColor',
    'fillStyle', 'strokeWidth', 'strokeStyle', 'roughness', 'opacity', 'groupIds', 'seed', 'versionNonce',
    'isDeleted', 'updated', 'locked']) {
    assert(r[k] !== undefined, `rectangle is missing ${k}`);
  }
  eq(r.type, 'rectangle', 'type');
  eq(r.backgroundColor, 'transparent', 'unfilled shapes use "transparent", not "none"');
  eq(core.newId().length, 21, 'id length');
  assert(core.newId() !== core.newId(), 'ids must be unique');
});

test('index keys sort in element order past the single-digit boundary', () => {
  const keys = Array.from({ length: 4000 }, (_, i) => core.indexKey(i));
  const sorted = [...keys].sort();
  eq(keys.join(','), sorted.join(','), 'lexicographic order must match numeric order');
  eq(new Set(keys).size, keys.length, 'keys must be unique');
  // fractional-indexing format: the head says how many digits follow, so
  // Excalidraw can generate a key after the last one instead of rejecting the
  // whole set and regenerating every index.
  for (const k of [keys[0], keys[61], keys[62], keys[3905], keys[3906]]) {
    const width = k.charCodeAt(0) - 'a'.charCodeAt(0) + 1;
    assert(width >= 1 && k.length === width + 1, `"${k}" does not match its declared integer length`);
    assert([...k.slice(1)].every((c) => /[0-9A-Za-z]/.test(c)), `"${k}" has a non-base62 digit`);
  }
  eq(core.indexKey(0), 'a0', 'first key');
  eq(core.indexKey(62), 'b00', 'the first key past a single digit widens the head');
});

test('arrow points are relative and the first is the origin', () => {
  const a = core.arrow({ x: 100, y: 50, points: [[0, 0], [80, 0], [80, 40]] });
  eq(a.points[0][0], 0, 'first point x');
  eq(a.width, 80, 'width from points');
  const box = core.elementBox(a);
  eq(box.x, 100, 'absolute x');
  eq(box.width, 80, 'absolute width');
});

test('bound text records the link on both sides', () => {
  const r = core.rectangle({ x: 0, y: 0, width: 200, height: 80 });
  const t = core.bindLabel(r, 'Ingest API');
  eq(t.containerId, r.id, 'text names its container');
  assert(r.boundElements.some((b) => b.id === t.id && b.type === 'text'), 'container lists its text');
});

test('a label wraps to the usable width of a diamond, not its bounding box', () => {
  const d = core.diamond({ x: 0, y: 0, width: 200, height: 140 });
  const t = core.bindLabel(d, 'schema validation decision point');
  const widest = Math.max(...t.text.split('\n').map((l) => core.measureLine(l, t.fontSize, t.fontFamily)));
  assert(widest <= 200 * 0.5, `diamond label ${Math.round(widest)}px exceeds the 100px usable width`);
  assert(t.text.includes('\n'), 'a long diamond label has to wrap');
});

test('cloning rewrites internal references and drops external ones', () => {
  const r = core.rectangle({ x: 0, y: 0, width: 100, height: 50 });
  const t = core.bindLabel(r, 'label');
  r.boundElements.push({ id: 'not-in-this-set', type: 'arrow' });
  const copies = core.cloneElements([r, t]);
  const [cr, ct] = copies;
  assert(cr.id !== r.id && ct.id !== t.id, 'ids are fresh');
  eq(ct.containerId, cr.id, 'containerId is remapped');
  eq(cr.boundElements.length, 1, 'the dangling reference is dropped');
  eq(cr.boundElements[0].id, ct.id, 'the surviving reference points at the copy');
});

test('repairBindings makes a one-sided binding two-sided', () => {
  const a = core.rectangle({ x: 0, y: 0, width: 50, height: 50 });
  const b = core.rectangle({ x: 200, y: 0, width: 50, height: 50 });
  const arr = core.arrow({ x: 50, y: 25, points: [[0, 0], [150, 0]] });
  arr.startBinding = { elementId: a.id, focus: 0, gap: 4 };
  arr.endBinding = { elementId: b.id, focus: 0, gap: 4 };
  core.repairBindings([a, b, arr]);
  assert(a.boundElements?.some((x) => x.id === arr.id), 'source lists the arrow');
  assert(b.boundElements?.some((x) => x.id === arr.id), 'target lists the arrow');
});

test('libraries in both v1 and v2 shapes read back the same way', () => {
  const els = [core.rectangle({ x: 0, y: 0, width: 10, height: 10 })];
  const v1 = join(TMP, 'v1.excalidrawlib');
  const v2 = join(TMP, 'v2.excalidrawlib');
  writeFileSync(v1, JSON.stringify({ type: 'excalidrawlib', version: 1, library: [els, els] }));
  core.writeLibrary(v2, [{ name: 'one', elements: els }, { name: 'two', elements: els }]);
  eq(core.readLibrary(v1).length, 2, 'v1 item count');
  eq(core.readLibrary(v2).length, 2, 'v2 item count');
  eq(core.readLibrary(v2)[1].name, 'two', 'v2 items keep their names');
  eq(core.readLibrary(v1)[0].name, '', 'v1 items have no name of their own');
});

// ------------------------------------------------------------- svg tracing

test('path flattening handles absolute, relative, curve and arc commands', () => {
  const sub = svgPath.flattenPath('M10 10 h30 v30 C40 60 20 60 10 40 A10 10 0 0 1 10 10 Z');
  eq(sub.length, 1, 'one subpath');
  assert(sub[0].closed, 'Z closes it');
  assert(sub[0].points.length > 20, 'the curve and the arc are both flattened to points');
  assert(sub[0].points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)), 'no NaN coordinates');
  // h/v are relative: the corner they produce has to land at 40,10 and 40,40.
  const has = (x, y) => sub[0].points.some(([px, py]) => Math.abs(px - x) < 0.01 && Math.abs(py - y) < 0.01);
  assert(has(40, 10) && has(40, 40), 'relative h and v commands land where they should');
  // The arc ends back on the start point, which is what makes Z a no-op here.
  const last = sub[0].points[sub[0].points.length - 1];
  assert(Math.hypot(last[0] - 10, last[1] - 10) < 0.5, `arc should end at its stated endpoint, got ${last}`);
});

test('transforms compose down the group stack', () => {
  const { shapes } = svgPath.parseSvg(
    '<svg viewBox="0 0 100 100"><g transform="translate(10,10)">'
    + '<g transform="scale(2)"><rect x="0" y="0" width="5" height="5" fill="#000"/></g></g></svg>');
  eq(shapes.length, 1, 'one shape');
  const xs = shapes[0].points.map((p) => p[0]);
  eq(Math.min(...xs), 10, 'translate applied');
  eq(Math.max(...xs), 20, 'scale applied inside the translate');
});

test('a nested counter-wound ring is detected as a hole', () => {
  const { shapes } = svgPath.parseSvg(DONUT_SVG);
  eq(shapes.length, 2, 'outer and inner ring');
  eq(shapes[0].hole, false, 'the outer ring is filled');
  eq(shapes[1].hole, true, 'the inner ring is a hole');
});

test('overlapping sibling shapes are not mistaken for holes', () => {
  // Two same-wound squares that cross: under nonzero both stay filled.
  const svg = '<svg viewBox="0 0 100 100"><path fill="#000" d="M0 0 H50 V50 H0 Z M25 25 H75 V75 H25 Z"/></svg>';
  const { shapes } = svgPath.parseSvg(svg);
  eq(shapes.length, 2, 'two rings');
  assert(!shapes[0].hole && !shapes[1].hole, 'crossing rings are both filled');
});

test('even-odd fill uses nesting parity instead of winding', () => {
  const svg = '<svg viewBox="0 0 100 100"><path fill-rule="evenodd" fill="#000" '
    + 'd="M0 0 H100 V100 H0 Z M30 30 H70 V70 H30 Z"/></svg>';
  const { shapes } = svgPath.parseSvg(svg);
  eq(shapes[1].hole, true, 'the inner ring is cut out under even-odd even when wound the same way');
});

test('what the tracer cannot do is reported, not silently dropped', () => {
  const svg = '<svg viewBox="0 0 10 10"><defs><linearGradient id="g"/></defs>'
    + '<text x="0" y="5">hi</text><rect width="10" height="10" fill="url(#g)"/></svg>';
  const { skipped } = svgPath.parseSvg(svg);
  assert(skipped.includes('linearGradient'), 'gradients reported');
  assert(skipped.includes('text'), 'text reported');
});

// ------------------------------------------------------------- rough

test('the hand-drawn stroke is deterministic for a given seed', () => {
  const pts = [[0, 0], [100, 0], [100, 60]];
  eq(rough.roughPath(pts, { seed: 42 }), rough.roughPath(pts, { seed: 42 }), 'same seed, same path');
  assert(rough.roughPath(pts, { seed: 42 }) !== rough.roughPath(pts, { seed: 7 }), 'different seed, different path');
  assert(!rough.roughPath(pts, { seed: 1, roughness: 0 }).includes('C'), 'roughness 0 draws straight lines');
});

// ------------------------------------------------------------- icon store

test('an SVG traces into native elements with its holes preserved', () => {
  const r = icons.storeIcon(`${TEST_PREFIX}donut`, Buffer.from(DONUT_SVG, 'utf8'), { trace: true, size: 80 });
  eq(r.entry.kind, 'traced', 'kind');
  eq(r.traceReport.holes, 1, 'one hole detected');
  const item = core.readLibrary(join(icons.ITEM_DIR, `${TEST_PREFIX}donut.excalidrawlib`))[0];
  eq(item.elements.length, 2, 'two line elements');
  assert(item.elements.every((el) => el.type === 'line'), 'traced icons are native lines, not images');
  const box = core.bbox(item.elements);
  assert(Math.abs(Math.max(box.width, box.height) - 80) <= 2, `scaled to 80px, got ${Math.round(box.width)}`);
});

test('--outline drops every fill', () => {
  const r = icons.storeIcon(`${TEST_PREFIX}outline`, Buffer.from(DONUT_SVG, 'utf8'), { trace: true, outline: true });
  assert(r.entry.outline, 'recorded as outline');
  const item = core.readLibrary(join(icons.ITEM_DIR, `${TEST_PREFIX}outline.excalidrawlib`))[0];
  assert(item.elements.every((el) => el.backgroundColor === 'transparent'), 'no fills');
});

test('a raster logo is embedded and its transparency is read from the file', () => {
  const opaque = icons.storeIcon(`${TEST_PREFIX}opaque`, makePng({ alpha: false }));
  eq(opaque.entry.kind, 'embedded', 'kind');
  eq(opaque.entry.transparent, false, 'RGB PNG is opaque');
  const clear = icons.storeIcon(`${TEST_PREFIX}clear`, makePng({ alpha: true }));
  eq(clear.entry.transparent, true, 'RGBA PNG has alpha');
  eq(clear.entry.width, 4, 'dimensions decoded from IHDR');
});

test('tracing a raster is refused rather than producing nonsense', () => {
  let threw = null;
  try { icons.storeIcon(`${TEST_PREFIX}nope`, makePng({ alpha: true }), { trace: true }); }
  catch (e) { threw = e.message; }
  assert(threw && /SVG/i.test(threw), `expected an SVG-required error, got ${threw}`);
});

test('storing the same name twice needs --force', () => {
  let threw = null;
  try { icons.storeIcon(`${TEST_PREFIX}donut`, Buffer.from(DONUT_SVG, 'utf8'), { trace: true }); }
  catch (e) { threw = e.message; }
  assert(threw && /force/.test(threw), `expected a force hint, got ${threw}`);
  const again = icons.storeIcon(`${TEST_PREFIX}donut`, Buffer.from(DONUT_SVG, 'utf8'), { trace: true, force: true, size: 120 });
  eq(again.entry.size, 120, 'restyled size');
});

test('the house library holds every stored icon', () => {
  const items = core.readLibrary(icons.HOUSE_LIB);
  const names = new Set(Object.keys(icons.loadIndex()));
  assert(items.length >= names.size, `house library has ${items.length} items for ${names.size} icons`);
});

test('find-icon resolves an exact name and refuses a weak match', () => {
  assert(finder.resolveIcon(`${TEST_PREFIX}donut`), 'exact reference resolves');
  eq(finder.resolveIcon('a-product-that-does-not-exist-anywhere'), null, 'no weak substitution');
});

test('removing an icon takes its item and index entry with it', () => {
  icons.storeIcon(`${TEST_PREFIX}gone`, Buffer.from(DONUT_SVG, 'utf8'), { trace: true });
  icons.removeIcon(`${TEST_PREFIX}gone`);
  assert(!icons.loadIndex()[`${TEST_PREFIX}gone`], 'index entry removed');
  assert(!existsSync(join(icons.ITEM_DIR, `${TEST_PREFIX}gone.excalidrawlib`)), 'library item removed');
});

// ------------------------------------------------------------- generation

const SPEC = {
  title: 'Test architecture',
  boundaries: [{ id: 'scope', kind: 'scope', label: 'Boundary', color: 'blue' }],
  nodes: [
    { id: 'a', kind: 'box', label: 'Source', col: 0, row: 0 },
    { id: 'b', kind: 'round', label: 'Process', accent: 'green', col: 1, row: 0, parent: 'scope' },
    { id: 'c', kind: 'cylinder', label: 'Store', accent: 'blue', col: 2, row: 0, parent: 'scope', width: 150, height: 120 },
    { id: 'd', kind: 'diamond', label: 'OK?', accent: 'orange', col: 3, row: 0, width: 150, height: 110 },
    { id: 'e', kind: 'actor', label: 'Operator', col: 0, row: 1 },
    { id: 'f', kind: 'icon', icon: `${TEST_PREFIX}donut`, label: 'Traced', col: 1, row: 1 },
    { id: 'g', kind: 'icon', icon: `${TEST_PREFIX}clear`, label: 'Embedded', col: 2, row: 1 },
    { id: 'h', kind: 'note', label: 'Assumption: everything is idempotent.', col: 3, row: 1, width: 260 },
  ],
  edges: [
    { from: 'a', to: 'b', kind: 'flow', label: 'events' },
    { from: 'b', to: 'c', kind: 'flow' },
    { from: 'c', to: 'd', kind: 'async' },
    { from: 'd', to: 'e', kind: 'error', label: 'no' },
  ],
};

const built = builder.buildDiagram(SPEC);

test('a generated scene is valid Excalidraw', () => {
  const r = validator.validateScene(built.scene);
  assert(r.ok, `errors: ${r.errors.join('; ')}`);
  eq(built.scene.type, 'excalidraw', 'scene type');
  eq(new Set(built.scene.elements.map((e) => e.id)).size, built.scene.elements.length, 'unique ids');
});

test('every connector is bound at both ends', () => {
  const arrows = built.scene.elements.filter((e) => e.type === 'arrow' && !(e.groupIds ?? []).length);
  assert(arrows.length >= 4, `expected the spec's arrows, got ${arrows.length}`);
  for (const a of arrows) {
    assert(a.startBinding && a.endBinding, `arrow ${a.id} is not bound at both ends`);
  }
});

test('generated output has no overlapping nodes', () => {
  const r = validator.validateScene(built.scene);
  eq(r.info.overlaps, 0, 'overlaps');
});

test('a boundary is sized from its contents, captions included', () => {
  const scope = built.scene.elements.find((e) => e.type === 'rectangle' && e.strokeStyle === 'dashed');
  assert(scope, 'the scope rectangle exists');
  const kids = ['b', 'c'].map((id) => SPEC.nodes.find((n) => n.id === id));
  for (const kid of kids) {
    const label = built.scene.elements.find((e) => e.type === 'text' && e.text === kid.label);
    if (!label) continue;
    assert(label.x >= scope.x && label.x + label.width <= scope.x + scope.width,
      `label for ${kid.id} pokes out of its boundary`);
    assert(label.y + label.height <= scope.y + scope.height, `caption for ${kid.id} hangs below its boundary`);
  }
});

test('the learned style tokens are applied', () => {
  const shapes = built.scene.elements.filter((e) => ['rectangle', 'ellipse', 'diamond'].includes(e.type));
  assert(shapes.every((s) => s.roughness === 1), 'hand-drawn roughness');
  const strokes = new Set(built.scene.elements.map((e) => e.strokeColor));
  const allowed = new Set([...Object.values(core.PALETTE).map((p) => p.stroke), '#ffffff', '#bbb', '#1971c2']);
  for (const s of strokes) assert(allowed.has(s), `off-palette stroke ${s}`);
  const sizes = new Set(built.scene.elements.filter((e) => e.type === 'text').map((e) => e.fontSize));
  for (const s of sizes) assert(Object.values(core.FONT).includes(s), `off-scale font size ${s}`);
});

test('a legend appears once more than one connector kind is used', () => {
  assert(built.scene.elements.some((e) => e.type === 'text' && e.text === 'Legend'), 'legend title');
  const single = builder.buildDiagram({ ...SPEC, edges: [{ from: 'a', to: 'b', kind: 'flow' }] });
  assert(!single.scene.elements.some((e) => e.type === 'text' && e.text === 'Legend'),
    'a single-kind diagram needs no legend');
});

test('an embedded icon travels with the scene', () => {
  eq(Object.keys(built.scene.files).length, 1, 'one embedded file');
  const img = built.scene.elements.find((e) => e.type === 'image');
  assert(img && built.scene.files[img.fileId], 'the image element points at an embedded file');
  assert(built.scene.files[img.fileId].dataURL.startsWith('data:'), 'embedded, not linked');
});

test('a traced icon becomes native geometry, not a picture', () => {
  const lines = built.scene.elements.filter((e) => e.type === 'line' && (e.groupIds ?? []).length);
  assert(lines.length >= 2, 'the traced icon contributed line elements');
});

test('an unresolvable icon becomes an obvious placeholder, and is reported', () => {
  const r = builder.buildDiagram({
    nodes: [{ id: 'x', kind: 'icon', icon: 'no-such-product-anywhere', label: 'Mystery', col: 0, row: 0 }],
  });
  eq(r.report.missingIcons.length, 1, 'reported as missing');
  eq(r.scene.elements.filter((e) => e.type === 'image').length, 0, 'no substituted image');

  // It has to be impossible to mistake for a finished node, or an unfilled slot
  // ships. Dotted stroke, the placeholder colour, and a "?" drawn in it.
  const slot = r.scene.elements.find((e) => e.type === 'rectangle' && e.strokeStyle === 'dotted');
  assert(slot, 'a dotted slot was drawn');
  eq(slot.strokeColor, builder.PLACEHOLDER.stroke, 'placeholder stroke colour');
  assert(r.scene.elements.some((e) => e.type === 'text' && e.text === '?'), 'marked with a question mark');
  // And it still says which product belongs there.
  assert(r.scene.elements.some((e) => e.type === 'text' && e.text === 'Mystery'), 'captioned');
});

test('kind "placeholder" asks for a slot without pretending to search', () => {
  const r = builder.buildDiagram({
    nodes: [{ id: 'x', kind: 'placeholder', label: 'Vault', col: 0, row: 0 }],
  });
  eq(r.report.missingIcons.length, 1, 'listed for the report');
  assert(r.scene.elements.some((e) => e.type === 'rectangle' && e.strokeStyle === 'dotted'), 'slot drawn');
});

// ------------------------------------------------------------- bundled libraries

test('the bundled index matches the libraries on disk', () => {
  const index = libIndex.loadIndex();
  assert(index.libraries.length > 0, 'libraries are indexed');
  const onDisk = readdirSync(libIndex.BUNDLED_DIR).filter((n) => n.endsWith('.excalidrawlib')).sort();
  eq(index.libraries.map((l) => l.file).sort().join(','), onDisk.join(','),
    'index is stale - run: node index-libraries.mjs --build');
  eq(index.items.length, index.libraries.reduce((n, l) => n + l.items, 0), 'item count adds up');
  for (const l of index.libraries) {
    assert(existsSync(join(libIndex.BUNDLED_DIR, l.file)), `${l.slug} file is present`);
  }
});

test('no bundled item is given a name nobody gave it', () => {
  const index = libIndex.loadIndex();
  for (const it of index.items) {
    if (it.name === null) { eq(it.nameFrom, null, `${it.ref} has no name and claims no source`); continue; }
    assert(it.nameFrom === 'library' || it.nameFrom === 'caption',
      `${it.ref} must say where its name came from, not invent one`);
  }
  // An unnamed item must not be searchable, or a query would resolve to it by
  // its slug and draw the wrong product.
  const named = new Set(finder.catalog().filter((e) => e.provider === 'bundled').map((e) => e.ref));
  for (const it of index.items) {
    if (!it.name) assert(!named.has(it.ref), `${it.ref} is unnamed and must stay out of search`);
  }
});

test('a bundled item resolves by name and by index', () => {
  const index = libIndex.loadIndex();
  const sample = index.items.find((it) => it.name && it.elements > 0);
  assert(sample, 'the bundled set has at least one named item');

  const byRef = finder.resolveIcon(sample.ref);
  assert(byRef && byRef.elements.length === sample.elements, `${sample.ref} resolves by index`);
  eq(byRef.kind, 'bundled', 'reported as bundled');

  const byName = finder.resolveIcon(sample.name);
  assert(byName && byName.elements.length > 0, `"${sample.name}" resolves by name`);
});

test('the bundled set is preferred over a house icon of the same name', () => {
  const bundled = { provider: 'bundled', name: 'x', aliases: ['acme'] };
  const house = { provider: 'house', name: 'x', aliases: ['acme'] };
  const cached = { provider: 'some-library', name: 'x', aliases: ['acme'] };
  assert(finder.score(bundled, 'acme') > finder.score(house, 'acme'), 'bundled beats house');
  assert(finder.score(house, 'acme') > finder.score(cached, 'acme'), 'house beats the download cache');
});

test('every library with unnamed items has a contact sheet to read', () => {
  const index = libIndex.loadIndex();
  const sheets = join(libIndex.BUNDLED_DIR, 'sheets');
  for (const l of index.libraries) {
    if (!l.unnamed) continue;
    assert(existsSync(join(sheets, `${l.slug}.png`)),
      `${l.slug} has ${l.unnamed} unnamed items and no sheet - run: index-libraries.mjs --sheet ${l.slug}`);
  }
});

test('every bundled library is credited', () => {
  const index = libIndex.loadIndex();
  const attribution = readFileSync(join(libIndex.BUNDLED_DIR, 'ATTRIBUTION.md'), 'utf8');
  for (const l of index.libraries) {
    assert(l.authors.length > 0, `${l.slug} has no author recorded in authors.json`);
    assert(attribution.includes(l.slug), `${l.slug} is missing from ATTRIBUTION.md`);
  }
});

test('an item that draws its own name is not captioned twice', () => {
  const index = libIndex.loadIndex();
  // A caption-named item carries its name as text, which is exactly the case
  // that used to print the product name twice, one line under the other.
  const selfNamed = index.items.find((it) => it.nameFrom === 'caption');
  if (!selfNamed) return 'skip';
  const r = builder.buildDiagram({
    nodes: [{ id: 'x', kind: 'icon', icon: selfNamed.ref, label: selfNamed.name, col: 0, row: 0 }],
  });
  const captions = r.scene.elements.filter((e) => e.type === 'text'
    && core.normalizeName(e.text ?? '') === core.normalizeName(selfNamed.name));
  eq(captions.length, 1, `"${selfNamed.name}" appears once, not twice`);
  eq(r.report.selfCaptioned.length, 1, 'reported as self-captioned');
});

test('an existing file is backed up before it is replaced', () => {
  const out = join(TMP, 'backup-check.excalidraw');
  writeFileSync(out, JSON.stringify(core.emptyScene()));
  node('build-diagram.mjs', [writeSpec('backup.json', SPEC), '--out', out]);
  const backups = readdirSync(TMP).filter((f) => f.includes('.backup-'));
  eq(backups.length, 1, 'exactly one backup');
});

function writeSpec(name, spec) {
  const p = join(TMP, name);
  writeFileSync(p, JSON.stringify(spec));
  return p;
}

// ------------------------------------------------------------- validation

test('the validator rejects duplicate ids', () => {
  const scene = core.emptyScene();
  const a = core.rectangle({ x: 0, y: 0, width: 10, height: 10 });
  scene.elements = [a, { ...a }];
  assert(!validator.validateScene(scene).ok, 'duplicate ids must fail');
});

test('the validator rejects a one-sided binding', () => {
  const scene = core.emptyScene();
  const a = core.rectangle({ x: 0, y: 0, width: 50, height: 50 });
  const arr = core.arrow({ x: 50, y: 25, points: [[0, 0], [100, 0]] });
  arr.endBinding = { elementId: a.id, focus: 0, gap: 4 };
  scene.elements = [a, arr];
  const r = validator.validateScene(scene);
  assert(!r.ok && r.errors.some((e) => /does not list it back/.test(e)), 'one-sided binding must fail');
});

test('the validator rejects an image with no embedded file', () => {
  const scene = core.emptyScene();
  scene.elements = [core.image({ fileId: 'missing', x: 0, y: 0, width: 10, height: 10 })];
  assert(!validator.validateScene(scene).ok, 'missing file must fail');
});

test('the validator rejects out-of-order index keys', () => {
  const scene = core.emptyScene();
  scene.elements = [
    core.rectangle({ x: 0, y: 0, width: 10, height: 10, index: 'a5' }),
    core.rectangle({ x: 40, y: 0, width: 10, height: 10, index: 'a2' }),
  ];
  const r = validator.validateScene(scene);
  assert(!r.ok && r.errors.some((e) => /index keys/.test(e)), 'z-order must be increasing');
});

test('the validator accepts a library file', () => {
  const p = join(TMP, 'lib-check.excalidrawlib');
  core.writeLibrary(p, [{ name: 'x', elements: [core.rectangle({ x: 0, y: 0, width: 10, height: 10 })] }]);
  assert(validator.validateFile(p).ok, 'a well-formed library should pass');
});

// ------------------------------------------------------------- render

test('the renderer produces an SVG covering every element', () => {
  const svg = renderer.sceneToSvg(built.scene);
  assert(svg.startsWith('<?xml'), 'is an SVG document');
  assert(svg.includes('<image'), 'embedded images are drawn');
  assert(svg.includes('Test architecture'), 'the title is drawn');
  const m = /viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg);
  assert(m, 'has a viewBox');
  const box = core.bbox(built.scene.elements);
  assert(Number(m[3]) >= box.width && Number(m[4]) >= box.height, 'the viewBox covers the scene');
});

test('the render is stable across runs', () => {
  eq(renderer.sceneToSvg(built.scene), renderer.sceneToSvg(built.scene), 'same scene, same SVG');
});

// ------------------------------------------------------------- analysis

test('analysis emits structure and style but never element text', () => {
  const a = analyzer.analyzeScene(built.scene);
  const raw = JSON.stringify(a);
  for (const el of built.scene.elements) {
    if (el.type !== 'text' || !el.text || el.text.length < 5) continue;
    assert(!raw.includes(el.text), `analysis leaked the label "${el.text}"`);
  }
  assert(!raw.includes('data:image'), 'analysis leaked an image payload');
  assert(a.counts.elements > 0 && a.style.strokeColor && a.geometry.canvas, 'analysis is populated');
});

test('every convention says what it rests on, and claims no evidence it lacks', () => {
  const rec = JSON.parse(readFileSync(join(SKILL, 'references', 'source-analysis.json'), 'utf8'));
  assert(rec.conventions.length > 0, 'conventions listed');
  for (const c of rec.conventions) {
    if (c.confidence === 'default') {
      assert(c.basis, `${c.id} must say what it rests on`);
      eq(c.evidence.n, 0, `${c.id} must not claim evidence`);
    } else {
      assert(c.evidence.n > 0 && c.evidence.total >= c.evidence.n,
        `${c.id} claims confidence ${c.confidence} but its counts do not support it`);
      assert(c.observed !== null && c.observed !== undefined, `${c.id} must name what was observed`);
    }
  }
  eq(rec.corpus.files, rec.sources.length, 'one digest per source file');
});

// The guide must not describe defaults as learned style, and must not keep
// calling itself a default once a corpus exists. The record decides which.
test('the style guide matches the state of the corpus', () => {
  const rec = JSON.parse(readFileSync(join(SKILL, 'references', 'source-analysis.json'), 'utf8'));
  const guide = readFileSync(join(SKILL, 'references', 'style-guide.md'), 'utf8');
  const banner = /defaults, not observations/i.test(guide);
  if (rec.corpus.files === 0) {
    assert(banner, 'with no corpus the guide must say it is a default');
  } else {
    assert(!banner, 'the corpus is not empty, so the defaults banner is now false');
    assert(guide.includes(String(rec.corpus.files)), 'the guide should cite the corpus size');
  }
});

// Elbow arrows are routed by the app, which is fussy about the fields it finds.
// The reference corpus contains arrows the app itself wrote; compare against
// those rather than guessing.
test('generated elbow arrows carry the fields the app writes', () => {
  if (!haveSources) return 'skip';
  let reference = null;
  for (const p of sourceList) {
    const scene = JSON.parse(readFileSync(p, 'utf8'));
    reference = scene.elements.find((el) => el.type === 'arrow' && el.elbowed && !el.isDeleted);
    if (reference) break;
  }
  if (!reference) return 'skip';

  const mine = core.arrow({ points: [[0, 0], [80, 0]], elbowed: true });
  // `index` is the fractional z-order key, assigned by reindex() at write time
  // once the element's position in the scene is known.
  const assignedOnWrite = new Set(['index']);
  for (const key of Object.keys(reference)) {
    if (assignedOnWrite.has(key)) continue;
    assert(key in mine, `an app-written elbow arrow has "${key}" and ours does not`);
  }
  eq(mine.roundness, null, 'an elbow arrow must have roundness null');
  eq(mine.elbowed, true, 'elbowed flag');
  for (const key of ['fixedSegments', 'startIsSpecial', 'endIsSpecial']) {
    eq(mine[key], null, `${key} defaults to null`);
  }
});

test('a bound elbow arrow names the edge it leaves from', () => {
  const a = core.rectangle({ x: 0, y: 0, width: 100, height: 60 });
  const b = core.rectangle({ x: 300, y: 0, width: 100, height: 60 });
  const arr = core.arrow({ points: [[0, 0], [200, 0]], elbowed: true });
  core.bindArrow(arr, a, b, { fixedPoints: [core.EDGE_POINT.right, core.EDGE_POINT.left] });
  eq(JSON.stringify(arr.startBinding.fixedPoint), '[1,0.5]', 'start edge point');
  eq(JSON.stringify(arr.endBinding.fixedPoint), '[0,0.5]', 'end edge point');
  // Without fixedPoints the key must be absent, not null: a straight arrow
  // that carries the field is treated as elbowed by the app.
  const plain = core.arrow({ points: [[0, 0], [200, 0]] });
  core.bindArrow(plain, a, b);
  assert(!('fixedPoint' in plain.startBinding), 'a plain arrow carries no fixedPoint');
});

test('reference scenes summarize without their text reaching the record', () => {
  if (!haveSources) return 'skip';
  for (const p of sourceList) {
    const before = createHash('sha256').update(readFileSync(p)).digest('hex');
    const a = analyzer.analyzeScene(JSON.parse(readFileSync(p, 'utf8')), { name: 'x' });
    assert(a.counts.elements > 0, `${'<source>'} produced no elements`);
    const after = createHash('sha256').update(readFileSync(p)).digest('hex');
    eq(after, before, 'analysis must not modify the source');
  }
});

// ------------------------------------------------------------- redaction

const COMMON = new Set(('the a an and or of to in for with from by on at is are be this that it as excalidraw '
  + 'archkit icon icons library libraries scene scenes element elements node nodes edge edges arrow arrows text '
  + 'label labels style styles colour color stroke fill font size width height diagram diagrams architecture '
  + 'system systems service services data flow flows store storage process boundary frame group build render '
  + 'validate analyze docker container skill skills plugin script scripts test tests true false null json svg png '
  + 'http https localhost node npm git').split(' '));

function tokenize(s) {
  return String(s).toLowerCase().match(/[a-z0-9][a-z0-9_-]{2,}/g) ?? [];
}

// Identifier-shaped tokens only: a digit, an underscore, or two or more hyphens.
// Guarding every English word that appears in a label would flag ordinary prose
// and make the check useless.
function sensitiveTokens(s) {
  const out = new Set();
  for (const t of tokenize(s)) {
    if (COMMON.has(t)) continue;
    if (/\d/.test(t) || t.includes('_') || (t.match(/-/g) ?? []).length >= 2) out.add(t);
  }
  for (const m of String(s).matchAll(/\b[A-Z]{3,}\b/g)) out.add(m[0].toLowerCase());
  return out;
}

// The salt is a constant, not a secret: it only stops an accidental collision
// with some other digest list. That is also why sensitive-tokens.sha256 is
// gitignored - with the salt in the open, committing the digests would let
// anyone confirm a guessed name against a local reference corpus.
const SALT = 'arkitect-excalidraw-redaction-v1';
const hashToken = (t) => createHash('sha256').update(SALT + t).digest('hex').slice(0, 16);

function repoFiles(dir, out = []) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', '.analysis', 'output', 'icons', 'libraries'].includes(name.name)) continue;
    const p = join(dir, name.name);
    if (name.isDirectory()) repoFiles(p, out);
    else if (/\.(md|json|mjs|ps1|yaml|yml|txt|excalidraw|excalidrawlib)$/.test(name.name)) out.push(p);
  }
  return out;
}

test('no string from a reference scene leaks into the repository', () => {
  const hashFile = join(HERE, 'sensitive-tokens.excalidraw.sha256');
  let digests;

  if (haveSources) {
    const sensitive = new Set();
    for (const p of sourceList) {
      const scene = JSON.parse(readFileSync(p, 'utf8'));
      for (const el of scene.elements ?? []) {
        if (el.text) for (const t of sensitiveTokens(el.text)) sensitive.add(t);
        if (el.name) for (const t of sensitiveTokens(el.name)) sensitive.add(t);
        if (el.link) for (const t of sensitiveTokens(el.link)) sensitive.add(t);
      }
      // Path components carry customer and project names. Split on separators as
      // well as slashes, so a hyphenated directory yields its codename alone.
      for (const t of sensitiveTokens(p.replace(/[\\/]/g, ' '))) sensitive.add(t);
      for (const t of sensitiveTokens(p.replace(/[\\/.\-_]/g, ' '))) sensitive.add(t);
    }
    assert(sensitive.size > 0, 'derived sensitive-token set is empty - the tokenizer is broken');

    // Subtract whatever the repository already says. The corpus is full of
    // ordinary technical vocabulary - API, LOAD, TRANSFORM, aws - which is also
    // all over the docs, and guarding those would only produce noise. What this
    // check is for is a distinctive string arriving later: a customer name, a
    // codename, a hostname. So baseline against the repo as it stands, and
    // union with the digests already recorded, so a token once judged sensitive
    // stays guarded even if it turns up in the repo on a later run.
    const alreadyPublic = new Set();
    for (const f of repoFiles(ROOT)) {
      if (f === hashFile) continue;
      for (const t of tokenize(readFileSync(f, 'utf8'))) alreadyPublic.add(t);
    }
    const previous = existsSync(hashFile)
      ? readFileSync(hashFile, 'utf8').split('\n').filter((l) => l && !l.startsWith('#'))
      : [];
    const fresh = [...sensitive].filter((t) => !alreadyPublic.has(t)).map(hashToken);
    const union = [...new Set([...previous, ...fresh])].sort();
    writeFileSync(hashFile,
      '# Salted SHA-256 prefixes of tokens that must never appear in this repo.\n'
      + '# Regenerated by tests/run-tests.mjs when local reference sources are present:\n'
      + `# ${sensitive.size} identifier-shaped tokens seen in the corpus, ${union.length} guarded\n`
      + '# (the rest are words the repository already uses in its own prose).\n'
      + union.join('\n') + '\n');
  } else if (!existsSync(hashFile)) {
    return 'skip';
  }

  digests = new Set(readFileSync(hashFile, 'utf8').split('\n').filter((l) => l && !l.startsWith('#')));
  if (!digests.size) return 'skip';

  const hits = [];
  for (const f of repoFiles(ROOT)) {
    if (f === hashFile) continue;
    for (const t of new Set(tokenize(readFileSync(f, 'utf8')))) {
      if (digests.has(hashToken(t))) hits.push(`${relative(ROOT, f)}: "${t}"`);
    }
  }
  assert(hits.length === 0, `sensitive strings leaked into the repo:\n        ${hits.slice(0, 20).join('\n        ')}`);
});

// ------------------------------------------------------------- plugin shape

test('plugin manifest and both skills are well formed', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
  eq(manifest.name, 'arkitect', 'plugin name');
  assert(manifest.description && manifest.description.length > 20, 'plugin description');

  const main = readFileSync(join(SKILL, 'SKILL.md'), 'utf8');
  const learn = readFileSync(join(ROOT, 'skills', 'learn-excalidraw-style', 'SKILL.md'), 'utf8');
  assert(/^---\r?\n/.test(main) && /^---\r?\n/.test(learn), 'skills need YAML frontmatter');
  assert(main.includes('name: arkitect-excalidraw'), 'main skill name');
  assert(learn.includes('name: learn-excalidraw-style'), 'learning skill name');
  assert(learn.includes('disable-model-invocation: true'), 'learning skill must be user-invoked only');
  assert(!main.includes('disable-model-invocation'), 'main skill must stay model-invocable');
  assert(main.includes('${CLAUDE_PLUGIN_ROOT}'), 'main skill should use ${CLAUDE_PLUGIN_ROOT}');
  assert(!/C:\\Users/i.test(main) && !/C:\\Users/i.test(learn), 'skills must not hard-code install paths');
});

test('scripts avoid hard-coded absolute paths', () => {
  const files = readdirSync(SCRIPTS).filter((n) => n.endsWith('.mjs') || n.endsWith('.ps1'));
  for (const f of files) {
    const s = readFileSync(join(SCRIPTS, f), 'utf8');
    assert(!/C:[\\/]Users/i.test(s), `${f} hard-codes a user path`);
  }
  const lib = readdirSync(join(SCRIPTS, 'lib'));
  for (const f of lib) {
    assert(!/C:[\\/]Users/i.test(readFileSync(join(SCRIPTS, 'lib', f), 'utf8')), `lib/${f} hard-codes a user path`);
  }
});

// Both shipped examples are read by the agent before it writes a spec, so a
// stale one teaches the wrong thing. The PNG matters as much as the JSON here:
// it is the thing that actually gets looked at.
for (const name of ['starter-architecture', 'aws-data-platform']) {
  test(`the ${name} example is committed, valid and matches its spec`, () => {
    const specPath = join(SKILL, 'assets', 'templates', `${name}.spec.json`);
    const scenePath = join(SKILL, 'assets', 'templates', `${name}.excalidraw`);
    const pngPath = join(SKILL, 'assets', 'templates', `${name}.png`);
    assert(existsSync(specPath) && existsSync(scenePath), 'both the spec and the built scene ship');
    assert(existsSync(pngPath), 'a rendered PNG ships beside the scene');
    const r = validator.validateFile(scenePath);
    assert(r.ok, `${name} scene errors: ${r.errors.join('; ')}`);
    const spec = JSON.parse(readFileSync(specPath, 'utf8'));
    const rebuilt = builder.buildDiagram(spec);
    eq(rebuilt.scene.elements.length, JSON.parse(readFileSync(scenePath, 'utf8')).elements.length,
      'the committed scene is stale - rebuild it from the spec');
    assert(!rebuilt.report.missingIcons.length,
      `${name} has unresolved icons: ${rebuilt.report.missingIcons.join(', ')}`);
  });
}

test('the docker compose file pins the official image and a port', () => {
  const compose = readFileSync(join(ROOT, 'docker', 'docker-compose.yml'), 'utf8');
  assert(/image:\s*excalidraw\/excalidraw/.test(compose), 'official image');
  assert(/:80"/.test(compose), 'container port 80 is published');
});

// -------------------------------------------------------------

cleanTestIcons();

console.log(`\n${pass} passed, ${fail} failed, ${skip} skipped`);
if (!haveSources) console.log('(reference-scene tests skipped: .analysis/sources.local.json not present)');
if (fail) { console.log('\nfailures:'); for (const f of failures) console.log(`  - ${f}`); process.exit(1); }
