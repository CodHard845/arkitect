#!/usr/bin/env node
// Search the bundled AWS icon catalog and emit ready-to-paste draw.io cell styles.
// Ranking runs against references/icon-catalog.json only - image payloads are
// read from assets/libraries/ solely when --style or --data is requested, so a
// search never pulls base64 into the caller's context.
//
//   node find-icon.mjs bedrock                  rank matches (metadata only)
//   node find-icon.mjs "compute optimizer"      ambiguous titles list every variant
//   node find-icon.mjs --style <id> [--size 78] full mxCell style with embedded icon
//   node find-icon.mjs --cell <id> --label "X" --x 100 --y 100   complete <mxCell> XML
//   node find-icon.mjs --stats

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readLibrary, normalizeTitle } from './lib/drawio-core.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = join(HERE, '..');
const CATALOG_FILE = join(SKILL_ROOT, 'references', 'icon-catalog.json');
const MERGED_FILE = join(SKILL_ROOT, 'assets', 'libraries', 'AWS-icons.merged.drawio');

export function loadCatalog() {
  return JSON.parse(readFileSync(CATALOG_FILE, 'utf8'));
}

// Caption sits below the icon; matches the observed convention (184/194 icons).
export const ICON_STYLE_BASE =
  'shape=image;html=1;verticalLabelPosition=bottom;verticalAlign=top;' +
  'labelBackgroundColor=none;imageAspect=0;aspect=fixed;fontSize=12;fontColor=#232F3E;';

export function score(icon, query) {
  const q = normalizeTitle(query);
  if (!q) return 0;
  const qTokens = q.split(' ').filter(Boolean);
  const title = String(icon.title).toLowerCase();
  let best = 0;
  for (const alias of icon.aliases) {
    if (alias === q) best = Math.max(best, 100);
    else if (alias.startsWith(q)) best = Math.max(best, 85);
    else if (alias.includes(q)) best = Math.max(best, 70);
  }
  if (title === query.toLowerCase()) best = Math.max(best, 105);
  if (best === 0) {
    // Fuzzy: how many query tokens appear anywhere in the aliases.
    const hay = icon.aliases.join(' ');
    const hits = qTokens.filter((t) => hay.includes(t)).length;
    if (hits) best = Math.round((hits / qTokens.length) * 60);
  }
  // Prefer the canonical 81x81 SVG artwork over odd-sized duplicates.
  if (best && icon.width === 81 && icon.height === 81) best += 2;
  return best;
}

export function search(query, { limit = 8, catalog = loadCatalog() } = {}) {
  const ranked = catalog.icons
    .map((icon) => ({ icon, s: score(icon, query) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || a.icon.index - b.icon.index);

  // Group duplicate titles so an ambiguous hit always shows its alternatives
  // rather than silently picking one.
  const seen = new Map();
  for (const r of ranked) {
    const key = r.icon.title;
    if (!seen.has(key)) seen.set(key, { title: key, best: r.s, variants: [] });
    seen.get(key).variants.push(r.icon);
  }
  return [...seen.values()].sort((a, b) => b.best - a.best).slice(0, limit);
}

export function dataUriFor(icon) {
  const entries = readLibrary(MERGED_FILE);
  const entry = entries[icon.index];
  if (!entry || entry.hash !== icon.sha256) {
    throw new Error(`catalog/library mismatch at index ${icon.index} (${icon.title})`);
  }
  return entry.dataUri;
}

// A draw.io style is semicolon-delimited, so a standard `data:<mime>;base64,`
// URI would be split in half by the style parser. draw.io's own files use the
// comma-only form instead - `data:image/svg+xml,<base64>` - and that is what
// has to go into a cell style.
export function styleSafeDataUri(icon) {
  return dataUriFor(icon).replace(/^data:([^;,]+);base64,/, 'data:$1,');
}

export function styleFor(icon) {
  return `${ICON_STYLE_BASE}image=${styleSafeDataUri(icon)};`;
}

// PNG palette entries declare huge nominal sizes (1024px); normalise every
// icon to the observed 78px service-icon footprint unless told otherwise.
export function recommendedSize(icon, requested) {
  if (requested) return { width: requested, height: requested };
  const w = icon.width ?? 78; const h = icon.height ?? 78;
  if (w > 200 || h > 200) {
    const scale = 78 / Math.max(w, h);
    return { width: Math.round(w * scale), height: Math.round(h * scale) };
  }
  return { width: 78, height: 78 };
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function byId(catalog, id) {
  return catalog.icons.find((i) => i.id === id)
    ?? catalog.icons.find((i) => String(i.index) === String(id));
}

function main(argv) {
  const catalog = loadCatalog();

  if (argv[0] === '--stats') {
    console.log(JSON.stringify({ ...catalog.counts, sources: catalog.sources, merged: catalog.merged }, null, 2));
    return;
  }

  const flag = (name) => { const i = argv.indexOf(name); return i === -1 ? null : argv[i + 1]; };

  if (argv[0] === '--style' || argv[0] === '--data' || argv[0] === '--cell') {
    const icon = byId(catalog, argv[1]);
    if (!icon) { console.error(`no icon with id ${argv[1]}`); process.exit(1); }
    const size = flag('--size') ? Number(flag('--size')) : null;
    const dim = recommendedSize(icon, size);
    if (argv[0] === '--data') { process.stdout.write(dataUriFor(icon)); return; }
    if (argv[0] === '--style') { process.stdout.write(styleFor(icon)); return; }
    const label = flag('--label') ?? icon.title;
    const x = flag('--x') ?? 0; const y = flag('--y') ?? 0;
    const id = flag('--id') ?? `icon-${icon.index}`;
    process.stdout.write(
      `<mxCell id="${esc(id)}" value="${esc(label)}" style="${esc(styleFor(icon))}" vertex="1" parent="1">\n` +
      `  <mxGeometry x="${x}" y="${y}" width="${dim.width}" height="${dim.height}" as="geometry" />\n` +
      '</mxCell>');
    return;
  }

  const query = argv.filter((a) => !a.startsWith('--')).join(' ');
  if (!query) {
    console.error('usage: find-icon.mjs <service name> | --style <id> | --cell <id> | --stats');
    process.exit(2);
  }

  const groups = search(query, { catalog });
  if (!groups.length) {
    console.log(JSON.stringify({
      query, matches: [],
      advice: 'No custom-library icon matches. Fall back to a built-in mxgraph.aws4 shape, or ask before substituting a different service icon.',
    }, null, 2));
    return;
  }

  console.log(JSON.stringify({
    query,
    matches: groups.map((g) => ({
      title: g.title,
      ambiguous: g.variants.length > 1,
      variants: g.variants.map((v) => {
        const dim = recommendedSize(v, null);
        return {
          id: v.id, index: v.index, mime: v.mime,
          libraryWidth: v.width, libraryHeight: v.height,
          recommended: `${dim.width}x${dim.height}`,
          sha256: v.sha256.slice(0, 16),
          provenance: v.provenance.inExplicitExport ? 'both libraries' : 'working palette only',
        };
      }),
    })),
    next: 'node find-icon.mjs --cell <id> --label "Caption" --x 0 --y 0',
  }, null, 2));
}

if (process.argv[1] && process.argv[1].endsWith('find-icon.mjs')) main(process.argv.slice(2));
