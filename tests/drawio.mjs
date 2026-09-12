#!/usr/bin/env node
// Deterministic, offline test suite.
//
//   node tests/run-tests.mjs        (runs this suite and the Excalidraw one)
//   node tests/drawio.mjs
//
// Tests that need your own reference diagrams (when you supply them) read their paths from
// .analysis/sources.local.json (gitignored). Without that file those tests
// skip rather than fail, so the suite still runs on a clean checkout.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { deflateRawSync, deflateSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SKILL = join(ROOT, 'skills', 'arkitect-drawio');
const SCRIPTS = join(SKILL, 'scripts');
const TMP = join(HERE, 'output', 'drawio');
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
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg} (expected ${b}, got ${a})`); }

const node = (script, args, opts = {}) =>
  execFileSync(process.execPath, [join(SCRIPTS, script), ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });

const sources = existsSync(SOURCES_FILE) ? JSON.parse(readFileSync(SOURCES_FILE, 'utf8')) : null;
// One source list serves both suites; this one reads the `drawio` key.
const sourceList = sources ? (sources.drawio ?? sources.diagrams ?? []) : [];
const haveSources = sourceList.length > 0 && sourceList.every((p) => existsSync(p));

if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

const core = await import(`file://${join(SCRIPTS, 'lib', 'drawio-core.mjs').replace(/\\/g, '/')}`);
const finder = await import(`file://${join(SCRIPTS, 'find-icon.mjs').replace(/\\/g, '/')}`);
const builder = await import(`file://${join(SCRIPTS, 'build-diagram.mjs').replace(/\\/g, '/')}`);
const logos = await import(`file://${join(SCRIPTS, 'fetch-logo.mjs').replace(/\\/g, '/')}`);
const validator = await import(`file://${join(SCRIPTS, 'validate-drawio.mjs').replace(/\\/g, '/')}`);

const LIB_DIR = join(SKILL, 'assets', 'libraries');

// ------------------------------------------------------------- packs

const packs = await import(`file://${join(SCRIPTS, 'build-packs.mjs').replace(/\\/g, '/')}`);

test('every pack the manifest declares is committed and parses', () => {
  const manifest = packs.loadManifest();
  const cat = finder.loadCatalog();
  eq(cat.packs.length, manifest.packs.length, 'pack count');
  for (const p of cat.packs) {
    const entries = core.readLibrary(join(LIB_DIR, p.file));
    eq(entries.length, p.count, `${p.id} entry count`);
  }
});

test('committed libraries still match the manifest they were built from', async () => {
  const checks = await packs.verify();
  const bad = checks.filter((c) => !c.pass);
  assert(bad.length === 0, `failing checks: ${bad.map((c) => c.name).join(', ')}`);
  assert(checks.length >= 50, `expected at least 50 checks, got ${checks.length}`);
});

test('the AWS artwork is unchanged by the move to aws.drawio', () => {
  const aws = core.readLibrary(join(LIB_DIR, 'aws.drawio'));
  eq(aws.length, 243, 'AWS entry count');
  eq(aws.filter((e) => e.mime === 'image/svg+xml').length, 237, 'SVG count');
  eq(aws.filter((e) => e.mime === 'image/png').length, 6, 'PNG count');
});

test('the six AgentCore PNG additions survived the rename', () => {
  const cat = finder.loadCatalog();
  for (const suffix of ['', ' Gateway', ' Identity', ' Memory', ' Observability', ' Runtime']) {
    const title = `Amazon Bedrock AgentCore${suffix}`;
    const hits = cat.icons.filter((i) => i.pack === 'aws' && i.title === title);
    assert(hits.length >= 1, `missing ${title}`);
  }
  const aws = core.readLibrary(join(LIB_DIR, 'aws.drawio'));
  eq(aws.filter((e) => /AgentCore/.test(e.title) && e.mime === 'image/png').length, 6, 'AgentCore PNGs');
});

test('both SVG and PNG entries decode with real dimensions', () => {
  const aws = core.readLibrary(join(LIB_DIR, 'aws.drawio'));
  const svg = aws.find((e) => e.mime === 'image/svg+xml');
  const png = aws.find((e) => e.mime === 'image/png');
  assert(svg.intrinsic.width > 0 && svg.intrinsic.height > 0, 'svg dimensions');
  assert(png.intrinsic.width > 0 && png.intrinsic.height > 0, 'png dimensions');
});

test('duplicate titles are retained and disambiguated by id and hash', () => {
  const cat = finder.loadCatalog();
  const dupes = cat.icons.filter((i) => i.title === 'AWS Compute Optimizer');
  eq(dupes.length, 2, 'Compute Optimizer variants in catalog');
  assert(dupes[0].libraryIndex !== dupes[1].libraryIndex, 'library indices differ');
  assert(dupes[0].sha256 !== dupes[1].sha256, 'payload hashes differ');
  assert(dupes[0].id !== dupes[1].id, 'catalog ids differ');
  assert(dupes.every((d) => d.ambiguousTitle === true), 'both flagged ambiguous');
});

test('the old palette captions still resolve as aliases', () => {
  const cases = [
    ['Arch Amazon-Bedrock 64', 'Amazon Bedrock'],
    ['Arch AWS-Lambda 64', 'AWS Lambda'],
    ['Arch Amazon-Simple-Storage-Service 64', 'Amazon Simple Storage Service'],
  ];
  for (const [legacy, expect] of cases) {
    const r = finder.search(legacy);
    assert(r.length, `no match for ${legacy}`);
    eq(r[0].title, expect, `legacy caption "${legacy}"`);
  }
});

test('catalog carries no base64 payloads', () => {
  const raw = readFileSync(join(SKILL, 'references', 'icon-catalog.json'), 'utf8');
  assert(!raw.includes('data:image/'), 'catalog embeds image data');
  const cat = JSON.parse(raw);
  assert(cat.icons.length > 4000, `catalog size ${cat.icons.length}`);
  assert(cat.icons.every((i) => i.id && i.title && i.pack && i.licence), 'catalog fields present');
  const committed = cat.icons.filter((i) => i.bytes === 'committed');
  assert(committed.every((i) => i.sha256 && Number.isInteger(i.libraryIndex)), 'committed entries indexed');
});

test('every catalog id is unique', () => {
  const ids = finder.loadCatalog().icons.map((i) => i.id);
  eq(new Set(ids).size, ids.length, 'unique ids');
});

test('nothing ships bytes for a mark we lack permission to redistribute', () => {
  const cat = finder.loadCatalog();
  const onDemand = cat.icons.filter((i) => i.bytes === 'on-demand');
  assert(onDemand.length > 0, 'expected on-demand entries');
  for (const i of onDemand) {
    assert(i.libraryIndex === undefined, `${i.id} has a library index`);
    assert(i.fetch && i.fetch.includes('fetch-logo'), `${i.id} has no fetch command`);
  }
  // ...and the library genuinely does not contain them.
  const lib = core.readLibrary(join(LIB_DIR, 'ai-frameworks.drawio'));
  assert(!lib.some((e) => e.title === 'OpenAI'), 'an on-demand mark leaked into a library');
});

// ------------------------------------------------------------- icon lookup

test('icon lookup resolves an exact service name', () => {
  const r = finder.search('Amazon Bedrock');
  eq(r[0].title, 'Amazon Bedrock', 'exact match');
});

test('icon lookup resolves fuzzy and abbreviated names', () => {
  const cases = [['bedrock', 'Amazon Bedrock'], ['lambda', 'AWS Lambda'],
    ['cloudwatch', 'Amazon CloudWatch'], ['s3', 'Amazon Simple Storage Service'],
    ['kafka', 'Apache Kafka'], ['terraform', 'Terraform'], ['blob storage', 'Storage Accounts'],
    ['gke', 'GKE'], ['snowflake', 'Snowflake']];
  for (const [q, expect] of cases) {
    const r = finder.resolve(q);
    assert(r.groups.length, `no match for ${q}`);
    eq(r.groups[0].title, expect, `lookup for "${q}"`);
  }
});

test('a curated pack outranks the catch-all', () => {
  for (const q of ['docker', 'kubernetes', 'grafana', 'postgresql']) {
    const r = finder.resolve(q);
    assert(r.confident, `"${q}" should resolve confidently`);
    assert(r.icon.pack !== 'brands', `"${q}" resolved into the catch-all`);
  }
});

test('pack context breaks a tie toward the stack being drawn', () => {
  const plain = finder.resolve('opensearch');
  const aws = finder.resolve('opensearch', { packs: ['aws'] });
  eq(aws.groups[0].pack, 'aws', 'AWS context wins');
  assert(plain.groups[0].pack !== 'aws', 'context made no difference');
});

test('an ambiguous lookup is flagged rather than resolved silently', () => {
  const r = finder.resolve('compute optimizer');
  assert(!r.confident, 'should not be confident');
  eq(r.groups[0].variants.length, 2, 'both variants offered');
});

test('an unknown service returns no match rather than a wrong icon', () => {
  eq(finder.search('nonexistent quantum widget').length, 0, 'match count');
  // Across ~4,800 icons some query will always graze something. What must never
  // happen is a confident answer to a question the catalog cannot answer.
  for (const q of ['acme internal gateway', 'widget factory service', 'frobnicator']) {
    assert(!finder.resolve(q).confident, `"${q}" resolved confidently`);
  }
});

test('an on-demand icon refuses to produce bytes and hands back the command', () => {
  const cat = finder.loadCatalog();
  const icon = cat.icons.find((i) => i.id === 'ai-frameworks/openai');
  assert(icon, 'openai catalog entry');
  let threw = null;
  try { finder.dataUriFor(icon); } catch (e) { threw = e; }
  assert(threw, 'expected dataUriFor to refuse');
  assert(threw.message.includes('fetch-logo'), 'error should name the fetch command');
});

test('cell styles use the comma-only data URI form draw.io can parse', () => {
  const cat = finder.loadCatalog();
  for (const id of ['aws/aws-lambda', 'azure/storage-accounts', 'agents/memory', 'file-types/py']) {
    const icon = cat.icons.find((i) => i.id === id);
    assert(icon, `catalog entry ${id}`);
    const style = finder.styleFor(icon);
    assert(!style.includes(';base64,'), `${id}: style holds a semicolon that would split it`);
    const parsed = core.parseStyle(style);
    const data = core.parseDataUri(parsed.image);
    assert(data && data.bytes.length > 0, `${id}: embedded image does not decode`);
    eq(data.hash, icon.sha256, `${id}: embedded payload matches catalog hash`);
  }
});

test('every generated pack renders as a parseable SVG', () => {
  for (const id of ['agents', 'primitives', 'github', 'file-types']) {
    const entries = core.readLibrary(join(LIB_DIR, `${id}.drawio`));
    for (const e of entries) {
      const svg = e.dataUri && core.parseDataUri(e.dataUri);
      assert(svg && svg.mime === 'image/svg+xml', `${id}/${e.title}: not an SVG`);
      const text = svg.bytes.toString('utf8');
      assert(text.startsWith('<svg') && text.trimEnd().endsWith('</svg>'), `${id}/${e.title}: malformed SVG`);
    }
  }
});

// ------------------------------------------------------------- generation

const SPEC = join(SKILL, 'assets', 'templates', 'starter-architecture.spec.json');
const OUT = join(TMP, 'generated.drawio');

test('a generated diagram is valid, connected and portable', () => {
  const spec = JSON.parse(readFileSync(SPEC, 'utf8'));
  const { xml, report } = builder.buildDiagram(spec);
  writeFileSync(OUT, xml);
  eq(report.missing.length, 0, `icons missing from the library: ${JSON.stringify(report.missing)}`);

  const r = validator.validateFile(OUT);
  assert(r.ok, `validation errors: ${r.errors.join('; ')}`);
  const page = r.info.pages[0];
  assert(page.embeddedImages >= 5, `expected embedded icons, got ${page.embeddedImages}`);
  eq(page.externalImages, 0, 'external image references');
  eq(page.danglingEdges, 0, 'dangling edges');
  eq(page.overlaps, 0, 'overlapping cells');
  assert(page.edges >= spec.edges.length, 'edges present');
});

test('generated XML is native draw.io, not an image or Mermaid', () => {
  const xml = readFileSync(OUT, 'utf8');
  assert(xml.startsWith('<mxfile'), 'not an mxfile');
  assert(xml.includes('<mxGraphModel'), 'no graph model');
  assert(xml.includes('vertex="1"') && xml.includes('edge="1"'), 'no native cells');
  assert(!xml.includes('```'), 'contains markdown fencing');
});

test('every cell id is unique and every parent exists', () => {
  const mx = core.readMxfile(OUT);
  const cells = core.extractCells(mx.pages[0].xml);
  const ids = cells.map((c) => c.id);
  eq(new Set(ids).size, ids.length, 'unique ids');
  const idSet = new Set(ids);
  for (const c of cells) {
    if (c.id === '0') continue;
    assert(idSet.has(c.parent), `cell ${c.id} references missing parent ${c.parent}`);
  }
});

test('every edge connects two existing cells', () => {
  const mx = core.readMxfile(OUT);
  const cells = core.extractCells(mx.pages[0].xml);
  const idSet = new Set(cells.map((c) => c.id));
  const edges = cells.filter((c) => c.edge);
  assert(edges.length > 0, 'no edges');
  for (const e of edges) {
    assert(e.source && idSet.has(e.source), `edge ${e.id} has a bad source`);
    assert(e.target && idSet.has(e.target), `edge ${e.id} has a bad target`);
  }
});

test('generated styles carry the learned tokens', () => {
  const mx = core.readMxfile(OUT);
  const cells = core.extractCells(mx.pages[0].xml);
  const icons = cells.filter((c) => /(^|;)image=data:/.test(c.style));
  assert(icons.length >= 5, 'icon cells');
  for (const c of icons) {
    const s = core.parseStyle(c.style);
    eq(s.verticalLabelPosition, 'bottom', 'caption below icon');
    eq(s.verticalAlign, 'top', 'caption alignment');
    eq(s.fontSize, '12', 'body type size');
    eq(s.fontColor, '#232F3E', 'squid-ink text');
  }
  for (const c of cells.filter((k) => k.edge)) {
    const s = core.parseStyle(c.style);
    eq(s.edgeStyle, 'orthogonalEdgeStyle', 'orthogonal routing');
    eq(s.rounded, '0', 'square corners');
  }
});

test('updating an existing file writes a timestamped backup first', () => {
  const target = join(TMP, 'update-me.drawio');
  writeFileSync(target, '<mxfile><diagram name="x" id="x"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>');
  const before = readFileSync(target, 'utf8');
  const backup = builder.backupExisting(target);
  assert(backup && existsSync(backup), 'no backup written');
  eq(readFileSync(backup, 'utf8'), before, 'backup content differs from the original');
  assert(/backup-\d{8}-\d{6}/.test(backup), `backup name is not timestamped: ${backup}`);
  writeFileSync(target, '<mxfile></mxfile>');
  eq(readFileSync(backup, 'utf8'), before, 'backup was clobbered by the update');
});

test('the validator rejects a broken diagram', () => {
  const bad = join(TMP, 'broken.drawio');
  writeFileSync(bad, '<mxfile><diagram name="b" id="b"><mxGraphModel><root>'
    + '<mxCell id="0"/><mxCell id="1" parent="0"/>'
    + '<mxCell id="a" vertex="1" parent="1"><mxGeometry x="0" y="0" width="10" height="10" as="geometry"/></mxCell>'
    + '<mxCell id="a" vertex="1" parent="ghost"><mxGeometry x="0" y="0" width="10" height="10" as="geometry"/></mxCell>'
    + '<mxCell id="e" edge="1" parent="1" source="a" target="nope"><mxGeometry relative="1" as="geometry"/></mxCell>'
    + '</root></mxGraphModel></diagram></mxfile>');
  const r = validator.validateFile(bad);
  assert(!r.ok, 'broken file passed validation');
  assert(r.errors.some((e) => e.includes('duplicate cell id')), 'duplicate id not caught');
  assert(r.errors.some((e) => e.includes('missing parent')), 'missing parent not caught');
  assert(r.errors.some((e) => e.includes('does not exist')), 'bad edge target not caught');
});

// ------------------------------------------------------------- logos

// Minimal valid PNG, so the logo tests stay offline and deterministic.
function makePng(w, h, colorType) {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  const crc = (b) => {
    let c = 0xFFFFFFFF;
    for (const x of b) c = table[(c ^ x) & 255] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  };
  const bpp = colorType === 6 ? 4 : 3;
  const raw = Buffer.alloc((w * bpp + 1) * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = y * (w * bpp + 1) + 1 + x * bpp;
      raw[o] = 30; raw[o + 1] = 150; raw[o + 2] = 200;
      if (bpp === 4) raw[o + 3] = 0;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const t = Buffer.from(type, 'ascii');
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = colorType;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const LOGO_KEYS = ['arkitect-drawio-test-alpha', 'arkitect-drawio-test-opaque'];
function clearTestLogos() {
  for (const k of LOGO_KEYS) {
    for (const ext of ['.png', '.svg']) {
      const f = join(logos.LOGO_DIR, k + ext);
      if (existsSync(f)) rmSync(f);
    }
  }
  const idx = join(logos.LOGO_DIR, 'index.json');
  if (existsSync(idx)) {
    const j = JSON.parse(readFileSync(idx, 'utf8'));
    let touched = false;
    for (const k of LOGO_KEYS) if (j[k]) { delete j[k]; touched = true; }
    if (touched) writeFileSync(idx, JSON.stringify(j, null, 2) + '\n');
  }
}
clearTestLogos();

test('a transparent PNG logo caches and is reported as transparent', () => {
  const e = logos.storeLogo(LOGO_KEYS[0], makePng(120, 40, 6), { source: 'test', force: true });
  eq(e.mime, 'image/png', 'mime');
  eq(e.width, 120, 'width'); eq(e.height, 40, 'height');
  eq(e.transparent, true, 'transparency detected');
});

test('an opaque PNG logo is flagged rather than accepted silently', () => {
  const e = logos.storeLogo(LOGO_KEYS[1], makePng(64, 64, 2), { source: 'test', force: true });
  eq(e.transparent, false, 'opaque detected');
  assert(/opaque/i.test(e.transparencyNote), `note should say opaque, got "${e.transparencyNote}"`);
});

test('logo sizing fits the longest side and preserves aspect', () => {
  const e = logos.getLogo(LOGO_KEYS[0]);
  const box = logos.logoBox(e, 64);
  eq(box.width, 64, 'wordmark width');
  eq(box.height, 21, 'wordmark height keeps the 3:1 aspect');
  const sq = logos.logoBox(logos.getLogo(LOGO_KEYS[1]), 64);
  eq(`${sq.width}x${sq.height}`, '64x64', 'square logo');
});

test('a logo style embeds the bytes in the style-safe data URI form', () => {
  const e = logos.getLogo(LOGO_KEYS[0]);
  const style = logos.logoStyle(e);
  assert(!style.includes(';base64,'), 'semicolon would split the draw.io style');
  const data = core.parseDataUri(core.parseStyle(style).image);
  assert(data && data.bytes.length > 0, 'embedded logo does not decode');
  eq(data.hash, e.sha256, 'embedded payload matches the cached file');
});

test('non-images and oversized files are refused', () => {
  let threw = false;
  try { logos.storeLogo('arkitect-drawio-test-bad', Buffer.from('<html>nope</html>'), { force: true }); }
  catch { threw = true; }
  assert(threw, 'an HTML page was accepted as a logo');
});

test('a generated diagram embeds logos and reports missing ones', () => {
  const spec = {
    page: 'Logos', pageId: 'logo-test',
    nodes: [
      { id: 'a', kind: 'logo', logo: LOGO_KEYS[0], label: 'Product A', col: 0, row: 0 },
      { id: 'b', kind: 'logo', logo: 'arkitect-drawio-definitely-not-cached', label: 'Product B', col: 1, row: 0 },
      { id: 'c', kind: 'icon', icon: 'lambda', label: 'Function', col: 2, row: 0 },
    ],
    edges: [{ from: 'a', to: 'c', kind: 'flow' }],
  };
  const { xml, report } = builder.buildDiagram(spec);
  const out = join(TMP, 'logos.drawio');
  writeFileSync(out, xml);

  eq(report.logos.length, 1, 'logos embedded');
  eq(report.missingLogos.length, 1, 'missing logo reported, not substituted');
  eq(report.missingLogos[0], 'arkitect-drawio-definitely-not-cached', 'missing logo named');

  const r = validator.validateFile(out);
  assert(r.ok, `validation errors: ${r.errors.join('; ')}`);
  eq(r.info.pages[0].externalImages, 0, 'logos must embed, never link');
  assert(r.info.pages[0].embeddedImages >= 2, 'logo and icon both embedded');
});

clearTestLogos();

// ------------------------------------------------------------- analysis

test('all five reference diagrams summarize without emitting page XML', () => {
  if (!haveSources) return 'skip';
  const out = node('analyze-drawio.mjs', sourceList);
  for (const marker of ['<mxCell', '<mxGraphModel', '<root>', 'data:image/']) {
    assert(!out.includes(marker), `summary leaked ${marker}`);
  }
  const parsed = JSON.parse(out);
  eq(parsed.files.length, 5, 'files summarized');
  assert(parsed.files.every((f) => f.pages.length >= 1), 'pages summarized');
});

test('page inventory matches the shipped record', () => {
  if (!haveSources) return 'skip';
  // Structure only: page names are authored text and never enter the record,
  // so the invariant is the shape of each file, not what its pages are called.
  const record = JSON.parse(readFileSync(join(SKILL, 'references', 'source-analysis.json'), 'utf8'));
  sourceList.forEach((p, i) => {
    const mx = core.readMxfile(p);
    eq(mx.pages.length, record.sources[i].pageCount, `page count for source ${i}`);
  });
});

test('the record carries no page names', () => {
  const record = JSON.parse(readFileSync(join(SKILL, 'references', 'source-analysis.json'), 'utf8'));
  for (const src of record.sources) {
    for (const page of src.pages) {
      assert(!('name' in page), 'a page summary exposes its name');
      assert(typeof page.index === 'number', 'a page summary is missing its index');
    }
    assert(!('mtimeUtc' in src), 'a source exposes a modification time');
  }
});

test('reference diagrams are unmodified since analysis', () => {
  if (!haveSources) return 'skip';
  const record = JSON.parse(readFileSync(join(SKILL, 'references', 'source-analysis.json'), 'utf8'));
  sourceList.forEach((p, i) => {
    const h = createHash('sha256').update(readFileSync(p)).digest('hex');
    eq(h, record.sources[i].sha256, `source ${i} hash drifted - the file was modified`);
  });
});

test('the analyzer handles a compressed page', () => {
  // Round-trip a page through draw.io's deflate+URI encoding and re-read it.
  const inner = '<mxGraphModel dx="100" dy="100"><root><mxCell id="0"/><mxCell id="1" parent="0"/>'
    + '<mxCell id="n1" value="x" style="rounded=0;" vertex="1" parent="1">'
    + '<mxGeometry x="0" y="0" width="80" height="40" as="geometry"/></mxCell></root></mxGraphModel>';
  const packed = deflateRawSync(Buffer.from(encodeURIComponent(inner), 'binary')).toString('base64');
  const f = join(TMP, 'compressed.drawio');
  writeFileSync(f, `<mxfile><diagram name="c" id="c">${packed}</diagram></mxfile>`);
  const mx = core.readMxfile(f);
  assert(mx.pages[0].compressed, 'page not detected as compressed');
  const cells = core.extractCells(mx.pages[0].xml);
  eq(cells.filter((c) => c.vertex).length, 1, 'decompressed vertex count');
});

// ------------------------------------------------------------- redaction

const GENERIC = new Set(`
aws amazon architecture diagram drawio page cloud data source target lambda bucket
storage service function metrics logs log agent agents model models gateway runtime
memory identity observability bedrock cloudwatch timestream forecast neptune dynamodb
athena eventbridge opensearch elasticsearch batch step functions sns s3 ec2 ecs vpc
subnet region account config file files folder script scripts parser cleaning index
indexing query queries report reports monitoring collector tracker pipeline ingestion
delta recovery manifest backup destination current proposed approach strengths
weaknesses module modules external tools documentation sources producers node true
false null default none text html style value width height parent vertex edge shape
image icon label title name type kind color colour stroke fill font size legend flow
async error success light note assumption reference generic starter template example
python yaml json csv parquet sql table row column view stage integration frontend
backend user users system systems tool date time zone with without from into and the
for not new old set get run runs running use used uses case cases keys key bucketkey
`.trim().split(/\s+/));

// Broad tokenizer, used when scanning repository files: catch anything.
function tokenize(text) {
  return (text.toLowerCase().match(/[a-z][a-z0-9_-]{3,}/g) ?? [])
    .map((t) => t.replace(/^[-_]+|[-_]+$/g, ''))
    .filter((t) => t.length >= 4 && !GENERIC.has(t));
}

// Common English, SQL and infrastructure vocabulary. Diagram labels are terse
// and heavily Title Cased or SHOUTED, so without this the all-caps rule below
// would flag things like "LEFT JOIN" and "CURRENT APPROACH".
const COMMON = new Set(`
left right full inner outer join union select insert update delete where group order
copy copies copied move moved create created creating update updated read write writes
list lists check checks checked trigger triggers triggered launch launches start starts
stop stops send sends receive receives fetch load loads sync syncs export exports
import imports parse parsed clean cleansed cleaned enrich enriched detect detected
approach current previous next final draft option options solution solutions step steps
first second third only when then that this these those with without more less most
need needs needed want should could would have has had been being will can may might
all any each every some none both other others same different full empty missing exist
exists present absent available ready done complete completed success successful fail
failed failure error errors warning info debug level levels mode modes state states
metadata schema view views stage stages job jobs task tasks work worker workers batch
manifest report reports result results output outputs input inputs record records
document documents item items object objects entry entries value values field fields
number count total sum average min max limit offset range start end date time daily
hourly weekly monthly per rate cost costs price usage quota latency throughput volume
scalability traceability flexibility implementation performance recovery reduced lower
higher large small long short fast slow simple complex custom standard native default
strength strengths weakness weaknesses pros cons note notes comment comments question
questions decision decisions assumption assumptions scope scoped in-scope out-of-scope
tested caching cached fetch fetched download downloaded transparent transparency
logo logos vendor product products wordmark aspect offline synthetic probe
agentic studio knowledge graph engine vector vectors embedding embeddings retrieval
prompt chunk
collection collections namespace namespaces cluster clusters instance instances
claude plugin skill skills anthropic must listing refresh shipped arkitect
carries appears repository sensitive tokens derived structural
`.trim().split(/\s+/));

// Narrow tokenizer, used when deciding what counts as sensitive. Guarding every
// English word that appears in a label would flag ordinary prose and make the
// check meaningless. What actually identifies a customer is identifier-shaped
// text, so only that is collected:
//   - identifiers: contain a digit, an underscore, or two or more hyphens
//   - SHOUTED names: all-caps runs of 4+ letters that are not common vocabulary
// Path segments and hostnames are added separately by the caller.
function sensitiveTokens(text) {
  const out = new Set();
  const keep = (t) => {
    const k = t.toLowerCase().replace(/^[-_]+|[-_]+$/g, '');
    if (k.length >= 4 && !GENERIC.has(k) && !COMMON.has(k)) out.add(k);
  };
  for (const m of text.match(/[A-Za-z][A-Za-z0-9_-]{3,}/g) ?? []) {
    const hyphens = (m.match(/-/g) ?? []).length;
    if (/\d/.test(m) || m.includes('_') || hyphens >= 2) keep(m);
    else if (/^[A-Z]{4,}$/.test(m)) keep(m);
  }
  return [...out];
}

// Titles in the shipped icon catalog are public AWS product naming. They are in
// the repository by design, so they can never count as sensitive.
function publicVocabulary() {
  const cat = finder.loadCatalog();
  const out = new Set();
  for (const icon of cat.icons) {
    for (const t of tokenize(`${icon.title} ${icon.aliases.join(' ')}`.replace(/[-_]/g, ' '))) out.add(t);
  }
  return out;
}

// Public vendor and product names. They appear in the reference diagrams (as
// logos and vendor URLs) but they are not customer data - they are the names of
// commercially available products, and the skill is explicitly meant to mention
// them when sourcing logos. Allowlisting them keeps the redaction check aimed at
// what actually identifies a customer.
const PRODUCTS = new Set(`
streamlit snowflake pinecone grafana loki milvus qdrant databricks datadog talend
matillion langfuse clickhouse litellm github gitlab airflow kafka spark tableau
looker mongodb postgres postgresql redis elasticsearch opensearch terraform
kubernetes docker python java nodejs typescript pandas numpy jupyter neptune
timestream forecast bedrock agentcore veeam azure snowpark parquet delta iceberg
`.trim().split(/\s+/));

const SALT = 'arkitect-drawio:v1:';
const hashToken = (t) => createHash('sha256').update(SALT + t).digest('hex').slice(0, 24);

function repoFiles(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (['.git', 'node_modules', '.analysis', 'output', 'libraries'].includes(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) repoFiles(p, acc);
    else if (/\.(md|json|mjs|js|ps1|yaml|yml|drawio|xml|txt)$/i.test(name) && st.size < 8 * 1024 * 1024) acc.push(p);
  }
  return acc;
}

test('no sensitive string from the reference diagrams appears in the repository', () => {
  const hashFile = join(HERE, 'sensitive-tokens.drawio.sha256');
  let sensitive;

  if (haveSources) {
    // Derive from the live sources: full fidelity, nothing written to disk.
    sensitive = new Set();
    for (const p of sourceList) {
      const mx = core.readMxfile(p);
      for (const page of mx.pages) {
        for (const c of core.extractCells(page.xml)) {
          if (!c.value) continue;
          const plain = String(c.value).replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ');
          for (const t of sensitiveTokens(plain)) sensitive.add(t);
        }
        for (const m of page.xml.matchAll(/\bhttps?:\/\/([a-z0-9.-]+)/gi)) {
          for (const t of tokenize(m[1])) sensitive.add(t);
        }
      }
      // Path components carry customer and project names. Split on separators
      // as well as slashes, so a hyphenated directory name yields its codename
      // on its own and not just the whole compound.
      for (const t of tokenize(p.replace(/[\\/]/g, ' '))) sensitive.add(t);
      for (const t of tokenize(p.replace(/[\\/.\-_]/g, ' '))) sensitive.add(t);
    }
    // AWS product naming shipped in the catalog is public, never sensitive.
    const publicVocab = publicVocabulary();
    for (const t of publicVocab) sensitive.delete(t);
    for (const t of COMMON) sensitive.delete(t);
    for (const t of PRODUCTS) sensitive.delete(t);
    // A hyphen/underscore compound made only of generic words is a category
    // name, not an identifier - "data-ingestion" is not customer data.
    const benign = (w) => COMMON.has(w) || GENERIC.has(w) || publicVocab.has(w) || PRODUCTS.has(w);
    for (const t of [...sensitive]) {
      if (!/[-_]/.test(t)) continue;
      if (t.split(/[-_]+/).filter(Boolean).every(benign)) sensitive.delete(t);
    }
    assert(sensitive.size > 0, 'derived sensitive-token set is empty - the tokenizer is broken');

    // Subtract whatever the repository already says. A real corpus is full of
    // ordinary vocabulary - "quality", "setup", "tables" - that is also all over
    // these docs, and guarding those produces nothing but noise. What this check
    // is for is a distinctive string arriving later: a customer name, a
    // codename, a hostname. So baseline against the repo as it stands, then
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

    // Refresh the digest list so the check still works without the sources.
    writeFileSync(hashFile,
      '# Salted SHA-256 prefixes of tokens that must never appear in this repo.\n'
      + '# Regenerated by tests/run-tests.mjs when local reference sources are present:\n'
      + `# ${sensitive.size} identifier-shaped tokens seen in the corpus, ${union.length} guarded\n`
      + union.join('\n') + '\n');
  } else if (existsSync(hashFile)) {
    sensitive = null; // digest-only mode
  } else {
    return 'skip';
  }

  const digests = new Set(readFileSync(hashFile, 'utf8').split('\n')
    .filter((l) => l && !l.startsWith('#')));
  assert(digests.size > 0, 'no sensitive tokens recorded');

  const hits = [];
  for (const f of repoFiles(ROOT)) {
    if (f === hashFile) continue;
    for (const t of new Set(tokenize(readFileSync(f, 'utf8')))) {
      if (digests.has(hashToken(t))) hits.push(`${relative(ROOT, f)}: "${t}"`);
    }
  }
  assert(hits.length === 0, `sensitive strings leaked into the repo:\n        ${hits.slice(0, 20).join('\n        ')}`);
});

test('the shipped analysis record carries no diagram content', () => {
  const raw = readFileSync(join(SKILL, 'references', 'source-analysis.json'), 'utf8');
  for (const marker of ['<mxCell', 'data:image/', 'http://', 'https://']) {
    assert(!raw.includes(marker), `source-analysis.json contains ${marker}`);
  }
  // A literal path fragment would itself be a leak, so match it by shape.
  assert(!/[A-Za-z]:[\\/]/.test(raw), 'source-analysis.json contains a filesystem path');
  const rec = JSON.parse(raw);
  assert(rec.sources.every((s) => !s.path && !s.name && s.sha256), 'source entries expose a path or name');
});

// ------------------------------------------------------------- plugin shape

test('plugin manifest and both skills are well formed', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
  eq(manifest.name, 'arkitect', 'plugin name');
  assert(manifest.description && manifest.description.length > 20, 'plugin description');

  const main = readFileSync(join(SKILL, 'SKILL.md'), 'utf8');
  const learn = readFileSync(join(ROOT, 'skills', 'learn-drawio-style', 'SKILL.md'), 'utf8');
  assert(/^---\r?\n/.test(main) && /^---\r?\n/.test(learn), 'skills need YAML frontmatter');
  assert(main.includes('name: arkitect-drawio'), 'main skill name');
  assert(learn.includes('name: learn-drawio-style'), 'learning skill name');
  assert(learn.includes('disable-model-invocation: true'), 'learning skill must be user-invoked only');
  assert(!main.includes('disable-model-invocation'), 'main skill must stay model-invocable');
  assert(main.includes('${CLAUDE_PLUGIN_ROOT}'), 'main skill should use ${CLAUDE_PLUGIN_ROOT}');
  assert(!/C:\\Users/i.test(main) && !/C:\\Users/i.test(learn), 'skills must not hard-code install paths');
});

test('scripts avoid hard-coded absolute paths', () => {
  for (const f of readdirSync(SCRIPTS).filter((n) => n.endsWith('.mjs'))) {
    const s = readFileSync(join(SCRIPTS, f), 'utf8');
    assert(!/C:[\\/]Users/i.test(s), `${f} hard-codes a user path`);
  }
});

// -------------------------------------------------------------

console.log(`\n${pass} passed, ${fail} failed, ${skip} skipped`);
if (!haveSources) console.log('(reference-diagram tests skipped: .analysis/sources.local.json not present)');
if (fail) { console.log('\nfailures:'); for (const f of failures) console.log(`  - ${f}`); process.exit(1); }
