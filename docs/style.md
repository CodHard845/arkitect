# The house style, and replacing it with yours

Arkitect does not ask you what colour the boxes should be. It applies a style,
and it can tell you where every rule came from.

## What ships

Each engine carries three reference files:

| | |
|---|---|
| `references/style-guide.md` | the rules in prose, each with its evidence count and a confidence level |
| `references/pattern-catalog.md` | the reusable layouts — what to reach for and when |
| `references/source-analysis.json` | the machine-readable record: full distributions, per-rule confidence, corpus digests |

Confidence is **high** (dominant and consistent), **medium** (a clear preference
with real variation), **low** (a weak signal — treat it as a hint), or
**default** (the corpus does not settle it; the rule rests on the tool's own
defaults and ordinary practice).

That last one matters. A rule marked `default` is not an observation dressed up
as one, and the agent is instructed to say which is which if you ask.

## What the record does *not* contain

No labels. No page names. No file names, paths, hostnames or URLs. No image
payloads. Nothing from any diagram's content.

What it holds is structural: counts of shapes and edges, style-token
distributions (`fontSize`, `strokeColor`, `fillStyle`, routing kinds), geometry
quantiles, and a SHA-256 per source file as an integrity anchor. A test asserts
this on every run, and the analyzers are written so that element text never
reaches the record in the first place.

```bash
node -e "const r=require('./skills/arkitect-drawio/references/source-analysis.json'); \
console.log('v'+r.version, r.corpus.files+' files,', r.conventions.length+' conventions'); \
for (const c of r.conventions) console.log(' ', c.confidence.padEnd(7), c.id)"

node bin/arkitect.mjs excalidraw learn --print
```

## Some findings contradict what a generator would do

That is the point of learning a style instead of inventing one. In the
Excalidraw record, four of them change the output the most, and they are already
the generator's defaults — do not undo them by hand:

- **Connectors are elbow arrows** at stroke width 4.
- **Edge captions are free text beside the line**, not labels bound to the arrow.
- **Regions are dashed rectangles, not frames** — 21 of them, zero frames.
- **Captions sit below the shape** as free text at size 20.

On the Draw.io side the equivalents are orthogonal routing, square corners, no
shadows, captions under icons, `#232F3E` text, and a two-size type scale (12px
body, 16px headings) that does all the work.

## Making it yours

```
/learn-drawio-style

Learn the style from these:
  C:\path\to\first.drawio
  C:\path\to\second.drawio
```

```
/learn-excalidraw-style

Learn the style from these:
  C:\path\to\first.excalidraw
```

Both skills carry `disable-model-invocation: true` — they rewrite the style
knowledge, so they never fire on their own. Reading or discussing a diagram
never triggers one.

What they do, in order: hash each file; summarize it *without* loading the
XML/JSON into context; render it and look at the image; record the paths in the
gitignored `.analysis/sources.local.json`; rebuild the record across the whole
corpus; then update the prose references where the evidence actually moved. Your
files are read-only throughout — hashes are checked before and after.

By hand:

```bash
node bin/arkitect.mjs drawio learn     --sources "C:\a.drawio" "C:\b.drawio" --merge
node bin/arkitect.mjs excalidraw learn --sources "C:\a.excalidraw" --merge
```

**`--merge` is what preserves prior knowledge.** It bumps `version`, appends to
`history`, and recomputes every convention's evidence count and confidence.
Omit it and you replace the record instead of extending it.

## Contradiction is data

If a new example disagrees with an existing rule, the record keeps **both
readings and lowers the confidence**. It does not quietly rewrite history to make
the corpus look consistent. A rule that drops from `high` to `medium` because
your diagrams do something different is the system working.

## Changing the generator, not just the prose

A convention that moved and is not reflected in the generator has been *noted*,
not *learned* — the next diagram still comes out in the old style. The style
tokens live in `STYLE` and `EDGE_KINDS` inside each engine's
`build-diagram.mjs`. The learning skills say this explicitly, and it is the step
people skip.

After a style change, rebuild the committed worked examples so the shipped
templates are in the new style, and look at both PNGs. A change that makes the
small example look fine can still break the large one, where regions are narrow
and edges crowded.

## Patterns

`pattern-catalog.md` is the other half. It holds the layouts that recur —
left-to-right pipeline, phase columns, external systems column, error lane with
a recovery loop, cross-cutting band, as-is/to-be comparison — with the spec
fragments to build them in `assets/templates/patterns.json`.

Pick the nearest pattern before laying anything out. It is the difference
between a diagram that reads and a diagram that merely contains the right boxes.
