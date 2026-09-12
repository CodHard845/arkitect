// Watches the pinned upstreams for the two things a pin cannot notice by itself.
//
// Simple Icons removes a brand when its owner asks. A mark removed after our pin
// would keep shipping from here, redistributing something we have been asked not
// to (#10). And the vendor sets move on without telling anyone, so the packs
// quietly fall behind (#9).
//
// Both checks only report. Moving a mark to the on-demand tier, or re-pinning a
// source, is a reviewed pull request: a new release can rename or withdraw
// services, and a human should see that before anything changes.

import { sha256 } from './icon-build.mjs';

export const REGISTRY = 'https://registry.npmjs.org';

async function fetchJson(url) {
  const res = await fetch(url, { redirect: 'follow', headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

// Hashed in memory, never cached: a check must not replace the archive the next
// build reads, or a drifted source would stop failing the build.
async function fetchSha256(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return sha256(Buffer.from(await res.arrayBuffer()));
}

// A file-type sheet records its glyph as "icons/docker.svg"; a brand records "docker".
export const slugOf = (upstreamId) => String(upstreamId).replace(/^icons\//, '').replace(/\.svg$/, '');

// Every Simple Icons slug this repository ships bytes for, with the ids using it.
export function shippedSimpleIcons(catalog, version) {
  const out = new Map();
  for (const icon of catalog.icons) {
    if (icon.bytes !== 'committed' || icon.source !== `simple-icons@${version}`) continue;
    const slug = slugOf(icon.upstreamId);
    if (!out.has(slug)) out.set(slug, { slug, ids: [] });
    out.get(slug).ids.push(icon.id);
  }
  return out;
}

const iconsOf = (data) => {
  const list = Array.isArray(data) ? data : data?.icons;
  if (!Array.isArray(list)) throw new Error('simple-icons data is not a list of icons');
  for (const d of list) if (!d.slug) throw new Error(`simple-icons entry "${d.title}" carries no slug`);
  return list;
};

// A slug missing from the latest release is either a rename - the brand is still
// there under another slug, which is not a licensing problem - or a removal,
// which is. A rename is recognised by the title the pin knew, or by Simple
// Icons recording that title under aliases.old.
export function compareSimpleIcons(shipped, pinnedData, latestData) {
  const pinned = iconsOf(pinnedData);
  const latest = iconsOf(latestData);
  const present = new Set(latest.map((d) => d.slug));
  const titleAtPin = new Map(pinned.map((d) => [d.slug, d.title]));
  const removed = [];
  const renamed = [];
  for (const s of shipped.values()) {
    if (present.has(s.slug)) continue;
    const title = titleAtPin.get(s.slug) ?? s.slug;
    const successor = latest.find((d) => d.title === title || (d.aliases?.old ?? []).includes(title));
    if (successor) renamed.push({ ...s, title, to: successor.slug });
    else removed.push({ ...s, title });
  }
  return { removed, renamed };
}

export async function checkSimpleIcons({ catalog, manifest, get = fetchJson }) {
  const src = manifest.sources['simple-icons'];
  const { version: latest } = await get(`${REGISTRY}/${src.package}/latest`);
  const dataAt = (version) => get(src.dataUrl.replace(`@${src.version}/`, `@${version}/`));
  const pinnedData = await dataAt(src.version);
  const latestData = latest === src.version ? pinnedData : await dataAt(latest);
  const shipped = shippedSimpleIcons(catalog, src.version);
  return { pinned: src.version, latest, shipped: shipped.size, ...compareSimpleIcons(shipped, pinnedData, latestData) };
}

// A source is watched only while something we ship comes from it. The 15.x
// Simple Icons pin backs on-demand entries whose marks were withdrawn in 16, so
// a newer release of it is not news.
export async function checkDrift({ catalog, manifest, get = fetchJson, hash = fetchSha256 }) {
  const shippedFrom = new Set(catalog.icons.filter((i) => i.bytes === 'committed').map((i) => i.source));
  const rows = [];
  for (const [key, src] of Object.entries(manifest.sources)) {
    if (src.type === 'npm') {
      if (!shippedFrom.has(`${src.package}@${src.version}`)) {
        rows.push({ key, kind: 'npm', pinned: src.version, drifted: false, note: 'ships no bytes; pinned on purpose' });
        continue;
      }
      const { version } = await get(`${REGISTRY}/${src.package}/latest`);
      rows.push({ key, kind: 'npm', pinned: src.version, current: version, drifted: version !== src.version });
    } else if (src.type === 'zip') {
      if (!shippedFrom.has(key)) {
        rows.push({ key, kind: 'zip', pinned: src.sha256, drifted: false, note: 'ships no bytes' });
        continue;
      }
      const current = await hash(src.url);
      rows.push({ key, kind: 'zip', pinned: src.sha256, current, drifted: current !== src.sha256 });
    } else {
      rows.push({ key, kind: src.type, drifted: false, note: 'no upstream to compare against' });
    }
  }
  return rows;
}

const FOOTER = '_Opened by `.github/workflows/upstream-watch.yml`. Nothing in the repository was changed._';

export function removalReport(r) {
  const out = [];
  out.push(`Simple Icons \`${r.latest}\` no longer carries ${r.removed.length === 1 ? 'a mark' : `${r.removed.length} marks`} `
    + `this repository still ships bytes for, from the \`${r.pinned}\` pin. Simple Icons removes a brand when its `
    + 'owner asks, so until this is handled we are redistributing a mark we have been asked not to.', '');
  out.push('| slug | title at the pin | shipped as |', '|---|---|---|');
  for (const m of r.removed) out.push(`| \`${m.slug}\` | ${m.title} | ${m.ids.map((id) => `\`${id}\``).join(', ')} |`);
  out.push('', '### What to do', '');
  out.push('1. In `assets/libraries/sources.json`, move each mark from its pack\'s `icons` to its `onDemand` list, with '
    + `\`reason: "removed from Simple Icons ${r.latest} at the brand owner request"\` and the \`${r.pinned}\` URL - exactly how `
    + 'OpenAI, Slack and the other 15.x removals were handled.');
  out.push('2. `node skills/arkitect-drawio/scripts/build-packs.mjs --all`, then `write-pack-docs.mjs`, then `npm test`.');
  out.push('3. Only then consider moving the pin forward.');
  if (r.renamed.length) {
    out.push('', '### Also renamed upstream (not a licensing problem)', '');
    for (const m of r.renamed) out.push(`- \`${m.slug}\` (${m.title}) is now \`${m.to}\``);
  }
  out.push('', FOOTER, '');
  return out.join('\n');
}

export function driftReport(rows) {
  const drifted = rows.filter((row) => row.drifted);
  const out = [];
  out.push(`${drifted.length === 1 ? 'One pinned icon source has' : `${drifted.length} pinned icon sources have`} moved on `
    + 'upstream. The packs still build from the pins, so nothing is broken - but they are falling behind.', '');
  out.push('| source | pinned | upstream now |', '|---|---|---|');
  const short = (v) => (v && /^[0-9a-f]{64}$/.test(v) ? `sha256 \`${v.slice(0, 12)}\`` : `\`${v}\``);
  for (const row of drifted) out.push(`| \`${row.key}\` | ${short(row.pinned)} | ${short(row.current)} |`);
  out.push('', '### What to do', '');
  out.push('1. `node skills/arkitect-drawio/scripts/build-packs.mjs --refresh <source>` to fetch the new set.');
  out.push('2. Update the pin in `assets/libraries/sources.json`, rebuild with `--all`, and diff the slug sets: a service '
    + 'present today and absent afterwards is a regression to account for, not a cleanup.');
  out.push('3. Regenerate the contact sheets and look at them before opening the pull request.');
  out.push('', FOOTER, '');
  return out.join('\n');
}
