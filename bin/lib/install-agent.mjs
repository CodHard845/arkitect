// Wire Arkitect into whatever coding agent a project uses.
//
//   arkitect install                 what would be written, and where
//   arkitect install cursor          write the Cursor rule into this project
//   arkitect install --all           every adapter this repo knows about
//   arkitect install agents --print  print it instead of writing it
//
// Every adapter is the same short pointer block wearing the file name and
// frontmatter its host expects. It carries the absolute path of this Arkitect
// checkout so the agent can find the scripts, the skills and the icon
// libraries from any project on the machine.
//
// Writes are idempotent: the block is fenced by markers and replaced in place,
// so re-running after an update refreshes it without touching anything else in
// the file.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const BEGIN = '<!-- arkitect:begin -->';
const END = '<!-- arkitect:end -->';

const body = (root) => `## Arkitect — editable architecture diagrams

Arkitect is installed at \`${root}\`. It draws **native, editable** diagrams:
\`.drawio\` (Draw.io / diagrams.net) and \`.excalidraw\` (Excalidraw). Never hand
over a screenshot or Mermaid as the final artifact when a real diagram was asked
for.

Read \`${join(root, 'AGENTS.md')}\` for the full contract before drawing. In short:

- **Draw.io** for formal solution architecture, AWS-heavy designs, client-facing
  decks. **Excalidraw** for system design, block diagrams, flows, README art.
- **Resolve icons first** — 243 AWS Architecture Icons for Draw.io, 1,162
  bundled library items for Excalidraw. Never substitute one product's mark for
  another; use a named placeholder and say so.
- **Generate from a spec**, validate, render, and *look at the PNG* before
  calling it done.
- **Nothing is uploaded.** Diagrams stay local; only a public product logo or
  the public Excalidraw catalogue ever leaves the machine, and never with
  anything from the diagram in the query.

\`\`\`bash
node "${join(root, 'bin', 'arkitect.mjs')}"                       # every command
node "${join(root, 'bin', 'arkitect.mjs')}" drawio icon "bedrock"
node "${join(root, 'bin', 'arkitect.mjs')}" drawio build spec.json --out docs/arch.drawio
node "${join(root, 'bin', 'arkitect.mjs')}" excalidraw icon "postgres"
node "${join(root, 'bin', 'arkitect.mjs')}" excalidraw build spec.json --out docs/arch.excalidraw
\`\`\`
`;

const cursorRule = (root) => `---
description: Draw editable Draw.io and Excalidraw architecture, system and flow diagrams with Arkitect
globs:
alwaysApply: false
---

${body(root)}`;

const command = (root) => `---
description: Draw an editable architecture, system or flow diagram (Draw.io or Excalidraw)
---

Draw the diagram the user asked for using Arkitect, installed at \`${root}\`.

Read \`${join(root, 'AGENTS.md')}\` first — it is the contract. Then:

1. Choose the engine: Draw.io for formal solution architecture, Excalidraw for
   system design and flows. Say which you chose.
2. Resolve every icon before laying out. Never substitute one product's mark for
   another.
3. Write a spec, build it, validate it, render it, and look at the PNG.
4. Report the file path, your assumptions, and anything you could not resolve.

$ARGUMENTS
`;

export const ADAPTERS = {
  agents: {
    file: 'AGENTS.md',
    hosts: 'Codex, OpenCode, Antigravity, Pi, Gemini CLI, Amp, Jules, most others',
    render: body,
    merge: true,
  },
  cursor: {
    file: join('.cursor', 'rules', 'arkitect.mdc'),
    hosts: 'Cursor',
    render: cursorRule,
    merge: false,
  },
  'cursor-command': {
    file: join('.cursor', 'commands', 'diagram.md'),
    hosts: 'Cursor (/diagram)',
    render: command,
    merge: false,
  },
  copilot: {
    file: join('.github', 'copilot-instructions.md'),
    hosts: 'GitHub Copilot (VS Code, JetBrains, copilot coding agent)',
    render: body,
    merge: true,
  },
  opencode: {
    file: join('.opencode', 'command', 'diagram.md'),
    hosts: 'OpenCode (/diagram)',
    render: command,
    merge: false,
  },
};

export const ALIASES = {
  codex: 'agents',
  antigravity: 'agents',
  pi: 'agents',
  gemini: 'agents',
  generic: 'agents',
  all: '--all',
};

function upsert(existing, block) {
  const fenced = `${BEGIN}\n${block.trimEnd()}\n${END}\n`;
  if (!existing) return fenced;
  const i = existing.indexOf(BEGIN);
  const j = existing.indexOf(END);
  if (i !== -1 && j > i) return existing.slice(0, i) + fenced.trimEnd() + existing.slice(j + END.length);
  return `${existing.trimEnd()}\n\n${fenced}`;
}

export function install(root, argv) {
  const flags = new Set();
  const names = [];
  let target = process.cwd();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dir') { target = resolve(argv[++i] ?? '.'); continue; }
    if (a.startsWith('-')) { flags.add(a); continue; }
    names.push(ALIASES[a] ?? a);
  }
  const chosen = flags.has('--all') || names.includes('--all') ? Object.keys(ADAPTERS) : names;

  if (!chosen.length) {
    console.log('usage: arkitect install <adapter...> [--all] [--print] [--force] [--dir <path>]\n');
    console.log(`Writes into ${target}\n`);
    const w = Math.max(...Object.keys(ADAPTERS).map((k) => k.length));
    for (const [name, a] of Object.entries(ADAPTERS)) {
      console.log(`  ${name.padEnd(w)}  ${a.file.padEnd(34)} ${a.hosts}`);
    }
    console.log('\naliases: ' + Object.entries(ALIASES).filter(([, v]) => v !== '--all').map(([k, v]) => `${k} -> ${v}`).join(', '));
    console.log('\nClaude Code needs none of these - it loads Arkitect as a plugin:');
    console.log('  claude plugin marketplace add mouadja02/arkitect');
    console.log('  claude plugin install arkitect@arkitect');
    return 0;
  }

  // Writing the pointer block into Arkitect's own checkout would append a copy
  // of itself - with an absolute local path - to the contract file it points at.
  if (resolve(target) === resolve(root) && !flags.has('--print')) {
    console.error('refusing to install into the Arkitect checkout itself.');
    console.error('Run this from the project you want diagrams in:');
    console.error(`  cd ~/my-project && node ${join(root, 'bin', 'arkitect.mjs')} install --all`);
    console.error('Or pass --dir <path>, or --print to see the block without writing it.');
    return 2;
  }

  let bad = 0;
  for (const name of chosen) {
    const adapter = ADAPTERS[name];
    if (!adapter) {
      console.error(`unknown adapter "${name}". Known: ${Object.keys(ADAPTERS).join(', ')}`);
      bad = 2;
      continue;
    }
    const block = adapter.render(root);
    if (flags.has('--print')) {
      console.log(`----- ${adapter.file} -----\n${block}`);
      continue;
    }
    const path = join(target, adapter.file);
    const exists = existsSync(path);

    if (exists && !adapter.merge && !flags.has('--force')) {
      console.log(`skip   ${relative(target, path) || adapter.file}  (exists - pass --force to replace)`);
      continue;
    }

    const content = adapter.merge
      ? upsert(exists ? readFileSync(path, 'utf8') : '', block)
      : block;

    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    const verb = !exists ? 'write ' : adapter.merge ? 'update' : 'replace';
    console.log(`${verb} ${relative(target, path) || adapter.file}   (${adapter.hosts})`);
  }

  if (!flags.has('--print') && chosen.includes('agents')) {
    console.log('\nCodex also reads ~/.codex/prompts/*.md for slash commands, and Antigravity');
    console.log('and Pi read AGENTS.md from the project root - which is what was just written.');
  }
  return bad;
}
