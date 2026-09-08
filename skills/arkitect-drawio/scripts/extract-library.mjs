#!/usr/bin/env node
// Parse the two bundled .mxlibrary palettes, verify their known invariants,
// build the deterministic merged library, and emit the icon catalog.
//
//   node extract-library.mjs --verify
//   node extract-library.mjs --build            (writes merged library + catalog)
//   node extract-library.mjs --entry <id>       (print one entry's data URI)
//
// Provenance rule: AWS-v1.drawio (the working palette) is a strict superset of
// AWS-icons.drawio.xml - indices 0..236 are byte-identical in the same order,
// with six AgentCore PNGs appended. The merged library therefore preserves
// palette order; provenance lives in the catalog, not in the library file,
// so the merged file stays loadable by draw.io unchanged.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readLibrary, titleAliases, sha256 } from './lib/drawio-core.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = join(HERE, '..');
export const LIB_DIR = join(SKILL_ROOT, 'assets', 'libraries');
export const REF_DIR = join(SKILL_ROOT, 'references');

export const SOURCES = [
  { key: 'export', file: 'AWS-icons.drawio.xml', label: 'explicit draw.io export',
    sha256: '7e049276d9e5f5f5071739ec069273d8e00829a787bc8161edd41d30d29de211', expect: 237 },
  { key: 'palette', file: 'AWS-v1.drawio', label: 'working palette',
    sha256: '635ba018ed76758a646b6c86b9680e8087aa04799378548b4b780384910a4614', expect: 243 },
];

export const MERGED_FILE = join(LIB_DIR, 'AWS-icons.merged.drawio');
export const CATALOG_FILE = join(REF_DIR, 'icon-catalog.json');

export function loadSources(dir = LIB_DIR) {
  const out = {};
  for (const s of SOURCES) {
    const path = join(dir, s.file);
    out[s.key] = { ...s, path, entries: readLibrary(path), fileHash: sha256(readFileSync(path)) };
  }
  return out;
}

export function verify(dir = LIB_DIR) {
  const src = loadSources(dir);
  const checks = [];
  const ok = (name, pass, detail) => checks.push({ name, pass, detail });

  for (const s of SOURCES) {
    const got = src[s.key];
    ok(`${s.key}: file sha256`, got.fileHash === s.sha256, got.fileHash);
    ok(`${s.key}: entry count == ${s.expect}`, got.entries.length === s.expect, String(got.entries.length));
  }

  const ex = src.export.entries;
  const pa = src.palette.entries;

  const exTitles = new Set(ex.map((e) => e.title));
  const paTitles = new Set(pa.map((e) => e.title));
  const shared = [...exTitles].filter((t) => paTitles.has(t));
  ok('shared unique titles == 236', shared.length === 236, String(shared.length));

  const aligned = ex.every((e, i) => pa[i] && pa[i].title === e.title && pa[i].hash === e.hash);
  ok('palette[0..236] byte-identical to export', aligned, aligned ? 'all 237 payloads match' : 'mismatch');

  const exHashes = new Set(ex.map((e) => e.hash));
  const sharedPayloads = [...exHashes].filter((h) => pa.some((e) => e.hash === h)).length;
  ok('every shared icon payload identical', sharedPayloads === exHashes.size, `${sharedPayloads}/${exHashes.size}`);

  const AGENTCORE = ['AgentCore', 'AgentCoreGateway', 'AgentCoreIdentity', 'AgentCoreMemory', 'AgentCoreObservability', 'AgentCoreRuntime'];
  const extra = [...paTitles].filter((t) => !exTitles.has(t)).sort();
  ok('palette adds exactly the six AgentCore entries',
    JSON.stringify(extra) === JSON.stringify(AGENTCORE.slice().sort()), extra.join(','));
  ok('all six AgentCore entries are PNG',
    AGENTCORE.every((t) => pa.find((e) => e.title === t)?.mime === 'image/png'), 'mime check');

  const dupTitle = 'Arch AWS-Compute-Optimizer 64';
  for (const [key, list] of [['export', ex], ['palette', pa]]) {
    const dups = list.filter((e) => e.title === dupTitle);
    const distinctHashes = new Set(dups.map((e) => e.hash)).size;
    const dims = dups.map((e) => `${e.w}x${e.h}`).sort().join(',');
    ok(`${key}: two distinct ${dupTitle} variants`,
      dups.length === 2 && distinctHashes === 2 && dims === '80x80,81x81', `${dups.length} entries, ${distinctHashes} hashes, ${dims}`);
  }

  const svg = pa.filter((e) => e.mime === 'image/svg+xml').length;
  const png = pa.filter((e) => e.mime === 'image/png').length;
  ok('palette mime split 237 svg / 6 png', svg === 237 && png === 6, `${svg} svg, ${png} png`);

  const at81 = pa.filter((e) => e.w === 81 && e.h === 81).length;
  ok('most entries are 81x81', at81 > pa.length * 0.8, `${at81}/${pa.length}`);
  ok('catalog titles include Amazon Bedrock',
    pa.some((e) => /bedrock/i.test(e.title)), pa.filter((e) => /bedrock/i.test(e.title)).map((e) => e.title).join(' | '));

  return checks;
}

export function buildCatalog(dir = LIB_DIR) {
  const src = loadSources(dir);
  const ex = src.export.entries;
  const exByHash = new Map();
  for (const e of ex) {
    if (!exByHash.has(e.hash)) exByHash.set(e.hash, e.index);
  }

  // Merged library == palette order. Deterministic and index-stable.
  const merged = src.palette.entries;
  const titleCounts = new Map();
  for (const e of merged) titleCounts.set(e.title, (titleCounts.get(e.title) ?? 0) + 1);

  const icons = merged.map((e) => {
    const ambiguous = titleCounts.get(e.title) > 1;
    return {
      id: `aws-${String(e.index).padStart(3, '0')}-${e.hash.slice(0, 8)}`,
      index: e.index,
      title: e.title,
      aliases: titleAliases(e.title),
      mime: e.mime,
      width: e.w,
      height: e.h,
      intrinsicWidth: e.intrinsic.width,
      intrinsicHeight: e.intrinsic.height,
      aspect: e.aspect ?? null,
      bytes: e.byteLength,
      sha256: e.hash,
      ambiguousTitle: ambiguous,
      provenance: {
        mergedFrom: 'AWS-v1.drawio',
        mergedIndex: e.index,
        inExplicitExport: exByHash.has(e.hash),
        exportIndex: exByHash.has(e.hash) ? exByHash.get(e.hash) : null,
      },
    };
  });

  return { src, merged, icons };
}

export function writeMerged(merged, path = MERGED_FILE) {
  // Standard mxlibrary fields only, so draw.io can open it directly.
  const payload = merged.map((e) => ({
    data: e.dataUri,
    w: e.w,
    h: e.h,
    title: e.title,
    ...(e.aspect ? { aspect: e.aspect } : {}),
  }));
  const json = JSON.stringify(payload)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  writeFileSync(path, `<mxlibrary>${json}</mxlibrary>`);
  return path;
}

function main(argv) {
  const mode = argv[0] ?? '--verify';
  if (mode === '--verify') {
    const checks = verify();
    let failed = 0;
    for (const c of checks) {
      if (!c.pass) failed++;
      console.log(`${c.pass ? 'ok  ' : 'FAIL'}  ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
    }
    console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
    process.exit(failed ? 1 : 0);
  }

  if (mode === '--build') {
    const { src, merged, icons } = buildCatalog();
    writeMerged(merged);
    const mergedHash = sha256(readFileSync(MERGED_FILE));
    const catalog = {
      generated: new Date().toISOString(),
      note: 'Image payloads are NOT duplicated here. Load them from assets/libraries/ by index.',
      sources: SOURCES.map((s) => ({
        key: s.key, file: s.file, label: s.label,
        sha256: src[s.key].fileHash, entries: src[s.key].entries.length,
      })),
      merged: { file: 'AWS-icons.merged.drawio', entries: merged.length, sha256: mergedHash, order: 'AWS-v1.drawio palette order (index-stable)' },
      counts: {
        total: icons.length,
        svg: icons.filter((i) => i.mime === 'image/svg+xml').length,
        png: icons.filter((i) => i.mime === 'image/png').length,
        ambiguousTitles: [...new Set(icons.filter((i) => i.ambiguousTitle).map((i) => i.title))],
      },
      icons,
    };
    writeFileSync(CATALOG_FILE, JSON.stringify(catalog, null, 2));
    console.log(`merged library: ${merged.length} entries -> ${MERGED_FILE}`);
    console.log(`merged sha256:  ${mergedHash}`);
    console.log(`catalog:        ${icons.length} icons -> ${CATALOG_FILE}`);
    return;
  }

  if (mode === '--entry') {
    const id = argv[1];
    const { icons, merged } = buildCatalog();
    const icon = icons.find((i) => i.id === id || String(i.index) === id);
    if (!icon) { console.error(`no such entry: ${id}`); process.exit(1); }
    process.stdout.write(merged[icon.index].dataUri);
    return;
  }

  console.error('usage: extract-library.mjs [--verify|--build|--entry <id>]');
  process.exit(2);
}

if (process.argv[1] && process.argv[1].endsWith('extract-library.mjs')) main(process.argv.slice(2));
