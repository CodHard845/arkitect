# Copilot instructions — Arkitect

This repository is **Arkitect**: a toolkit that draws native, editable
architecture diagrams — `.drawio` (Draw.io / diagrams.net) and `.excalidraw`
(Excalidraw). Everything runs locally with Node 20+ and **no dependencies**.

## When asked for a diagram

Read `AGENTS.md` at the repository root first — it is the full contract. The
short version:

- **Draw.io** for formal solution architecture, AWS-heavy designs, client-facing
  decks. **Excalidraw** for system design, block diagrams, flows, README art.
- Resolve icons *before* laying out: 4,793 marks in 18 packs for Draw.io,
  1,162 bundled library items for Excalidraw. Never substitute one product's
  mark for another — an honest, named placeholder beats a wrong logo.
- Generate from a JSON spec, validate, render, and **look at the PNG** before
  calling it done.
- Never hand over a screenshot or Mermaid as the final artifact when a real
  diagram was asked for.

```bash
node bin/arkitect.mjs                                   # every command
node bin/arkitect.mjs drawio icon "bedrock"
node bin/arkitect.mjs drawio build spec.json --out docs/arch.drawio
node bin/arkitect.mjs excalidraw icon "postgres"
node bin/arkitect.mjs excalidraw build spec.json --out docs/arch.excalidraw
node bin/arkitect.mjs excalidraw validate docs/arch.excalidraw
```

## When changing this repository

- **Node 20+, zero dependencies.** Do not add a package to make something
  easier; every script is plain Node and every helper lives in
  `skills/*/scripts/lib/`.
- **Run the suite before proposing a change:** `node tests/run-tests.mjs`.
  It is offline and deterministic. On a fresh clone some tests skip — that is
  expected; they need reference diagrams the clone does not have.
- **Do not commit anything derived from a real diagram.** No renders, no
  scene text, no file paths, no `tests/sensitive-tokens.*.sha256`. The
  `.gitignore` reflects this and the suite enforces it.
- **Style knowledge is evidence-backed.** A rule in `references/style-guide.md`
  carries its count. If you change a rule, change the generator that emits it
  (`build-diagram.mjs`) too — otherwise it is noted, not learned.
- Icons and images always **embed** in the output file, never link, so a diagram
  opens for anyone.

## Layout

| | |
|---|---|
| `bin/arkitect.mjs` | one command surface over both engines |
| `skills/arkitect-drawio/` | Draw.io engine: scripts, references, AWS icon palette |
| `skills/arkitect-excalidraw/` | Excalidraw engine: scripts, references, 36 bundled libraries |
| `skills/learn-*-style/` | user-invoked style learning, never automatic |
| `docs/` | install, agent setup, MCP, Docker, CLI, icons, testing |
| `tests/` | the offline suite |
