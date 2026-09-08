# Building icons from logos

**Try the bundled libraries first** — 1,162 marks covering most of what a cloud
or data architecture needs, with no download. See [excalidraw-libraries.md](excalidraw-libraries.md).
This page is for the product none of them has.

If that product is not worth a detour, the honest answer is a **placeholder**:

```json
{ "id": "vault", "kind": "placeholder", "label": "Vault", "col": 4, "row": 1 }
```

The generator draws a dotted violet square with a `?`, captions it with the
component name, groups it so one click selects it, and lists it under
`placeholders` in the build report — then the real mark gets dropped on top in
the app. An `kind: "icon"` that resolves to nothing does the same rather than
failing. Nothing else in the vocabulary looks like that, which is the point: an
empty slot must be impossible to mistake for a finished node.

The rest of this page is the deliberate route: turning a real product logo into
a real Excalidraw icon.

```bash
S=skills/arkitect-excalidraw/scripts

node $S/make-icon.mjs --url https://.../dbt.svg --name dbt --trace --label "dbt"
node $S/make-icon.mjs --url https://.../logo.png --name acme
node $S/make-icon.mjs --file ~/Downloads/logo.svg --name acme --trace
node $S/make-icon.mjs --list
node $S/make-icon.mjs --inspect dbt
node $S/make-icon.mjs --restyle dbt --trace --monochrome --size 96
node $S/make-icon.mjs --remove dbt
```

Then in a spec:

```json
{ "id": "dbt", "kind": "icon", "icon": "dbt", "label": "dbt", "col": 2, "row": 1 }
```

## Two flavours

### Traced (`--trace`) — prefer this

A flat SVG is converted into native Excalidraw `line` elements. The icon becomes
real geometry: it takes the hand-drawn stroke like everything else on the
canvas, scales without blurring, recolours, and can be pulled apart in the app.
This is what makes it *an Excalidraw icon* rather than a picture of a logo.

It needs an SVG, and it is only honest for flat vector marks.

**What the tracer handles**: `<path>` (every command including arcs), `<rect>`,
`<circle>`, `<ellipse>`, `<polygon>`, `<polyline>`, `<line>`, nested
`transform`, `viewBox`, inherited fill and stroke, and both fill rules.

**What it does not**: gradients, clip paths, masks, filters, `<text>`, `<use>`,
stroke-to-outline conversion, embedded rasters. These are **reported**, not
silently lost — if `skipped` comes back non-empty, render the result and look at
it before shipping.

### Embedded (default)

The logo goes in as an `image` element with the bytes embedded in the scene.
Always faithful, works for PNG, JPEG, WebP and SVG. But it is a bitmap: it will
not take the hand-drawn stroke and cannot be restyled afterwards.

Use it when the mark is too complex to trace — a gradient, a photo, a wordmark
with custom type.

## Holes, and why they took work

Logos are full of shapes with holes: the counter of a letter, the gap in a
wheel, a ring. SVG expresses those by drawing the outer and inner rings in one
`<path>` and letting a **fill rule** decide what is painted.

Excalidraw has no fill rule. So the rule is evaluated during tracing and each
ring is marked filled or hole, with holes painted in the canvas colour:

- **nonzero** (the SVG default) — a region is painted when the winding number is
  not zero. An inner ring wound the same way as its container stays filled; only
  an opposite one cuts through. This is why the spokes inside the Kubernetes
  wheel stay black while the wheel itself is white.
- **even-odd** — nesting parity decides.

Counting nesting depth alone gets both wrong, and the failure mode is a logo
that renders as a solid blob or a white smear. `--outline` sidesteps the whole
question by dropping fills entirely, which suits a busy monochrome mark.

## Customising

| flag | effect |
|---|---|
| `--size N` | longest side, aspect preserved. Default 80; icons sit at 72–88 |
| `--label "X"` | caption drawn under the icon, grouped with it |
| `--monochrome` | flatten every fill to one colour |
| `--outline` | no fills at all, just strokes |
| `--stroke #hex` | the colour used by `--monochrome` and `--outline` |
| `--stroke-width N` | 1 (default for icon detail), 2, or 4 |
| `--roughness N` | 0 architect (default for icons), 1 artist, 2 cartoonist |
| `--hole-color #hex` | for a canvas that is not white |
| `--force` | replace an existing icon of the same name |

`--restyle <name>` re-runs any of these over the bytes already on disk, so
changing your mind costs no second download.

## Where to find a logo

In rough order of reliability:

1. **The vendor's own press-kit or brand page.** Authoritative, and usually
   offers a transparent SVG.
2. **Simple Icons** —
   `https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/<slug>.svg`. Flat,
   single-colour, one path: traces perfectly. Covers most of the tools that turn
   up in an architecture. Start here for `--trace`.
3. **The vendor's GitHub organisation avatar** or assets under `docs/` in their
   repo.
4. **Wikimedia Commons.**

Use WebSearch/WebFetch to *find* the URL; hand the URL to the script, which does
the binary download.

## Transparency

A logo baked onto a white rectangle looks wrong on the canvas and worse inside a
coloured boundary. Every cached file is checked and the result recorded:

- **PNG** — read from the IHDR colour type. Types 6 and 4 carry an alpha
  channel; type 3 counts only with a `tRNS` chunk; types 2 and 0 are opaque.
- **SVG** — flagged when a full-canvas `<rect>` or a painted `background` is
  present.
- **JPEG / WebP** — treated as opaque; JPEG has no alpha at all.

An opaque file still caches, but the tool warns and `build-diagram.mjs` repeats
the warning in its report. Treat that as a prompt to find a better source.
"transparent png" or "logo svg" in the search usually gets you there — and an
SVG with `--trace` has no background at all.

## Look at it

Render the diagram and read the PNG back before shipping. Brand searches return
old logos, fan art and lookalikes, and a traced logo can come out subtly wrong
in a way no validation catches. A wrong logo is worse than no logo.

If you genuinely cannot find a usable one, draw a labelled shape and say so in
the report. Never use one product's mark for another.

## Privacy

Only the logo URL is ever requested — a public asset download leaks nothing.

What would leak is the **query**. Search the product name alone. Never put a
customer name, project codename, hostname or anything else from the diagram into
a search term or URL.

## The store

```
skills/arkitect-excalidraw/assets/icons/
  index.json                    kind, source URL, dimensions, transparency, digest
  <name>.svg | .png             the original bytes, kept so --restyle needs no re-download
  items/<name>.excalidrawlib    one library item per icon
  house.excalidrawlib           every icon, rebuilt on each change
```

**Gitignored.** Logos carry their own trademark and licensing terms, and a
generated scene embeds or inlines the artwork anyway, so a diagram stays portable
whether or not the store travels with it. Force-add one if you want it in the
repository:

```bash
git add -f skills/arkitect-excalidraw/assets/icons/dbt.svg
```

Drag `house.excalidrawlib` into the app to get every icon in the library sidebar
for hand-drawing:

```powershell
./skills/arkitect-excalidraw/scripts/excalidraw-docker.ps1 -Library
```

Raster icons are the caveat there: not every Excalidraw build reads image bytes
back out of a library file. Traced icons always survive, and both kinds always
work through `build-diagram.mjs`, which embeds the bytes into the scene itself.
