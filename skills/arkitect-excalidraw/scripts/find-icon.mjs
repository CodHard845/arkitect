#!/usr/bin/env node
// One search across everything that can supply a mark for a component.
//
//   node find-icon.mjs "dbt"                     rank matches, metadata only
//   node find-icon.mjs "postgres" --limit 12
//   node find-icon.mjs --stats
//   node find-icon.mjs --resolve dbt             what a spec node would draw
//
// Three providers, in order of preference:
//
//   bundled   the Excalidraw libraries shipped with this plugin - the primary
//             source, and native vector geometry rather than pictures
//   house     an icon built from a real logo by make-icon.mjs
//   cache     a library pulled from libraries.excalidraw.com at some point
//
// A search never prints element payloads, so scanning for an icon costs a few
// lines of context rather than a wall of JSON.

import { nameAliases, normalizeName, bbox, positionals } from './lib/excalidraw-core.mjs';
import { loadIndex as loadIconIndex, getIcon } from './make-icon.mjs';
import { listInstalled, libraryItems } from './browse-libraries.mjs';
import { loadIndex as loadBundledIndex, bundledItem } from './index-libraries.mjs';

// Every candidate mark, flattened: bundled items first, then house icons, then
// anything downloaded from the public catalogue.
export function catalog() {
  const out = [];

  const bundled = loadBundledIndex();
  const titleOf = new Map(bundled.libraries.map((l) => [l.slug, l.title]));
  for (const it of bundled.items) {
    // An unnamed item cannot be searched for, only looked at. Listing it here
    // under an invented name is how a diagram ends up showing the wrong
    // product; its library's contact sheet is the way in.
    if (!it.name) continue;
    out.push({
      ref: it.ref,
      name: it.name,
      kind: 'bundled',
      provider: 'bundled',
      library: it.library,
      aliases: nameAliases(it.name),
      detail: { library: titleOf.get(it.library) ?? it.library, elements: it.elements, size: it.size },
    });
  }

  const icons = loadIconIndex();
  for (const key of Object.keys(icons)) {
    const e = icons[key];
    out.push({
      ref: key,
      name: e.label ?? key,
      kind: e.kind,                   // 'embedded' | 'traced'
      provider: 'house',
      library: null,
      aliases: nameAliases(e.label ?? key).concat(nameAliases(key)),
      detail: { mime: e.mime, transparent: e.transparent, size: e.size, source: e.source },
    });
  }
  for (const meta of listInstalled()) {
    const items = libraryItems(meta.slug) ?? [];
    for (const it of items) {
      out.push({
        ref: `${meta.slug}:${it.index}`,
        name: it.name,
        kind: 'library',
        provider: meta.name,
        library: meta.slug,
        aliases: nameAliases(it.name),
        detail: { elements: it.elements.length, authors: meta.authors },
      });
    }
  }
  return out;
}

export function score(entry, query) {
  const q = normalizeName(query).replace(/-/g, ' ');
  if (!q) return 0;
  const tokens = q.split(' ').filter(Boolean);
  let best = 0;
  for (const alias of entry.aliases) {
    if (alias === q) best = Math.max(best, 100);
    else if (alias.startsWith(q)) best = Math.max(best, 85);
    else if (alias.includes(q)) best = Math.max(best, 70);
  }
  if (best === 0) {
    const hay = entry.aliases.join(' ');
    const hits = tokens.filter((t) => hay.includes(t)).length;
    if (hits) best = Math.round((hits / tokens.length) * 60);
  }
  if (best) {
    // The bundled set is the primary source, so it wins a tie. A house icon was
    // made deliberately for one diagram and comes next; a library that happens
    // to be sitting in the download cache is last.
    if (entry.provider === 'bundled') best += 8;
    else if (entry.provider === 'house') best += 4;
  }
  return best;
}

// ------------------------------------------------------------ unattended draws

// A spec node that names a component instead of a ref falls back to search, and
// that hit is drawn with nothing in the report to say so. So it may be drawn only
// when it is the product: the Draw.io resolver's rule, measured against
// tests/excalidraw-icon-queries.json. A leading vendor word is not part of the
// name ("data factory" is "Azure Data Factory"); a prefix counts only when the
// rest is a generic tail ("dynamo" is DynamoDB); and a query that is merely part
// of a longer name never does - "postgres" is not "Azure Database for Postgres".
const VENDOR_WORD = /^(azure|amazon|aws|google|gcp|cloud|apache|microsoft|oracle|ibm) /;
const GENERIC_TAILS = new Set(['db', 'ql', 'sql', 'mq', 'ai', 'labs', 'proxy', 'services', 'service', 'file',
  'js', 'dotjs', 'io', 'dotio', 'hq', 'app', 'apps', 'server', 'platform', 'cloud', 'lang', 'hub']);
const CLEAR_MARGIN = 15;

const nameKey = (name) => normalizeName(name).replace(/-/g, ' ').replace(VENDOR_WORD, '');

// How strongly a query names one entry, and the doubt that stops an unattended draw.
export function match(entry, query) {
  const q = normalizeName(query).replace(/-/g, ' ');
  if (!q) return { strength: 0, doubt: null };
  const names = new Set(entry.aliases);
  for (const a of entry.aliases) if (VENDOR_WORD.test(a)) names.add(a.replace(VENDOR_WORD, ''));
  let strength = 0;
  let doubt = null;
  for (const a of names) {
    if (a === q) {
      strength = 100; doubt = null;
    } else if (a.startsWith(q) && strength <= 85) {
      const generic = GENERIC_TAILS.has(a.slice(q.length).replace(/ /g, ''));
      if (strength < 85) { strength = 85; doubt = generic ? null : 'only the start of a longer name matches'; } else if (generic) doubt = null;
    } else if (a.includes(q) && strength < 70) {
      strength = 70; doubt = 'the query is only part of a longer name';
    }
  }
  return { strength, doubt };
}

// What a spec node naming `query` draws unattended - or null, and why it gets a placeholder.
export function unattended(query, { entries = catalog() } = {}) {
  const judged = [];
  for (const entry of entries) {
    const m = match(entry, query);
    if (m.strength) judged.push({ entry, ...m });
  }
  if (!judged.length) return { entry: null, reason: 'nothing matches' };
  // A stable sort: at equal strength the bundled set wins, then house icons, then the cache.
  judged.sort((a, b) => b.strength - a.strength);
  const [top] = judged;
  if (top.doubt) return { entry: null, candidate: top.entry, reason: top.doubt };
  // The same product often sits in several libraries; a runner-up of the same name is not a rival.
  const rival = judged.find((r) => nameKey(r.entry.name) !== nameKey(top.entry.name));
  if (rival && top.strength - rival.strength < CLEAR_MARGIN) {
    return { entry: null, candidate: top.entry, reason: `"${rival.entry.name}" matches about as well` };
  }
  return { entry: top.entry, reason: null };
}

export function search(query, { limit = 8, entries = catalog() } = {}) {
  return entries
    .map((entry) => ({ entry, s: score(entry, query) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || a.entry.name.length - b.entry.name.length)
    .slice(0, limit)
    .map((r) => ({ ...r.entry, score: r.s }));
}

// Turn a reference into drawable material for build-diagram.mjs.
// Returns { source, kind, elements } or { source, kind: 'embedded', entry }.
export function resolveIcon(ref) {
  if (!ref) return null;
  const direct = String(ref);

  if (direct.includes(':')) {
    // A bundled reference resolves without touching the download cache, and an
    // index like "gcp-icons:37" is the only way to reach an unnamed item.
    const fromBundle = bundledItem(direct);
    if (fromBundle) {
      return {
        source: fromBundle.ref, name: fromBundle.name, kind: 'bundled',
        library: fromBundle.libraryTitle, elements: fromBundle.elements,
      };
    }
    const [slug, key] = direct.split(':');
    const items = libraryItems(normalizeName(slug));
    if (!items) return null;
    const item = /^\d+$/.test(key)
      ? items[Number(key)]
      : items.find((it) => normalizeName(it.name) === normalizeName(key));
    if (!item) return null;
    return { source: `${slug}:${item.index}`, name: item.name, kind: 'library', elements: item.elements };
  }

  const house = getIcon(direct);
  if (house) {
    if (house.kind === 'embedded') {
      return { source: house.name, name: house.label, kind: 'embedded', entry: house };
    }
    return { source: house.name, name: house.label, kind: 'traced', elements: house.elements ?? [] };
  }

  // Not an exact reference: fall back to search, but draw the hit only when it is
  // the product by name. Anything less becomes a placeholder the report names -
  // a substring match used to be enough, and drew the wrong product silently (#22).
  const { entry } = unattended(direct);
  return entry ? resolveIcon(entry.ref) : null;
}

function main(argv) {
  const flag = (n) => { const i = argv.indexOf(n); return i === -1 ? null : argv[i + 1]; };
  const entries = catalog();

  if (argv[0] === '--stats') {
    const libs = listInstalled();
    console.log(JSON.stringify({
      houseIcons: entries.filter((e) => e.provider === 'house').length,
      installedLibraries: libs.length,
      libraryItems: entries.filter((e) => e.provider !== 'house').length,
      libraries: libs.map((l) => ({ slug: l.slug, name: l.name, items: l.items })),
    }, null, 2));
    return;
  }

  if (argv[0] === '--resolve') {
    const r = resolveIcon(argv[1]);
    if (!r) { console.error(`nothing resolves "${argv[1]}"`); process.exit(1); }
    const box = r.elements ? bbox(r.elements) : null;
    console.log(JSON.stringify({
      ref: r.source, name: r.name, kind: r.kind,
      elements: r.elements?.length ?? 1,
      intrinsic: box ? `${Math.round(box.width)}x${Math.round(box.height)}` : `${r.entry.width}x${r.entry.height}`,
      specNode: { kind: 'icon', icon: r.source, label: r.name, col: 0, row: 0 },
    }, null, 2));
    return;
  }

  const query = positionals(argv, ['--limit', '--resolve']).join(' ');
  if (!query) {
    console.error('usage: find-icon.mjs <component name> [--limit N] | --stats | --resolve <ref>');
    process.exit(2);
  }

  const hits = search(query, { entries, limit: Number(flag('--limit') ?? 8) });
  if (!hits.length) {
    console.log(JSON.stringify({
      query,
      matches: [],
      advice: [
        'No installed library or house icon matches.',
        'node browse-libraries.mjs --search "<query>"  - look for a public Excalidraw library',
        'node make-icon.mjs --url <logo url> --name <product> [--trace]  - build the icon from the real logo',
        'Or draw it as a labelled shape and say so. Never reuse a different product\'s mark.',
      ],
    }, null, 2));
    return;
  }

  const verdict = unattended(query, { entries });
  console.log(JSON.stringify({
    query,
    // What a spec node naming this component would get without a ref.
    ...(verdict.entry ? { draws: verdict.entry.ref } : { placeholder: verdict.reason }),
    matches: hits.map((h) => ({
      ref: h.ref, name: h.name, kind: h.kind, provider: h.provider, score: h.score, ...h.detail,
    })),
    next: 'node find-icon.mjs --resolve <ref>   |   spec node: { "kind": "icon", "icon": "<ref>" }',
  }, null, 2));
}

if (process.argv[1] && process.argv[1].endsWith('find-icon.mjs')) main(process.argv.slice(2));
