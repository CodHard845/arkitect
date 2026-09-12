#!/usr/bin/env node
// Build the bundled .drawio icon libraries from assets/libraries/sources.json.
//
//   node build-packs.mjs --all                  build every pack + the catalog
//   node build-packs.mjs --pack azure           build one pack
//   node build-packs.mjs --verify               committed libraries match the manifest?
//   node build-packs.mjs --refresh azure-v24    re-download one source, report hash drift
//   node build-packs.mjs --list                 what the manifest declares
//
// Upstream archives land in a gitignored .cache/ - they are inputs, not
// shipped artwork. Vendor icons (AWS, Azure, Google) are embedded verbatim
// because those terms permit redistribution for architecture diagrams but
// forbid altering the icon shape. Only permissively licensed marks are
// recoloured, and only ever into their own brand colour.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import { readLibrary, titleAliases } from './lib/drawio-core.mjs';
import {
  sha256, download, readZip, readTgz, splitSvg, viewBoxOf, paintMark, conceptTile,
  fileSheet, dataUri, writeLibrary, prettyTitle, slugify, aliasSet, withPlurals, withShortName,
  normalise,
} from './lib/icon-build.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = join(HERE, '..');
export const LIB_DIR = join(SKILL_ROOT, 'assets', 'libraries');
export const REF_DIR = join(SKILL_ROOT, 'references');
export const CACHE_DIR = join(SKILL_ROOT, '.cache');
export const MANIFEST_FILE = join(LIB_DIR, 'sources.json');
export const CATALOG_FILE = join(REF_DIR, 'icon-catalog.json');

const ICON_SIZE = 78; // the AWS palette's service-icon footprint; keeps packs interchangeable

// AWS is the one pack not rebuilt from an upstream archive: its artwork is the
// palette that shipped with the skill. Once canonicalised, aws.drawio is its
// own source, so the rebuild is idempotent and the original palette files can
// go. The fallback only matters for the very first build.
function awsSourceFile() {
  const canonical = join(LIB_DIR, 'aws.drawio');
  return existsSync(canonical) ? canonical : join(LIB_DIR, 'AWS-icons.merged.drawio');
}

export const loadManifest = () => JSON.parse(readFileSync(MANIFEST_FILE, 'utf8'));

// ------------------------------------------------------------------ sources

function npmTarballUrl(pkg, version) {
  const short = pkg.includes('/') ? pkg.split('/')[1] : pkg;
  return `https://registry.npmjs.org/${pkg}/-/${short}-${version}.tgz`;
}

// One archive per source, read once and kept in memory for the whole run.
async function openSource(key, manifest, cache, { refresh = false } = {}) {
  if (cache.has(key) && !refresh) return cache.get(key);
  const src = manifest.sources[key];
  if (!src) throw new Error(`sources.json declares no source "${key}"`);

  let files = new Map();
  let hash = null;

  if (src.type === 'npm') {
    const url = npmTarballUrl(src.package, src.version);
    const got = await download(url, CACHE_DIR, { refresh });
    hash = got.sha256;
    for (const e of readTgz(got.buf)) files.set(e.name, e.data);
  } else if (src.type === 'zip') {
    const got = await download(src.url, CACHE_DIR, { refresh });
    hash = got.sha256;
    if (src.sha256 && src.sha256 !== hash) {
      throw new Error(
        `${key}: upstream bytes changed.\n  manifest sha256 ${src.sha256}\n  download sha256 ${hash}\n`
        + '  Re-pin deliberately with --refresh once you have reviewed the new set.',
      );
    }
    for (const e of readZip(got.buf)) files.set(e.name, e.read());
  } else if (src.type === 'local') {
    hash = 'local';
  } else {
    throw new Error(`${key}: unknown source type "${src.type}"`);
  }

  const opened = { key, src, files, sha256: hash };
  cache.set(key, opened);
  return opened;
}

const readText = (opened, path) => {
  const buf = opened.files.get(path);
  if (!buf) throw new Error(`${opened.key}: no file "${path}" in the archive`);
  return buf.toString('utf8');
};

// ------------------------------------------------------------- pack builders

// Verbatim vendor artwork. Nothing here rewrites the SVG: Microsoft and Google
// both permit redistribution for diagrams and both forbid altering the shape.
async function buildVendorZipPack(pack, manifest, cache) {
  const entries = [];
  const bySlug = new Map();
  // "other" and "general" are Azure's overflow folders; a service that also
  // appears in a named category should be credited to the named one.
  const groupRank = (g) => (/^(other|general)$/i.test(g) ? 1 : 0);
  // Google publishes "Vertex AI" and "vertexai" for the same product, so the
  // duplicate check ignores word breaks entirely.
  const dedupeKey = (slug) => slug.replace(/-/g, '');
  const firstTierWins = pack.dedupe === 'first-tier-wins';
  // Google's legacy archive sometimes uses a different name for a product the
  // current set already ships ("google_kubernetes_engine" is today's "GKE").
  // The old name survives as an alias on the current icon, not as a second one.
  const supersedes = pack.supersedes ?? {};
  const inherited = new Map();

  for (const spec of pack.sources) {
    const opened = await openSource(spec.source, manifest, cache);
    const re = new RegExp(spec.include);
    for (const [path, buf] of opened.files) {
      const m = re.exec(path.replace(/\\/g, '/'));
      if (!m) continue;
      const group = m.groups?.group ?? '';
      const file = m.groups?.file ?? basename(path, '.svg');
      const raw = spec.titleFrom === 'gcp-dirname'
        ? group
        : file.replace(/^\d+\s*-icon-service-/, '');
      const title = prettyTitle(raw);
      const slug = slugify(raw);
      const svg = buf.toString('utf8');
      const candidate = {
        slug, title, svg, group, tier: spec.tier ?? null,
        source: spec.source, upstreamPath: path, rank: groupRank(group),
        payload: sha256(buf),
      };
      if (supersedes[slug]) {
        const target = dedupeKey(supersedes[slug]);
        if (!inherited.has(target)) inherited.set(target, []);
        inherited.get(target).push(title, slug);
        continue;
      }
      const key = dedupeKey(slug);
      const seen = bySlug.get(key);
      if (!seen) { bySlug.set(key, candidate); continue; }
      // Google's legacy archive repeats products the current set already
      // covers, in the old branding. The current artwork wins outright.
      if (firstTierWins) continue;
      // Same name, same artwork: one entry, credited to the better folder.
      if (seen.payload === candidate.payload) {
        if (candidate.rank < seen.rank) bySlug.set(key, candidate);
        continue;
      }
      // Same name, different artwork: two genuinely different services that
      // Microsoft happens to have named alike. Keep both, split by folder.
      const alt = `${slug}-${slugify(group)}`;
      if (!bySlug.has(dedupeKey(alt))) {
        bySlug.set(dedupeKey(alt), { ...candidate, slug: alt, title: `${title} (${prettyTitle(group)})` });
      }
    }
  }

  // Vendors name services formally; architects do not. aliasExtras carries the
  // household names ("blob storage", "gke") that the formal title never yields.
  const aliasExtras = pack.aliasExtras ?? {};
  for (const c of [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug))) {
    const extra = [...(aliasExtras[c.slug] ?? []), ...(inherited.get(dedupeKey(c.slug)) ?? [])];
    if (/^Azure /.test(c.title)) extra.push(c.title.replace(/^Azure /, ''));
    if (/^Google /.test(c.title)) extra.push(c.title.replace(/^Google /, ''));
    if (/^Cloud /.test(c.title)) extra.push(c.title.replace(/^Cloud /, ''));
    const given = aliasSet(c.title, c.slug, ...extra);
    const aliases = withPlurals(given);
    entries.push({
      slug: c.slug, title: c.title, svg: c.svg,
      aliases, generatedAliases: aliases.filter((a) => !given.includes(a)),
      source: `${c.source}`, upstreamId: c.upstreamPath, render: 'verbatim',
      group: c.group, tier: c.tier,
    });
  }
  return entries;
}

// The committed AWS palette, retitled but with every payload byte untouched:
// this pack is kept as it shipped rather than rebuilt from Amazon's asset
// package. The original palette titles survive as aliases so a spec written
// against the old catalog still resolves.
function buildAwsPack(pack) {
  const raw = readLibrary(awsSourceFile());
  const legacy = pack.legacyTitles ?? {};
  const abbrev = pack.abbreviations ?? {};
  // The palette ships two "Compute Optimizer" variants, and the AgentCore PNG
  // drop repeats a service the SVG set already has. Both are real duplicates
  // with different artwork, so both survive - under distinct ids.
  const used = new Map();
  return raw.map((e) => {
    // Only the palette's own size suffixes are stripped. A blanket two-digit
    // rule would quietly turn "Amazon Route 53" into "Amazon Route", and the
    // rebuild reads its own output, so that damage would compound.
    const title = /^AgentCore/.test(e.title)
      ? `Amazon Bedrock AgentCore ${e.title.slice('AgentCore'.length)}`.trim()
      : e.title.replace(/^Arch[_\s-]+/i, '').replace(/[_\s-]+(?:16|32|48|64)$/, '')
        .replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    const short = title.replace(/^(Amazon|AWS)\s+/i, '');
    const base = slugify(title);
    const nth = (used.get(base) ?? 0) + 1;
    used.set(base, nth);
    const slug = nth === 1 ? base : `${base}-${nth}`;
    const original = legacy[slug] ?? e.title;
    const given = aliasSet(title, short, original, ...titleAliases(original), ...(abbrev[slug] ?? []));
    const aliases = withPlurals(given);
    return {
      slug, title,
      data: e.dataUri, w: e.w, h: e.h, aspect: e.aspect,
      aliases, generatedAliases: aliases.filter((a) => !given.includes(a)),
      source: 'aws-palette', upstreamId: original, render: 'verbatim',
      mime: e.mime, width: e.w, height: e.h, sha256: e.hash,
    };
  });
}

async function buildBrandEntries(icons, manifest, cache) {
  const out = [];
  for (const icon of icons) {
    if (icon.deviconName) {
      const opened = await openSource('devicon', manifest, cache);
      const path = `icons/${icon.deviconName}/${icon.deviconName}-${icon.deviconVariant}.svg`;
      const svgText = readText(opened, path);
      // devicon ships full-colour artwork; only the canvas size is normalised.
      const { inner } = splitSvg(svgText);
      const [x, y, w, h] = viewBoxOf(svgText);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" `
        + `viewBox="${x} ${y} ${w} ${h}">${inner}</svg>`;
      out.push({
        slug: icon.slug, title: icon.title, svg,
        aliases: withShortName(icon.aliases, icon.title),
        source: icon.source, upstreamId: path, render: 'verbatim-colour',
      });
      continue;
    }
    const opened = await openSource('simple-icons', manifest, cache);
    const svgText = readText(opened, `icons/${icon.slug}.svg`);
    const { svg, render } = paintMark(svgText, icon.hex);
    out.push({
      slug: icon.slug, title: icon.title, svg,
      aliases: withShortName(icon.aliases, icon.title),
      source: icon.source, upstreamId: icon.slug, render, hex: icon.hex,
    });
  }
  return out;
}

async function buildTileEntries(tiles, manifest, cache) {
  const opened = await openSource(tiles.source, manifest, cache);
  const out = [];
  for (const [concept, glyph] of Object.entries(tiles.concepts)) {
    const path = tiles.source === 'octicons'
      ? `build/svg/${glyph}-24.svg`
      : `icons/${glyph}.svg`;
    const svg = conceptTile(readText(opened, path), {
      tileColour: tiles.tileColour, glyphColour: tiles.glyphColour, style: tiles.style,
    });
    out.push({
      slug: concept, title: prettyTitle(concept.replace(/-/g, ' ')), svg,
      aliases: aliasSet(concept, concept.replace(/-/g, ' '), glyph),
      source: `${opened.src.package}@${opened.src.version}`, upstreamId: path, render: 'tile',
    });
  }
  return out;
}

async function buildSheetEntries(icons, manifest, cache) {
  const out = [];
  for (const icon of icons) {
    const key = icon.kind === 'house' ? 'lucide' : 'simple-icons';
    const opened = await openSource(key, manifest, cache);
    const path = `icons/${icon.glyph}.svg`;
    const svg = fileSheet(readText(opened, path), {
      ext: icon.ext, colour: `#${icon.hex}`, style: icon.kind === 'house' ? 'stroke' : 'fill',
    });
    out.push({
      slug: icon.ext, title: icon.title, svg,
      // Deliberately not the bare glyph name: "terraform" must reach the
      // product mark in devops, not a .tf document sheet.
      aliases: aliasSet(icon.ext, `${icon.ext} file`, `dot ${icon.ext}`, `${icon.ext} document`, icon.title),
      source: icon.source, upstreamId: path, render: 'sheet',
    });
  }
  return out;
}

// Every remaining Simple Icons mark, so a product no curated pack names is
// still reachable. Ranked last, and labelled, so a weak hit looks weak.
// Upstream alias metadata is generous: Simple Icons lists "Terraform" as an
// alias of OpenTofu, which would put a fork's mark one point behind the real
// thing. Names a curated pack already owns are stripped from the catch-all.
function claimedAliases(manifest) {
  const out = new Set();
  for (const p of manifest.packs) {
    if (p.id === 'brands') continue;
    for (const i of (p.icons ?? [])) {
      if (i.title) { out.add(normalise(i.title)); out.add(normalise(i.title).replace(/ /g, '')); }
      if (i.slug) out.add(i.slug);
      if (i.glyph) out.add(i.glyph);
    }
  }
  return out;
}

async function buildCatchAll(manifest, cache, claimed) {
  const owned = claimedAliases(manifest);
  const opened = await openSource('simple-icons', manifest, cache);
  const data = JSON.parse(readText(opened, 'data/simple-icons.json'));
  const REPL = { '+': 'plus', '.': 'dot', '&': 'and', đ: 'd', ħ: 'h', ı: 'i', ĸ: 'k', ŀ: 'l', ł: 'l', ß: 'ss', ŧ: 't', ø: 'o' };
  const toSlug = (t) => t.toLowerCase()
    .replace(/[+.&đħıĸŀłßŧø]/g, (c) => REPL[c])
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\d]/g, '');

  const out = [];
  for (const d of data) {
    const slug = d.slug ?? toSlug(d.title);
    if (claimed.has(slug)) continue;
    const svgText = readText(opened, `icons/${slug}.svg`);
    const { svg, render } = paintMark(svgText, d.hex);
    const extra = [...(d.aliases?.aka ?? []), ...(d.aliases?.old ?? [])];
    const aliases = withShortName(aliasSet(d.title, slug, ...extra), d.title)
      .filter((a) => !owned.has(a));
    if (!aliases.length) continue; // nothing left that a curated pack does not already own
    out.push({
      slug, title: d.title, svg, aliases,
      source: `simple-icons@${opened.src.version}`, upstreamId: slug, render, hex: d.hex,
    });
  }
  return out;
}

// ------------------------------------------------------------------ assemble

async function buildPack(pack, manifest, cache, claimed) {
  let entries;
  switch (pack.builder) {
    case 'local-aws':
      entries = buildAwsPack(pack);
      break;
    case 'zip-tree':
      entries = await buildVendorZipPack(pack, manifest, cache);
      break;
    case 'brand-marks':
      entries = await buildBrandEntries(pack.icons, manifest, cache);
      break;
    case 'brand-marks+tiles':
      entries = [
        ...await buildBrandEntries(pack.icons, manifest, cache),
        ...await buildTileEntries(pack.tiles, manifest, cache),
      ];
      break;
    case 'tiles':
      entries = await buildTileEntries(pack.tiles, manifest, cache);
      break;
    case 'sheets':
      entries = await buildSheetEntries(pack.icons, manifest, cache);
      break;
    case 'brand-marks-all':
      entries = await buildCatchAll(manifest, cache, claimed);
      break;
    default:
      throw new Error(`${pack.id}: unknown builder "${pack.builder}"`);
  }

  const file = join(LIB_DIR, `${pack.id}.drawio`);
  const libEntries = entries.map((e) => ({
    data: e.data ?? dataUri(e.svg),
    w: e.w ?? ICON_SIZE,
    h: e.h ?? ICON_SIZE,
    title: e.title,
    aspect: e.aspect,
  }));
  const fileHash = writeLibrary(file, libEntries);

  const titleCount = new Map();
  for (const e of entries) titleCount.set(e.title, (titleCount.get(e.title) ?? 0) + 1);

  const icons = entries.map((e, index) => {
    const payload = e.data ?? dataUri(e.svg);
    const bytes = Buffer.from(payload.slice(payload.indexOf(',') + 1), 'base64');
    return {
      ...(titleCount.get(e.title) > 1 ? { ambiguousTitle: true } : {}),
      id: `${pack.id}/${e.slug}`,
      pack: pack.id,
      title: e.title,
      aliases: e.aliases,
      // Which aliases withPlurals invented. find-icon will not act unattended on
      // one of these when the title is a single word.
      ...(e.generatedAliases?.length ? { generatedAliases: e.generatedAliases } : {}),
      source: e.source,
      upstreamId: e.upstreamId,
      licence: licenceOf(e.source, manifest),
      render: e.render,
      mime: e.mime ?? 'image/svg+xml',
      width: e.width ?? ICON_SIZE,
      height: e.height ?? ICON_SIZE,
      sha256: e.sha256 ?? sha256(bytes),
      bytes: 'committed',
      libraryIndex: index,
    };
  });

  return { pack, file, fileHash, icons, count: entries.length };
}

function licenceOf(source, manifest) {
  if (source === 'aws-palette') return manifest.sources['aws-palette'].licence;
  for (const [key, src] of Object.entries(manifest.sources)) {
    if (key === source) return src.licence;
    if (src.package && source === `${src.package}@${src.version}`) return src.licence;
  }
  return 'see sources.json';
}

function onDemandEntries(pack, manifest) {
  return (pack.onDemand ?? []).map((o) => {
    const cmd = o.upstreamUrl
      ? `node scripts/fetch-logo.mjs --url ${o.upstreamUrl} --name ${o.slug}`
      : `node scripts/fetch-logo.mjs --url <logo URL from ${o.brandUrl ?? 'the vendor brand page'}> --name ${o.slug}`;
    return {
      id: `${pack.id}/${o.slug}`,
      pack: pack.id,
      title: o.title,
      aliases: o.aliases,
      source: o.source,
      upstreamId: o.slug,
      ...(o.upstreamUrl ? { upstreamUrl: o.upstreamUrl } : {}),
      ...(o.brandUrl ? { brandUrl: o.brandUrl } : {}),
      licence: o.licence,
      bytes: 'on-demand',
      reason: o.reason,
      fetch: cmd,
    };
  });
}

export async function buildAll(only = null, { quiet = false } = {}) {
  const manifest = loadManifest();
  const cache = new Map();
  mkdirSync(CACHE_DIR, { recursive: true });

  // Curated packs claim their slugs before the catch-all runs, so a mark never
  // appears twice and `brands/docker` cannot shadow `devops/docker`.
  const claimed = new Set();
  for (const p of manifest.packs) {
    for (const i of (p.icons ?? [])) {
      if (i.slug) claimed.add(i.slug);
      // A file-type sheet is the home for .json and .yaml; the bare mark in the
      // catch-all would only ever tie with it.
      if (i.glyph && i.kind === 'brand-glyph') claimed.add(i.glyph);
    }
  }

  const targets = only ? manifest.packs.filter((p) => p.id === only) : manifest.packs;
  if (only && !targets.length) throw new Error(`sources.json declares no pack "${only}"`);

  const built = [];
  for (const pack of targets) {
    const t0 = Date.now();
    const res = await buildPack(pack, manifest, cache, claimed);
    built.push(res);
    if (!quiet) {
      console.log(`  ${pack.id.padEnd(26)} ${String(res.count).padStart(5)} icons  `
        + `${(Buffer.byteLength(readFileSync(res.file)) / 1048576).toFixed(2)} MB  ${Date.now() - t0} ms`);
    }
  }

  const sourceHashes = {};
  for (const [key, opened] of cache) sourceHashes[key] = opened.sha256;
  return { manifest, built, sourceHashes };
}

function writeCatalog(manifest, built, sourceHashes) {
  const byId = new Map(built.map((b) => [b.pack.id, b]));
  const icons = [];
  const packs = [];

  for (const pack of manifest.packs) {
    const b = byId.get(pack.id);
    if (!b) continue;
    icons.push(...b.icons, ...onDemandEntries(pack, manifest));
    packs.push({
      id: pack.id,
      title: pack.title,
      description: pack.description,
      rank: pack.rank,
      file: `${pack.id}.drawio`,
      count: b.count,
      onDemand: (pack.onDemand ?? []).length,
      sha256: b.fileHash,
      ...(pack.note ? { note: pack.note } : {}),
    });
  }

  const sources = {};
  for (const [key, src] of Object.entries(manifest.sources)) {
    sources[key] = {
      ...(src.package ? { package: `${src.package}@${src.version}` } : {}),
      ...(src.url ? { url: src.url } : {}),
      terms: src.terms,
      licence: src.licence,
      ...(src.licenceUrl ? { licenceUrl: src.licenceUrl } : {}),
      ...(src.permission ? { permission: src.permission } : {}),
      ...(sourceHashes[key] && sourceHashes[key] !== 'local' ? { archiveSha256: sourceHashes[key] } : {}),
    };
  }

  const catalog = {
    generated: new Date().toISOString(),
    version: 2,
    note: 'Metadata only. Image payloads live in assets/libraries/<pack>.drawio and are read '
      + 'by libraryIndex, so a search never pulls base64 into the caller context.',
    manifest: { file: 'assets/libraries/sources.json', sha256: sha256(readFileSync(MANIFEST_FILE)) },
    sources,
    packs,
    counts: {
      packs: packs.length,
      total: icons.length,
      committed: icons.filter((i) => i.bytes === 'committed').length,
      onDemand: icons.filter((i) => i.bytes === 'on-demand').length,
    },
    icons,
  };
  mkdirSync(REF_DIR, { recursive: true });
  writeFileSync(CATALOG_FILE, `${JSON.stringify(catalog, null, 2)}\n`);
  return catalog;
}

// -------------------------------------------------------------------- verify

// Rebuilds every pack in memory and compares the result with what is committed.
// A mismatch means the libraries and the manifest have drifted apart.
export async function verify() {
  const manifest = loadManifest();
  const checks = [];
  const ok = (name, pass, detail) => checks.push({ name, pass, detail: detail ?? '' });

  const catalogExists = existsSync(CATALOG_FILE);
  ok('catalog present', catalogExists, CATALOG_FILE);
  if (!catalogExists) return checks;

  const catalog = JSON.parse(readFileSync(CATALOG_FILE, 'utf8'));
  ok('catalog built from this manifest',
    catalog.manifest?.sha256 === sha256(readFileSync(MANIFEST_FILE)),
    catalog.manifest?.sha256?.slice(0, 12) ?? 'missing');

  for (const p of catalog.packs) {
    const file = join(LIB_DIR, p.file);
    if (!existsSync(file)) { ok(`${p.id}: library present`, false, p.file); continue; }
    const actual = sha256(readFileSync(file));
    ok(`${p.id}: library matches catalog sha256`, actual === p.sha256, actual.slice(0, 12));
    const entries = readLibrary(file);
    ok(`${p.id}: ${p.count} entries`, entries.length === p.count, String(entries.length));
    const catIcons = catalog.icons.filter((i) => i.pack === p.id && i.bytes === 'committed');
    const aligned = catIcons.every((i) => entries[i.libraryIndex]?.title === i.title);
    ok(`${p.id}: catalog indices line up with the library`, aligned);
  }

  const ids = catalog.icons.map((i) => i.id);
  ok('every catalog id is unique', new Set(ids).size === ids.length,
    `${ids.length - new Set(ids).size} duplicates`);
  const noBytes = catalog.icons.filter((i) => i.bytes === 'on-demand');
  ok('no on-demand entry carries a library index',
    noBytes.every((i) => i.libraryIndex === undefined), `${noBytes.length} on-demand`);

  return checks;
}

// ----------------------------------------------------------------------- cli

async function main(argv) {
  const mode = argv[0] ?? '--list';

  if (mode === '--list') {
    const m = loadManifest();
    console.log(`${m.packs.length} packs declared in ${MANIFEST_FILE}\n`);
    for (const p of m.packs) {
      const n = (p.icons?.length ?? 0) + Object.keys(p.tiles?.concepts ?? {}).length;
      console.log(`  ${p.id.padEnd(26)} rank ${String(p.rank).padStart(2)}  `
        + `${p.builder.padEnd(18)} ${n ? `${n} listed` : 'whole source'}`
        + `${p.onDemand?.length ? `  (+${p.onDemand.length} on-demand)` : ''}`);
    }
    return;
  }

  if (mode === '--verify') {
    const checks = await verify();
    let failed = 0;
    for (const c of checks) {
      if (!c.pass) failed++;
      console.log(`${c.pass ? 'ok  ' : 'FAIL'}  ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
    }
    console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
    process.exit(failed ? 1 : 0);
  }

  if (mode === '--refresh') {
    const key = argv[1];
    if (!key) { console.error('usage: build-packs.mjs --refresh <source key>'); process.exit(2); }
    const manifest = loadManifest();
    const src = manifest.sources[key];
    if (!src) { console.error(`no source "${key}" in sources.json`); process.exit(1); }
    const url = src.type === 'npm' ? npmTarballUrl(src.package, src.version) : src.url;
    const got = await download(url, CACHE_DIR, { refresh: true });
    console.log(`${key}\n  url    ${url}\n  sha256 ${got.sha256}`);
    if (src.sha256 && src.sha256 !== got.sha256) {
      console.log(`  DRIFT  manifest pins ${src.sha256}`);
      console.log('  The upstream changed. Review the new set, then update sources.json deliberately.');
      process.exit(1);
    }
    console.log('  matches the manifest pin');
    return;
  }

  if (mode === '--all' || mode === '--pack') {
    const only = mode === '--pack' ? argv[1] : null;
    if (mode === '--pack' && !only) { console.error('usage: build-packs.mjs --pack <id>'); process.exit(2); }
    console.log(only ? `building ${only}` : 'building all packs');
    const { manifest, built, sourceHashes } = await buildAll(only);

    if (only) {
      console.log('\nBuilt one pack; the catalog is only rewritten by --all.');
      return;
    }
    const catalog = writeCatalog(manifest, built, sourceHashes);
    console.log(`\ncatalog: ${catalog.counts.total} entries `
      + `(${catalog.counts.committed} committed, ${catalog.counts.onDemand} on-demand) `
      + `across ${catalog.counts.packs} packs`);
    console.log(`         -> ${CATALOG_FILE}`);
    return;
  }

  console.error('usage: build-packs.mjs [--list|--all|--pack <id>|--verify|--refresh <source>]');
  process.exit(2);
}

if (process.argv[1] && process.argv[1].endsWith('build-packs.mjs')) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(`\nbuild failed: ${err.message}`);
    process.exit(1);
  });
}
