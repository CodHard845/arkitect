#!/usr/bin/env node
// Render an icon pack as a labelled grid, so a human can see what actually got
// built. Structural checks prove a library parses and hashes; they cannot
// notice that "Cloud Run" is wearing Cloud Scheduler's artwork. That needs eyes.
//
//   node contact-sheet.mjs --pack devops           write the HTML sheet
//   node contact-sheet.mjs --pack devops --png     ...and rasterise it
//   node contact-sheet.mjs --all --png             every pack worth reviewing
//
// The HTML is local and self-contained: every icon is already a data URI in the
// library, so nothing is fetched while the sheet renders.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, renameSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readLibrary } from './lib/drawio-core.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = join(HERE, '..');
const LIB_DIR = join(SKILL_ROOT, 'assets', 'libraries');
const SHEET_DIR = join(LIB_DIR, 'contact-sheets');
const CATALOG_FILE = join(SKILL_ROOT, 'references', 'icon-catalog.json');

// The catch-all is 3,000+ marks from one CC0 source at a pinned version; a sheet
// of it would be megabytes of PNG telling you what the pin already tells you.
const SKIP = new Set(['brands']);

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function sheetHtml(pack, entries) {
  const cells = entries.map((e, i) => `<figure><img src="${e.dataUri}" alt="${esc(e.title)}">`
    + `<figcaption><b>${esc(e.title)}</b><span>${i}</span></figcaption></figure>`).join('');
  return `<!doctype html><meta charset="utf-8"><title>${esc(pack.title)} contact sheet</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; padding: 28px 32px 40px; background: #fff;
         font: 13px/1.45 "Segoe UI", system-ui, sans-serif; color: #1b2733; }
  header { margin-bottom: 22px; border-bottom: 2px solid #e3e9ef; padding-bottom: 14px; }
  h1 { margin: 0 0 4px; font-size: 20px; letter-spacing: -0.01em; }
  .meta { color: #5b6b7c; font-size: 12.5px; }
  .grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 14px 10px; }
  figure { margin: 0; display: flex; flex-direction: column; align-items: center;
           gap: 6px; padding: 10px 4px 8px; border: 1px solid #edf1f5; border-radius: 8px; }
  img { width: 56px; height: 56px; object-fit: contain; }
  figcaption { text-align: center; font-size: 10.5px; line-height: 1.3; color: #35485c;
               word-break: break-word; display: flex; flex-direction: column; gap: 1px; }
  figcaption span { color: #9aa8b6; font-size: 9px; }
</style>
<header><h1>${esc(pack.title)}</h1>
<div class="meta">${entries.length} icons &middot; <code>${esc(pack.file)}</code> &middot; ${esc(pack.description ?? '')}</div></header>
<div class="grid">${cells}</div>`;
}

function findChrome() {
  for (const p of CHROME_CANDIDATES) if (existsSync(p)) return p;
  return null;
}

function rasterise(htmlPath, pngPath, height) {
  const chrome = findChrome();
  if (!chrome) {
    console.log('    (no Chrome found - open the HTML yourself to review it)');
    return false;
  }
  const tmp = join(SHEET_DIR, '.shot');
  mkdirSync(tmp, { recursive: true });
  execFileSync(chrome, [
    '--headless', '--disable-gpu', '--hide-scrollbars',
    `--screenshot=${pngPath}`,
    `--window-size=1600,${Math.min(height, 30000)}`,
    `--user-data-dir=${tmp}`,
    `file:///${htmlPath.replace(/\\/g, '/')}`,
  ], { stdio: 'pipe', timeout: 120000 });
  return existsSync(pngPath);
}

function build(packId, { png = false } = {}) {
  const catalog = JSON.parse(readFileSync(CATALOG_FILE, 'utf8'));
  const pack = catalog.packs.find((p) => p.id === packId);
  if (!pack) throw new Error(`no pack "${packId}" in the catalog`);

  const entries = readLibrary(join(LIB_DIR, pack.file));
  mkdirSync(SHEET_DIR, { recursive: true });
  const htmlPath = join(SHEET_DIR, `${packId}.html`);
  writeFileSync(htmlPath, sheetHtml(pack, entries));

  // 12 across, ~104px per row, plus the header.
  const height = 140 + Math.ceil(entries.length / 12) * 104;
  let pngPath = null;
  if (png) {
    pngPath = join(SHEET_DIR, `${packId}.png`);
    if (!rasterise(htmlPath, pngPath, height)) pngPath = null;
  }
  return { pack, count: entries.length, htmlPath, pngPath };
}

function main(argv) {
  const png = argv.includes('--png');
  const catalog = JSON.parse(readFileSync(CATALOG_FILE, 'utf8'));
  const ids = argv.includes('--all')
    ? catalog.packs.map((p) => p.id).filter((id) => !SKIP.has(id))
    : [argv[argv.indexOf('--pack') + 1]].filter(Boolean);

  if (!ids.length) {
    console.error('usage: contact-sheet.mjs (--pack <id> | --all) [--png]');
    process.exit(2);
  }

  for (const id of ids) {
    const r = build(id, { png });
    console.log(`  ${id.padEnd(26)} ${String(r.count).padStart(5)} icons  -> `
      + `${r.pngPath ? 'contact-sheets/' + id + '.png' : 'contact-sheets/' + id + '.html'}`);
  }
  if (SKIP.size && argv.includes('--all')) {
    console.log(`\nskipped: ${[...SKIP].join(', ')} (catch-all packs, see sources.json for the pin)`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('contact-sheet.mjs')) main(process.argv.slice(2));
