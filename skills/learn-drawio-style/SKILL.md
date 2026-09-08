---
name: learn-drawio-style
description: Teach the arkitect-drawio skill from additional .drawio examples the user explicitly designates. Updates the derived style evidence, conventions and confidence levels. User-invoked only.
disable-model-invocation: true
---

# Learn from a new architecture example

Folds user-designated `.drawio` files into the style knowledge behind the
`arkitect-drawio` skill. It only ever runs when the user asks for it — never
learn from a diagram just because you happened to read one.

Plugin root: `${CLAUDE_PLUGIN_ROOT}`. Work from
`${CLAUDE_PLUGIN_ROOT}/skills/arkitect-drawio`.

## Rules

- **Read-only.** Never modify, rename, move or reformat an example. Record its SHA-256
  before and after and confirm they match.
- **Explicit designation only.** The user names the files. Do not scan directories for
  candidates.
- **Nothing confidential enters the repository.** Labels, file names, paths, hostnames,
  URLs and business strings stay out. `build-knowledge.mjs` enforces this — it emits
  structural statistics, style tokens and digests only.
- **Preserve prior knowledge.** Use `--merge` so the record keeps its version history
  instead of being replaced.

## Steps

1. Confirm each path exists and record hashes:
   ```bash
   sha256sum "<example.drawio>"
   ```

2. Summarize it without pulling XML into context, and sanity-check the page inventory:
   ```bash
   node scripts/analyze-drawio.mjs "<example.drawio>" --out /tmp/new-example.json
   ```

3. Look at it. Render and inspect the image before drawing conclusions about layout:
   ```powershell
   ./scripts/render-drawio.ps1 -Path "<example.drawio>" -All -OutDir .analysis/renders
   ```

4. Add it to the local source list (`.analysis/sources.local.json`, gitignored) and
   rebuild the evidence record over the whole corpus:
   ```bash
   node scripts/build-knowledge.mjs --sources <every example path> --merge
   ```
   This bumps `version`, appends to `history`, and recomputes every convention's
   evidence counts and confidence level.

5. Update the prose references where the evidence actually moved:
   - `references/style-guide.md` — token or rule changes, with new counts.
   - `references/pattern-catalog.md` — a genuinely new recurring pattern.
   Do not restate a convention whose confidence did not change. If a new example
   contradicts an existing rule, record both readings and lower the confidence rather
   than silently rewriting history.

6. Re-run the suite — the redaction check regenerates from the new corpus:
   ```bash
   node tests/run-tests.mjs
   ```

7. Report: what was learned, which conventions changed confidence, and which
   contradicted earlier evidence.
