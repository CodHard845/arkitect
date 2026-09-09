#!/usr/bin/env node
// Local Draw.io Desktop export. Node 20+, no runtime dependencies or uploads.
import { accessSync, constants, statSync, readFileSync, mkdirSync, existsSync, copyFileSync, unlinkSync } from 'node:fs';
import { posix, win32, resolve, basename, extname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function render(options, { platform = process.platform, env = process.env,
  isExecutable = executable, runner = spawnSync, log = console.log } = {}) {
  const source = resolve(options.file);
  let text;
  try { text = readFileSync(source, 'utf8'); }
  catch (error) { throw new Error(`No such diagram or unreadable input: ${source} (${error.code})`); }
  const exe = discoverDrawio(options.drawioExe, { platform, env, isExecutable });
  const xvfb = platform === 'linux' && !env.DISPLAY
    ? pathCandidates('xvfb-run', platform, env).find(isExecutable) : undefined;
  if (xvfb) log('No DISPLAY; using xvfb-run -a for local Draw.io export.');
  const outDir = resolve(options.outDir);
  mkdirSync(outDir, { recursive: true });
  const count = Math.max(1, (text.match(/<diagram\b/g) ?? []).length);
  const indexes = options.all ? Array.from({ length: count }, (_, i) => i) : [options.pageIndex];
  const pages = [];
  for (const index of indexes) {
    const output = join(outDir, `${basename(source, extname(source))}.p${index}.${options.format}`);
    // Calibrated: Windows Desktop 29.0.3 uses 1-based CLI indexes (legacy ps1).
    // Linux arm64 Desktop 24.7.17 uses 0-based indexes. macOS is uncalibrated:
    // assume the documented 0-based CLI behavior there until verified locally.
    const cliIndex = platform === 'win32' ? index + 1 : index;
    const args = ['-x', '-f', options.format, '--page-index', String(cliIndex),
      '--width', String(options.width), '-o', output, source];
    // Linux 24.7.17 misreads --disable-gpu before -x as the input file.
    if (options.disableGpu) args.push('--disable-gpu');
    if (options.noSandbox) args.push('--no-sandbox');
    // Remove stale output only after making a collision-safe sibling backup.
    // A fresh nonempty file, not stderr/exit status or mtime, proves export.
    const backup = backupOutput(output);
    let result;
    try { result = runner(xvfb ?? exe, xvfb ? ['-a', exe, ...args] : args, { env, encoding: 'utf8', shell: false }); }
    catch (error) { result = { error }; }
    let size = 0;
    try { const stat = statSync(output); if (stat.isFile()) size = stat.size; } catch {}
    const ok = size > 0;
    if (!ok && backup) copyFileSync(backup, output);
    log(`${ok ? `rendered page ${index}` : `page ${index} FAILED`} -> ${output} (${size} bytes)`);
    pages.push({ index, output, size, ok, backup, status: result.status });
  }
  return { ok: pages.every(p => p.ok), pages };
}

function backupOutput(output) {
  if (!existsSync(output)) return undefined;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  for (let n = 0; ; n++) {
    const backup = `${output}.backup-${stamp}${n ? `-${n}` : ''}`;
    try { copyFileSync(output, backup, constants.COPYFILE_EXCL); }
    catch (error) { if (error.code === 'EEXIST') continue; throw error; }
    unlinkSync(output);
    return backup;
  }
}

function executable(path) {
  try { accessSync(path, process.platform === 'win32' ? constants.F_OK : constants.X_OK); return statSync(path).isFile(); }
  catch { return false; }
}

function pathCandidates(name, platform, env) {
  const windows = platform === 'win32';
  const paths = (env.PATH ?? env.Path ?? '').split(windows ? ';' : ':').filter(Boolean);
  return paths.map(dir => (windows ? win32 : posix).join(dir.replace(/^"|"$/g, ''), name + (windows ? '.exe' : '')));
}

export function discoverDrawio(override, { platform = process.platform, env = process.env, isExecutable = executable } = {}) {
  const candidates = [...new Set([override, env.DRAWIO_EXE, ...pathCandidates('drawio', platform, env),
    '/opt/drawio/drawio', '/usr/bin/drawio', '/Applications/draw.io.app/Contents/MacOS/draw.io',
    'C:\\Program Files\\draw.io\\draw.io.exe', 'C:\\Program Files (x86)\\draw.io\\draw.io.exe'].filter(Boolean))];
  const found = candidates.find(isExecutable);
  if (!found) throw new Error(`Draw.io Desktop not found. Tried:\n${candidates.map(p => `  ${p}`).join('\n')}\nInstall Draw.io Desktop or set --drawio-exe / DRAWIO_EXE.`);
  return found;
}

export const USAGE = `usage: render-drawio.mjs <file> [--page-index N] [--all]
  [--width N] [--out-dir DIR] [--format png|jpg|svg|pdf|vsdx|xml|html]
  [--drawio-exe PATH] [--disable-gpu] [--no-sandbox]
Page indexes are zero-based; defaults: page 0, width 2200, directory ., PNG.
Electron flags are opt-in; --no-sandbox disables Chromium sandbox protection.`;

export function parseArgs(args) {
  const options = { file: undefined, pageIndex: 0, all: false, width: 2200,
    outDir: '.', format: 'png', drawioExe: undefined, disableGpu: false, noSandbox: false };
  const values = { '--page-index': 'pageIndex', '--width': 'width', '--out-dir': 'outDir', '--format': 'format', '--drawio-exe': 'drawioExe' };
  const switches = { '--all': 'all', '--disable-gpu': 'disableGpu', '--no-sandbox': 'noSandbox' };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (switches[arg]) { options[switches[arg]] = true; continue; }
    if (values[arg]) {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(`Expected value for ${arg}`);
      if (arg === '--width' || arg === '--page-index') {
        const n = Number(value);
        if (!/^\d+$/.test(value) || !Number.isSafeInteger(n) || n < (arg === '--width' ? 1 : 0)) {
          throw new Error(`${arg} must be a ${arg === '--width' ? 'positive' : 'non-negative'} integer`);
        }
        options[values[arg]] = n;
      } else options[values[arg]] = value;
    } else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else if (options.file) throw new Error(`Expected one file\n${USAGE}`);
    else options.file = arg;
  }
  if (!options.file) throw new Error(USAGE);
  if (!['png', 'jpg', 'jpeg', 'svg', 'pdf', 'vsdx', 'xml', 'html'].includes(options.format)) throw new Error('Unsupported format');
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let options;
  try { options = parseArgs(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 2; }
  if (options?.help) console.log(USAGE);
  else if (options) {
    try { process.exitCode = render(options).ok ? 0 : 1; }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
