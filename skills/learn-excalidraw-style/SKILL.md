---
name: learn-excalidraw-style
description: Teach the arkitect-excalidraw skill from additional .excalidraw examples the user explicitly designates. Replaces the shipped defaults with derived evidence, conventions and confidence levels. User-invoked only.
disable-model-invocation: true
---

# Learn from a new Excalidraw example

Folds user-designated `.excalidraw` files into the style knowledge behind the
`arkitect-excalidraw` skill. It only ever runs when the user asks for it — never
learn from a scene just because you happened to read one.

Plugin root: `${CLAUDE_PLUGIN_ROOT}`. Work from
`${CLAUDE_PLUGIN_ROOT}/skills/arkitect-excalidraw`.

This is what turns the shipped guide from *defaults* into *this user's style*.
On a fresh install `source-analysis.json` is version 0 with an empty corpus and
every convention marked `default`. After a run it carries real counts.

The record stands at version 1: 9 scenes, 3,270 elements, learned 2026-09-08.
A further run merges into that rather than replacing it.

Scratch space is `<repo root>/.analysis/` — gitignored, and where the test
suite looks for `sources.local.json`. Its `files` key is the designated list.

## Rules

- **Read-only.** Never modify, rename, move or reformat an example. Record its
  SHA-256 before and after and confirm they match.
- **Explicit designation only.** The user names the files. Do not scan
  directories for candidates.
- **Nothing confidential enters the repository.** Element text, file names,
  paths, frame names, links and image payloads stay out. `build-knowledge.mjs`
  enforces this — it emits structural statistics, style-token counts and digests
  only.
- **Preserve prior knowledge.** Use `--merge` so the record keeps its version
  history instead of being replaced.
- **Contradiction is data.** If a new example disagrees with an existing rule,
  record both readings and lower the confidence. Do not quietly rewrite history
  to make the corpus look consistent.

## Steps

1. Confirm each path exists and record hashes:
   ```bash
   sha256sum "<example.excalidraw>"
   ```
   If the files live under OneDrive they may be cloud-only placeholders, and
   every read fails with *"the cloud file provider is not running"* or *"the
   cloud operation failed"* — the bytes are not on the disk. Check with
   `Get-ChildItem … | Select Attributes`: bit `0x400000` set means cloud-only.
   Start `OneDrive.exe`, then open each file once to pull it down; retry a few
   times, since the provider refuses requests while it is still waking up.

2. Summarize each one without pulling the JSON into context:
   ```bash
   node scripts/analyze-excalidraw.mjs "<example.excalidraw>" --out /tmp/new-example.json
   ```
   A scene with embedded images is megabytes of base64; reading one whole would
   blow up the context and put diagram text into it.

3. **Look at it.** Render and inspect the image before drawing any conclusion
   about layout — the numbers say how far apart things are, not whether it
   reads well:
   ```powershell
   ./scripts/render-excalidraw.ps1 -Path "<example.excalidraw>" -OutDir .analysis/renders
   ```

4. Add it to the local source list (`<repo root>/.analysis/sources.local.json`,
   gitignored, `{"files": [...]}`) and rebuild the record over the whole corpus:
   ```bash
   node scripts/build-knowledge.mjs --sources <every example path> --merge
   ```
   This bumps `version`, appends to `history`, and recomputes every convention's
   evidence count and confidence level.

   Read the `roles` tallies, not the whole-scene ones. A scene's raw style
   counts are dominated by the line segments inside library icons; `roles`
   separates arrows, authored text, authored shapes and boundary boxes. If a
   convention you care about has no role tally, add one — a misleading count is
   worse than none.

5. **Change the generator, not just the prose.** A convention that moved and is
   not reflected in `STYLE` / `EDGE_KINDS` in `build-diagram.mjs` has been
   noted and not learned; the next diagram will still come out in the old
   style. Where the corpus needs a field the core does not emit, add it — and
   verify the field set against an element the app itself wrote, which the
   corpus is full of. That is the only in-repo check available for a
   format detail.

6. Update the prose references where the evidence actually moved:
   - `references/style-guide.md` — token or rule changes, with the new counts.
     **Remove the "these are defaults" banner once there is a real corpus**, and
     replace each `default` basis with its evidence.
   - `references/pattern-catalog.md` — a genuinely new recurring layout.
   - `arkitect-excalidraw/SKILL.md` — only the findings that change what the agent
     must do.

   Do not restate a convention whose confidence did not change.

   Things worth looking for that the tallies alone will not tell you: whether
   boundaries are frames, scope rectangles or just proximity; whether icons are
   traced, embedded or library items; whether arrows are bound or free; whether
   labels are bound to shapes or floating; whether the canvas is on a grid.

7. Rebuild **both** committed worked examples, so the shipped examples are in
   the learned style rather than the previous one:
   ```powershell
   foreach ($n in 'starter-architecture', 'aws-data-platform') {
     node scripts/build-diagram.mjs "assets/templates/$n.spec.json" `
       --out "assets/templates/$n.excalidraw" --force
     ./scripts/render-excalidraw.ps1 -Path "assets/templates/$n.excalidraw" -OutDir assets/templates
   }
   ```
   Delete the `*.backup-*.excalidraw` siblings they leave behind. Look at both
   PNGs afterwards: a style change that makes the small example look fine can
   still break the large one, where regions are narrow and edges are crowded.

8. Re-run the suite — the redaction check regenerates from the new corpus:
   ```bash
   node tests/run-tests.mjs
   ```

9. Report: what was learned, which conventions changed confidence, which
   contradicted earlier evidence, and anything the corpus does that the
   generator cannot yet produce.
