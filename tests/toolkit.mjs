#!/usr/bin/env node
// Repository-level checks: the CLI, the agent adapters, the docs and the shape
// of the plugin. The two engine suites test the diagram generators; this one
// tests everything that holds them together.
//
//   node tests/toolkit.mjs
//
// Offline and deterministic, like the others.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, rmSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const CLI = join(ROOT, 'bin', 'arkitect.mjs');
const TMP = join(HERE, 'output', 'toolkit');

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

const cli = (args, opts = {}) =>
  execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...opts });

if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
const marketplace = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'));

// Text files worth scanning. Binary assets and vendored libraries are excluded:
// they are other people's bytes and are verified by digest elsewhere.
const SKIP_DIRS = new Set(['.git', 'node_modules', '.analysis', 'output', 'bundled', 'libraries']);
function textFiles(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) textFiles(p, acc);
    else if (/\.(md|mdc|json|mjs|js|ps1|ya?ml|txt)$/i.test(name) && st.size < 4 * 1024 * 1024) acc.push(p);
  }
  return acc;
}
const FILES = textFiles(ROOT);

// ------------------------------------------------------------------ the CLI

test('the dispatcher points every command at a script that exists', async () => {
  const src = readFileSync(CLI, 'utf8');
  const refs = [...src.matchAll(/\[(DRAWIO|EXCALI), '([^']+\.mjs)'/g)];
  assert(refs.length >= 15, `expected the full command table, found ${refs.length}`);
  for (const [, engine, file] of refs) {
    const skill = engine === 'DRAWIO' ? 'arkitect-drawio' : 'arkitect-excalidraw';
    const p = join(ROOT, 'skills', skill, 'scripts', file);
    assert(existsSync(p), `missing script: ${relative(ROOT, p)}`);
  }
});

test('usage lists both engines and every top-level verb', () => {
  const out = cli([]);
  for (const token of ['drawio:', 'excalidraw:', 'install', 'doctor', 'where', 'version']) {
    assert(out.includes(token), `usage does not mention ${token}`);
  }
});

test('version matches package.json, and where prints the repository root', () => {
  eq(cli(['version']).trim(), pkg.version, 'reported version');
  eq(resolve(cli(['where']).trim()), resolve(ROOT), 'reported root');
});

test('an unknown engine or verb fails loudly rather than doing something', () => {
  for (const args of [['nonsense'], ['drawio', 'nonsense']]) {
    let code = 0;
    try { cli(args, { stdio: 'pipe' }); } catch (e) { code = e.status; }
    eq(code, 2, `"${args.join(' ')}" should exit 2`);
  }
});

test('doctor reports the bundled assets as present', () => {
  const out = cli(['doctor']);
  for (const line of ['draw.io icon packs', 'draw.io AWS pack', 'excalidraw libraries', 'plugin manifest', 'agent contract']) {
    const row = out.split('\n').find((l) => l.includes(line));
    assert(row, `doctor does not check ${line}`);
    assert(row.startsWith('ok'), `doctor says: ${row.trim()}`);
  }
});

test('both engines dispatch through to a real search', () => {
  const drawio = JSON.parse(cli(['drawio', 'icon', 'bedrock']));
  assert(drawio.matches?.length > 0, 'no draw.io icon match for "bedrock"');
  const excali = JSON.parse(cli(['excalidraw', 'icon', 'postgres']));
  assert(excali.matches?.length > 0, 'no excalidraw icon match for "postgres"');
});

// ------------------------------------------------------------- the adapters

const adapters = await import(pathToFileURL(join(ROOT, 'bin', 'lib', 'install-agent.mjs')).href);

test('every adapter renders a block naming the install path and the engines', () => {
  for (const [name, a] of Object.entries(adapters.ADAPTERS)) {
    const block = a.render('/opt/arkitect');
    assert(block.includes('/opt/arkitect'), `${name}: does not carry the install path`);
    const lower = block.toLowerCase();
    assert(lower.includes('draw.io') || lower.includes('drawio'), `${name}: does not name Draw.io`);
    assert(lower.includes('excalidraw'), `${name}: does not name Excalidraw`);
    assert(a.file && a.hosts, `${name}: missing file or hosts`);
  }
});

test('every alias resolves to a real adapter', () => {
  for (const [alias, target] of Object.entries(adapters.ALIASES)) {
    if (target.startsWith('--')) continue;
    assert(adapters.ADAPTERS[target], `alias ${alias} points at unknown adapter ${target}`);
  }
});

test('install writes each adapter into the target project', () => {
  const dir = join(TMP, 'project');
  mkdirSync(dir, { recursive: true });
  cli(['install', '--all', '--dir', dir]);
  for (const a of Object.values(adapters.ADAPTERS)) {
    assert(existsSync(join(dir, a.file)), `install did not write ${a.file}`);
  }
});

test('install is idempotent and leaves existing content alone', () => {
  const dir = join(TMP, 'merge');
  mkdirSync(dir, { recursive: true });
  const own = '# House rules\n\nAlways rebase.\n';
  writeFileSync(join(dir, 'AGENTS.md'), own);

  cli(['install', 'agents', '--dir', dir]);
  cli(['install', 'agents', '--dir', dir]);
  cli(['install', 'agents', '--dir', dir]);

  const after = readFileSync(join(dir, 'AGENTS.md'), 'utf8');
  eq(after.split('<!-- arkitect:begin -->').length - 1, 1, 'marker blocks after three runs');
  assert(after.includes('Always rebase.'), 'existing content was lost');
});

test('a non-merge adapter refuses to clobber without --force', () => {
  const dir = join(TMP, 'force');
  mkdirSync(join(dir, '.cursor', 'rules'), { recursive: true });
  writeFileSync(join(dir, '.cursor', 'rules', 'arkitect.mdc'), 'mine\n');

  cli(['install', 'cursor', '--dir', dir]);
  eq(readFileSync(join(dir, '.cursor', 'rules', 'arkitect.mdc'), 'utf8'), 'mine\n', 'file was replaced without --force');

  cli(['install', 'cursor', '--dir', dir, '--force']);
  assert(readFileSync(join(dir, '.cursor', 'rules', 'arkitect.mdc'), 'utf8').includes('Arkitect'), '--force did not replace it');
});

test('install refuses to write into the Arkitect checkout itself', () => {
  // It would append a copy of the pointer block, absolute path and all, to the
  // very contract file the block tells agents to read.
  const before = readFileSync(join(ROOT, 'AGENTS.md'), 'utf8');
  let code = 0;
  try { cli(['install', '--all'], { cwd: ROOT, stdio: 'pipe' }); } catch (e) { code = e.status; }
  eq(code, 2, 'self-install should exit 2');
  eq(readFileSync(join(ROOT, 'AGENTS.md'), 'utf8'), before, 'AGENTS.md was modified');
});

test('--print writes nothing to disk', () => {
  const dir = join(TMP, 'print');
  mkdirSync(dir, { recursive: true });
  const out = cli(['install', 'agents', '--print', '--dir', dir]);
  assert(out.includes('Arkitect'), '--print produced no block');
  eq(readdirSync(dir).length, 0, '--print wrote files');
});

test('this repository ships the adapters it advertises', () => {
  for (const p of [
    '.cursor/rules/arkitect.mdc',
    '.cursor/commands/diagram.md',
    '.opencode/command/diagram.md',
    '.codex/prompts/diagram.md',
    '.github/copilot-instructions.md',
    'AGENTS.md',
  ]) {
    assert(existsSync(join(ROOT, p)), `missing committed adapter: ${p}`);
  }
});

// ------------------------------------------------------------------- shape

test('the plugin, marketplace and package manifests agree', () => {
  eq(manifest.name, pkg.name, 'plugin vs package name');
  eq(marketplace.plugins[0].name, manifest.name, 'marketplace vs plugin name');
  assert(existsSync(join(ROOT, pkg.bin.arkitect)), 'package.json bin points at a missing file');
  assert(manifest.description.length > 40, 'plugin description is too thin to be useful');
});

test('all four skills are well formed, and only the learning ones are manual', () => {
  const skills = readdirSync(join(ROOT, 'skills')).sort();
  eq(skills.join(','), 'arkitect-drawio,arkitect-excalidraw,learn-drawio-style,learn-excalidraw-style', 'skill directories');
  for (const s of skills) {
    const md = readFileSync(join(ROOT, 'skills', s, 'SKILL.md'), 'utf8');
    assert(/^---\r?\n/.test(md), `${s}: no YAML frontmatter`);
    assert(md.includes(`name: ${s}`), `${s}: frontmatter name does not match the directory`);
    const manual = s.startsWith('learn-');
    eq(md.includes('disable-model-invocation: true'), manual, `${s}: wrong invocation mode`);
  }
});

test('the agent contract states the rules an agent must not get wrong', () => {
  const md = readFileSync(join(ROOT, 'AGENTS.md'), 'utf8');
  for (const rule of ['open_drawio_xml', 'placeholder', 'never', 'bin/arkitect.mjs']) {
    assert(md.toLowerCase().includes(rule.toLowerCase()), `AGENTS.md does not mention ${rule}`);
  }
  assert(md.includes('.drawio') && md.includes('.excalidraw'), 'AGENTS.md does not name both formats');
});

// -------------------------------------------------------------- hygiene

test('no committed file carries an absolute path from someone machine', () => {
  const patterns = [/C:[\\/]Users[\\/]/i, /\/home\/[a-z][a-z0-9_-]+\//, /\/Users\/[a-z][a-z0-9_-]+\//i];
  const hits = [];
  for (const f of FILES) {
    const s = readFileSync(f, 'utf8');
    for (const re of patterns) {
      // The docs legitimately show Windows install locations under Program Files
      // and a placeholder home; only a real user directory is a problem.
      const m = s.match(re);
      if (m && !/C:\\path\\to|\/path\/to|\$env:USERPROFILE|~\//.test(m.input.slice(Math.max(0, m.index - 20), m.index + 40))) {
        hits.push(`${relative(ROOT, f)}: ${m[0]}`);
      }
    }
  }
  assert(hits.length === 0, `absolute user paths committed:\n        ${hits.slice(0, 10).join('\n        ')}`);
});

test('no file still refers to a pre-merge project name', () => {
  // Assembled at runtime so this check does not trip over its own source.
  const legacy = [['aws', 'archkit'], ['excali', 'archkit'], ['learn', 'architecture-example'],
    ['learn', 'excalidraw-example']].map((parts) => parts.join('-'));
  const hits = [];
  for (const f of FILES) {
    const s = readFileSync(f, 'utf8');
    for (const name of legacy) if (s.includes(name)) hits.push(`${relative(ROOT, f)}: ${name}`);
  }
  assert(hits.length === 0, `stale names:\n        ${hits.slice(0, 10).join('\n        ')}`);
});

test('every relative link in the docs resolves', () => {
  const broken = [];
  const docs = FILES.filter((f) => f.endsWith('.md') || f.endsWith('.mdc'));
  for (const f of docs) {
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(/\]\(([^)#\s]+)(#[^)\s]*)?\)/g)) {
      const target = m[1];
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      const p = resolve(dirname(f), target);
      if (!existsSync(p)) broken.push(`${relative(ROOT, f)} -> ${target}`);
    }
  }
  assert(broken.length === 0, `broken links:\n        ${broken.slice(0, 15).join('\n        ')}`);
});

test('the README shows images that are actually committed', () => {
  const s = readFileSync(join(ROOT, 'README.md'), 'utf8');
  const imgs = [...s.matchAll(/<img src="([^"]+)"/g), ...s.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)]
    .map((m) => m[1]).filter((p) => !/^https?:/.test(p));
  assert(imgs.length >= 2, 'the README should show what the output looks like');
  for (const p of imgs) assert(existsSync(join(ROOT, p)), `README image missing: ${p}`);
});

test('the licence and attribution files are present and name their sources', () => {
  assert(readFileSync(join(ROOT, 'LICENSE'), 'utf8').includes('MIT License'), 'LICENSE');
  const notice = readFileSync(join(ROOT, 'NOTICE'), 'utf8');
  for (const source of ['AWS Architecture Icons', 'Azure architecture icons', 'Google Cloud icons',
    'simple-icons', 'devicon', 'lucide-static', 'octicons',
    'libraries.excalidraw.com', 'Trademark']) {
    assert(notice.includes(source), `NOTICE does not cover ${source}`);
  }
  // A vendor permission is not a licence, and the distinction has to survive edits.
  assert(notice.includes('PERMISSIONS, not licences'),
    'NOTICE must distinguish vendor permissions from licences');
  assert(notice.includes('NOT A LICENCE ON A TRADEMARK'),
    'NOTICE must say a CC0 icon is not a trademark licence');
  const attribution = readFileSync(
    join(ROOT, 'skills', 'arkitect-excalidraw', 'assets', 'libraries', 'bundled', 'ATTRIBUTION.md'), 'utf8');
  assert(attribution.split('\n').filter((l) => l.startsWith('| `')).length >= 30, 'library authors are not credited');

  // The Draw.io packs carry their own generated attribution, one row per source.
  const packs = readFileSync(
    join(ROOT, 'skills', 'arkitect-drawio', 'assets', 'libraries', 'ATTRIBUTION.md'), 'utf8');
  for (const source of ['simple-icons@16.30.0', 'devicon@2.17.0', 'lucide-static@1.45.0',
    '@primer/octicons@19.36.0', 'azure-v24', 'gcp-legacy']) {
    assert(packs.includes(source), `pack attribution does not name ${source}`);
  }
  assert(packs.includes('nominative use'), 'pack attribution must state the trademark position');
});

test('gitignore keeps derived and third-party material out of the repository', () => {
  const gi = readFileSync(join(ROOT, '.gitignore'), 'utf8');
  for (const rule of ['.analysis/', 'tests/output/', 'sensitive-tokens', 'assets/logos/', 'assets/icons/']) {
    assert(gi.includes(rule), `.gitignore does not cover ${rule}`);
  }
  assert(gi.includes('!skills/arkitect-excalidraw/assets/libraries/bundled/'),
    'the bundled libraries must stay committed - they are the offline icon source');
});

// -------------------------------------------------------------

console.log(`\n${pass} passed, ${fail} failed, ${skip} skipped`);
if (fail) { console.log('\nfailures:'); for (const f of failures) console.log(`  - ${f}`); process.exit(1); }
