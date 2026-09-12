#!/usr/bin/env node
// Search the bundled icon packs and emit ready-to-paste draw.io cell styles.
// Ranking runs against references/icon-catalog.json only - image payloads are
// read from assets/libraries/<pack>.drawio solely when --style or --data is
// requested, so a search never pulls base64 into the caller's context.
//
//   node find-icon.mjs bedrock                     rank matches (metadata only)
//   node find-icon.mjs kafka --pack streaming-orchestration
//   node find-icon.mjs "cloud run" --context gcp,devops    bias toward a stack
//   node find-icon.mjs --list-packs
//   node find-icon.mjs --style <id> [--size 78]    full mxCell style with the icon
//   node find-icon.mjs --cell <id> --label "X" --x 100 --y 100
//   node find-icon.mjs --stats
//
// Sixty-nine products ship as catalogue entries without bytes, because their
// marks carry no redistribution licence. Those resolve to a fetch-logo command,
// never to a substitute icon.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readLibrary, normalizeTitle } from './lib/drawio-core.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = join(HERE, '..');
const CATALOG_FILE = join(SKILL_ROOT, 'references', 'icon-catalog.json');
const LIB_DIR = join(SKILL_ROOT, 'assets', 'libraries');

let catalogCache = null;
export function loadCatalog() {
  if (!catalogCache) catalogCache = JSON.parse(readFileSync(CATALOG_FILE, 'utf8'));
  return catalogCache;
}

// Caption sits below the icon; matches the observed convention (184/194 icons).
export const ICON_STYLE_BASE =
  'shape=image;html=1;verticalLabelPosition=bottom;verticalAlign=top;'
  + 'labelBackgroundColor=none;imageAspect=0;aspect=fixed;fontSize=12;fontColor=#232F3E;';

// A curated pack beats the catch-all at equal strength, but an exact hit in the
// catch-all still beats a vague hit in a curated pack - otherwise "tailwindcss"
// would lose to whatever "tail" happened to match.
const CATCH_ALL_PENALTY = 10;
const CONTEXT_BONUS = 12;
const CONFIDENT_AT = 85;
const CLEAR_MARGIN = 15;

export function score(icon, query, { packs = null, catalog = null } = {}) {
  const q = normalizeTitle(query);
  if (!q) return 0;
  const qTokens = q.split(' ').filter(Boolean);
  let best = 0;
  for (const alias of icon.aliases ?? []) {
    if (alias === q) best = Math.max(best, 100);
    else if (alias.startsWith(q)) best = Math.max(best, 85);
    else if (alias.includes(q)) best = Math.max(best, 70);
  }
  if (String(icon.title).toLowerCase() === String(query).toLowerCase()) best = Math.max(best, 105);
  if (best === 0) {
    // Fuzzy: how many query tokens appear anywhere in the aliases. Across ~4,800
    // icons a single token hit out of three is noise, not a candidate, so half
    // the query has to land before anything is offered at all.
    const hay = (icon.aliases ?? []).join(' ');
    const hits = qTokens.filter((t) => hay.includes(t)).length;
    const share = hits / qTokens.length;
    if (share >= 0.5) best = Math.round(share * 60);
  }
  if (!best) return 0;

  const rank = catalog?.packs.find((p) => p.id === icon.pack)?.rank ?? 20;
  if (rank >= 90) best -= CATCH_ALL_PENALTY;
  if (packs?.length && packs.includes(icon.pack)) best += CONTEXT_BONUS;
  // Something the agent can actually draw outranks something it must fetch.
  if (icon.bytes === 'on-demand') best -= 2;
  return best;
}

export function search(query, { limit = 8, catalog = loadCatalog(), packs = null, pack = null } = {}) {
  const pool = pack ? catalog.icons.filter((i) => i.pack === pack) : catalog.icons;
  const ranked = pool
    .map((icon) => ({ icon, s: score(icon, query, { packs, catalog }) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || String(a.icon.id).localeCompare(String(b.icon.id)));

  // Group by title so an ambiguous hit always shows its alternatives rather
  // than silently picking one.
  const seen = new Map();
  for (const r of ranked) {
    const key = `${r.icon.pack}::${r.icon.title}`;
    if (!seen.has(key)) seen.set(key, { title: r.icon.title, pack: r.icon.pack, best: r.s, variants: [] });
    seen.get(key).variants.push(r.icon);
  }
  return [...seen.values()].sort((a, b) => b.best - a.best).slice(0, limit);
}

// A resolution is only safe to use unattended when the leader is both strong
// and clearly ahead. Anything else comes back flagged, with the alternatives.
export function resolve(query, opts = {}) {
  const groups = search(query, opts);
  if (!groups.length) return { query, confident: false, reason: 'no match', groups: [] };
  const [top, next] = groups;
  const margin = next ? top.best - next.best : Infinity;
  const confident = top.best >= CONFIDENT_AT
    && (margin >= CLEAR_MARGIN || groups.length === 1)
    && top.variants.length === 1;
  const reason = confident ? null
    : top.best < CONFIDENT_AT ? 'weak match'
      : top.variants.length > 1 ? 'several icons share this title'
        : 'runner-up is too close';
  return { query, confident, reason, icon: top.variants[0], groups };
}

const libCache = new Map();
function libraryFor(pack, catalog = loadCatalog()) {
  if (libCache.has(pack)) return libCache.get(pack);
  const meta = catalog.packs.find((p) => p.id === pack);
  if (!meta) throw new Error(`no pack "${pack}" in the catalog`);
  const entries = readLibrary(join(LIB_DIR, meta.file));
  libCache.set(pack, entries);
  return entries;
}

export function dataUriFor(icon) {
  if (icon.bytes === 'on-demand') {
    throw new Error(
      `${icon.id} ships no bytes: ${icon.reason}.\n`
      + `  Fetch it first:  ${icon.fetch}\n`
      + '  Do not substitute a different product\'s mark.',
    );
  }
  const entries = libraryFor(icon.pack);
  const entry = entries[icon.libraryIndex];
  if (!entry || entry.hash !== icon.sha256) {
    throw new Error(`catalog/library mismatch at ${icon.pack}[${icon.libraryIndex}] (${icon.title})`);
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
  const w = icon.width ?? 78;
  const h = icon.height ?? 78;
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
    ?? catalog.icons.find((i) => String(i.libraryIndex) === String(id));
}

function describe(icon, catalog) {
  const dim = recommendedSize(icon, null);
  const base = {
    id: icon.id,
    pack: icon.pack,
    source: icon.source,
    licence: icon.licence,
  };
  if (icon.bytes === 'on-demand') {
    return { ...base, bytes: 'on-demand', reason: icon.reason, fetch: icon.fetch, ...(icon.brandUrl ? { brandUrl: icon.brandUrl } : {}) };
  }
  return {
    ...base,
    libraryIndex: icon.libraryIndex,
    mime: icon.mime,
    recommended: `${dim.width}x${dim.height}`,
    sha256: String(icon.sha256).slice(0, 16),
    ...(catalog.packs.find((p) => p.id === icon.pack)?.rank >= 90 ? { note: 'catch-all pack - confirm this is the right product' } : {}),
  };
}

function main(argv) {
  const catalog = loadCatalog();
  const flag = (name) => { const i = argv.indexOf(name); return i === -1 ? null : argv[i + 1]; };

  if (argv[0] === '--stats') {
    console.log(JSON.stringify({ counts: catalog.counts, generated: catalog.generated, manifest: catalog.manifest }, null, 2));
    return;
  }

  if (argv[0] === '--list-packs') {
    console.log(JSON.stringify({
      packs: catalog.packs.map((p) => ({
        id: p.id, title: p.title, icons: p.count, onDemand: p.onDemand, rank: p.rank, about: p.description,
      })),
      resolutionOrder: 'lower rank wins at equal match strength; rank 90 is the catch-all',
      usage: 'node find-icon.mjs <query> [--pack <id>] [--context <id,id>]',
    }, null, 2));
    return;
  }

  if (argv[0] === '--style' || argv[0] === '--data' || argv[0] === '--cell') {
    const icon = byId(catalog, argv[1]);
    if (!icon) { console.error(`no icon with id ${argv[1]}`); process.exit(1); }
    const size = flag('--size') ? Number(flag('--size')) : null;
    const dim = recommendedSize(icon, size);
    if (argv[0] === '--data') { process.stdout.write(dataUriFor(icon)); return; }
    if (argv[0] === '--style') { process.stdout.write(styleFor(icon)); return; }
    const label = flag('--label') ?? icon.title;
    const x = flag('--x') ?? 0;
    const y = flag('--y') ?? 0;
    const id = flag('--id') ?? `icon-${icon.id.replace(/\W+/g, '-')}`;
    process.stdout.write(
      `<mxCell id="${esc(id)}" value="${esc(label)}" style="${esc(styleFor(icon))}" vertex="1" parent="1">\n`
      + `  <mxGeometry x="${x}" y="${y}" width="${dim.width}" height="${dim.height}" as="geometry" />\n`
      + '</mxCell>');
    return;
  }

  const packs = (flag('--context') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const pack = flag('--pack');
  const skip = new Set(['--context', '--pack', '--size', '--label', '--x', '--y', '--id']);
  const query = argv.filter((a, i) => !a.startsWith('--') && !skip.has(argv[i - 1])).join(' ');

  if (!query) {
    console.error('usage: find-icon.mjs <product name> [--pack <id>] [--context <id,id>]');
    console.error('       find-icon.mjs --list-packs | --style <id> | --cell <id> | --stats');
    process.exit(2);
  }

  const r = resolve(query, { catalog, packs, pack });
  if (!r.groups.length) {
    console.log(JSON.stringify({
      query, matches: [], confident: false,
      advice: 'No pack has this icon. Check --list-packs, try the product\'s formal name, or draw a '
        + 'plain labelled box and say so in the report. Never substitute a different product\'s mark.',
    }, null, 2));
    return;
  }

  console.log(JSON.stringify({
    query,
    confident: r.confident,
    ...(r.confident ? { resolved: r.icon.id } : { needsAChoice: r.reason }),
    matches: r.groups.map((g) => ({
      title: g.title,
      pack: g.pack,
      strength: g.best,
      ambiguous: g.variants.length > 1,
      variants: g.variants.map((v) => describe(v, catalog)),
    })),
    next: r.confident
      ? `node find-icon.mjs --cell ${r.icon.id} --label "Caption" --x 0 --y 0`
      : 'Pick one id deliberately, or narrow with --pack / --context.',
  }, null, 2));
}

if (process.argv[1] && process.argv[1].endsWith('find-icon.mjs')) main(process.argv.slice(2));
