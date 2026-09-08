#!/usr/bin/env node
// Runs every suite and aggregates the result.
//
//   node tests/run-tests.mjs
//   node tests/run-tests.mjs drawio          only one of them
//   node tests/run-tests.mjs excalidraw
//   node tests/run-tests.mjs toolkit
//
// Each suite is offline, deterministic and dependency-free. Tests that need
// your own reference diagrams read their paths from .analysis/sources.local.json
// (gitignored); without it they skip, which is the expected result on a fresh
// clone.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

const SUITES = [
  { name: 'draw.io', file: 'drawio.mjs', key: 'drawio' },
  { name: 'excalidraw', file: 'excalidraw.mjs', key: 'excalidraw' },
  { name: 'toolkit', file: 'toolkit.mjs', key: 'toolkit' },
];

const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const suites = wanted.length
  ? SUITES.filter((s) => wanted.includes(s.key))
  : SUITES;

if (!suites.length) {
  console.error(`unknown suite. known: ${SUITES.map((s) => s.key).join(', ')}`);
  process.exit(2);
}

const totals = { pass: 0, fail: 0, skip: 0 };
let failed = false;

for (const suite of suites) {
  console.log(`\n=== ${suite.name} ===\n`);
  const r = spawnSync(process.execPath, [join(HERE, suite.file)], {
    stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  process.stdout.write(r.stdout ?? '');
  const m = (r.stdout ?? '').match(/(\d+) passed, (\d+) failed, (\d+) skipped/);
  if (m) {
    totals.pass += Number(m[1]);
    totals.fail += Number(m[2]);
    totals.skip += Number(m[3]);
  }
  if (r.status !== 0) failed = true;
}

console.log(`\n=== total ===\n${totals.pass} passed, ${totals.fail} failed, ${totals.skip} skipped`);
process.exit(failed ? 1 : 0);
