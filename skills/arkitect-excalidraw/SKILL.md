---
name: arkitect-excalidraw
description: Create or edit editable Excalidraw (.excalidraw) diagrams — system and solution architectures for any cloud or stack, software component and block diagrams, data pipelines, agentic/LLM systems, network and deployment views, flows and decision paths — in a hand-drawn house style, using Excalidraw's own default libraries plus custom icons built from real product logos. Use whenever the request involves an Excalidraw scene or library, an architecture or block diagram wanted in a sketchy style, an icon built from a product logo, or an edit to an existing .excalidraw file.
---

# Architecture diagrams in Excalidraw

Produces native, editable `.excalidraw` JSON — never a flattened image, never
Mermaid as the final artifact. General purpose: any cloud, any stack, any kind
of system.

Scripts live in `${CLAUDE_PLUGIN_ROOT}/skills/arkitect-excalidraw/scripts`.
Read `references/style-guide.md` before laying anything out and
`references/pattern-catalog.md` to pick a starting shape.
`references/excalidraw-format.md` is the schema reference for hand-editing.

**The style is learned, and the guide says from what.** It rests on a corpus of
9 designated real-world scenes (3,270 elements), analysed 2026-09-08; every rule
carries its count and `source-analysis.json` version 1 holds the full
distributions. A few rules the corpus does not settle are still marked
`default` there — say which is which if asked, rather than presenting a default
as an observation. `/learn-excalidraw-style` folds in further examples.

Four findings contradict what a generator would do by default. They are already
the generator's defaults; do not undo them by hand:

- **Connectors are elbow arrows** (`elbowed: true`, 70% of 165), stroke width 4.
- **Edge captions are free text beside the line** — not one arrow in the corpus
  carries a bound label.
- **Regions are dashed rectangles, not frames** — 21 of them, zero frames.
- **Captions sit below the shape** as free text at size 20; labels are free
  text 91% of the time.

## Workflow

1. **Understand the system.** Ask only for facts you cannot infer: the
   components, what flows between them, and the trust or ownership boundaries.
   Do not interrogate the user about styling — that is what this skill is for.

2. **Pick a pattern and state assumptions.** Choose the nearest entry in
   `references/pattern-catalog.md`. Write every architectural assumption down;
   they go in the final report and, where they matter, in a note on the canvas.

3. **Resolve icons from the bundled libraries.** 36 Excalidraw libraries ship
   with the plugin — 1,162 items covering AWS, Azure, GCP, Snowflake, the data
   platform stack, DevOps tooling and general IT logos. This is the primary
   source; search it for every named product:
   ```bash
   node scripts/find-icon.mjs "postgres"
   node scripts/find-icon.mjs --stats
   ```

   239 of those items carry no name and cannot be found by searching. When a
   search comes up short, check whether the product is sitting in one of those
   libraries unnamed — the numbered contact sheets are committed, so read the
   PNG and reference the item by number:
   ```bash
   node scripts/index-libraries.mjs --unnamed
   # then look at assets/libraries/bundled/sheets/<slug>.png and use "<slug>:<n>"
   ```

   **Still nothing? Use a placeholder and move on.** Set the node's `kind` to
   `placeholder`, or leave `kind: "icon"` with an unresolvable name — either
   way the generator draws a dotted violet square with a `?`, captioned with
   the component name, and lists it under `placeholders` in the build report.
   Say in your report which slots are empty so they can be filled by hand.

   Do **not** go and fetch a logo off the web unless the user asks for it. And
   never use one product's mark for another — a placeholder is honest, a wrong
   logo is not.

   Two routes exist for when the user does want one built:
   - **The public catalogue** — the same one the app's "Browse libraries"
     button opens. See [Libraries](#the-public-library-catalogue).
   - **Trace it from the real logo.** See [Icons](#building-an-icon-from-a-logo).

4. **Generate.** Write a spec and build it. This applies the style tokens,
   binds every arrow to its shapes, sizes boundaries from their contents and
   keeps the layout collision-free:
   ```bash
   node scripts/build-diagram.mjs my-spec.json --out "path/to/architecture.excalidraw"
   ```
   Two worked examples ship, both committed with the scene and a PNG beside the
   spec. **Look at the PNG before writing a spec** — it is faster than reasoning
   about the rules, and it is what the output is supposed to look like.

   - `assets/templates/starter-architecture.spec.json` — the small tour: every
     node kind, every connector kind, the generated legend. Read this first for
     the *vocabulary*.
   - `assets/templates/aws-data-platform.spec.json` — a large, detailed cloud
     architecture, 48 nodes from one bundled library. Read this for the *shape*
     of a real answer: column-per-phase regions, a role caption under an icon
     that already draws its own product name, a sublabel carrying the scaling or
     availability fact, an error lane along the bottom whose recovery loop
     closes back into the flow, a cross-cutting band that is labelled rather
     than wired to everything, assumptions in a note on the canvas, and
     fractional `col`/`row` values for anything off the main grid.

   Hand-written JSON is fine too — read `references/excalidraw-format.md` first,
   particularly the parts about relative arrow points and two-sided bindings.

5. **Never overwrite blind.** `build-diagram.mjs` writes a timestamped sibling
   backup before replacing an existing file. Editing by any other route means
   calling `backupExisting()` or copying the file yourself first.

6. **Validate.**
   ```bash
   node scripts/validate-excalidraw.mjs "path/to/architecture.excalidraw"
   ```
   Errors block delivery — they are the things that make Excalidraw drop an
   element or show an empty image box. Warnings about overlaps and tight labels
   are judgement calls; check them against the render.

7. **Render and actually look at it.**
   ```powershell
   ./scripts/render-excalidraw.ps1 -Path "path/to/architecture.excalidraw" -OutDir .analysis/renders -Width 2200
   ```
   Read the PNG back as an image. Iterate until spacing, hierarchy, routing and
   label legibility hold up. A scene that validates but reads badly is not done.

   The preview is geometry-faithful, not pixel-faithful: Excalidraw's fonts are
   not installed outside the app, so text is substituted and runs a little wide,
   and fills are flat. Judge layout from it, not typography. `-Style clean`
   drops the hand-drawn stroke and is easier to read when the question is
   whether something collides.

   Three things the first render nearly always shows, all fixed in the spec:

   - **A one-column region cannot hold a long label.** The label is free text at
     the box's top-left and is not clipped, so it runs into the next region's
     label. Name a narrow region in one or two words and let the node sublabels
     carry the detail.
   - **The generated elbow route ignores obstacles.** It leaves at the midpoint
     between the two shapes, so a two-row jump in the same column, or any hop
     over a third icon, is drawn straight through it. `"route": "straight"` on
     that one edge is usually the fix; a short diagonal reads better than a line
     through a logo.
   - **Adjacent elbows stack into one line.** Several edges crossing the same
     gutter put their vertical legs at the same midpoint x; if their spans touch,
     they render as a single long line and the diagram grows a phantom bus. Give
     one of them `"route": "straight"`.

8. **Open it in the container** when the user wants to see or edit the real
   thing — and always before claiming it looks right in Excalidraw itself:
   ```powershell
   ./scripts/excalidraw-docker.ps1 -Open -Path "path/to/architecture.excalidraw"
   ```
   The app has no backend and cannot read the disk, so this starts the
   container, opens the browser and reveals the file in Explorer to drag onto
   the canvas. See [The local container](#the-local-container).

9. **Report.** File path, assumptions made, validation and render results, which
   icons came from where, anything that could not be resolved, and any
   deliberate deviation from the style guide.

## The bundled libraries

36 libraries, 1,162 items, all native vector geometry — not one embedded image
in the set, so every mark scales, recolours and can be pulled apart in the app.

```bash
node scripts/index-libraries.mjs                 # one line per library
node scripts/index-libraries.mjs --items gcp-icons
node scripts/index-libraries.mjs --unnamed       # the ones you have to look at
node scripts/index-libraries.mjs --stats
```

Reference an item in a spec either by product name, which searches, or by
`<slug>:<n>`, which does not:

```json
{ "kind": "icon", "icon": "snowflake",   "label": "Snowflake", "col": 0, "row": 0 }
{ "kind": "icon", "icon": "gcp-icons:37", "label": "Pub/Sub",  "col": 1, "row": 0 }
```

Worth knowing:

- **Many items draw their own name.** Most of the AWS, Azure and data-platform
  marks include the product name as text. The generator detects that and skips
  its own caption rather than printing the name twice; the build report lists
  those nodes under `icons.selfCaptioned`.
- **Styles differ between libraries.** An AWS mark is a hachure-filled square,
  a GCP mark is flat blue line-art, an IT logo is a black glyph. Mixing three
  libraries in one diagram looks like mixing three libraries. Prefer one
  library per diagram where the coverage allows it.
- Credits and licences: `assets/libraries/bundled/ATTRIBUTION.md`. Every
  library belongs to its author.
- Added or removed a `.excalidrawlib`? Rerun
  `node scripts/index-libraries.mjs --build`. A test fails if the index and the
  files disagree.

## Building an icon from a logo

For a product no bundled library covers — and only when the user asks, since a
placeholder is the default answer. `--trace` turns a flat SVG into native
Excalidraw geometry, which is what keeps it consistent with the bundled marks.

```bash
node scripts/make-icon.mjs --url https://.../dbt.svg --name dbt --trace --label "dbt"
node scripts/make-icon.mjs --url https://.../logo.png --name acme
node scripts/make-icon.mjs --file ~/Downloads/logo.svg --name acme --trace
node scripts/make-icon.mjs --list
node scripts/make-icon.mjs --inspect dbt
node scripts/make-icon.mjs --restyle dbt --trace --monochrome --size 96
```

Then reference it in a spec by name:

```json
{ "id": "dbt", "kind": "icon", "icon": "dbt", "label": "dbt", "col": 2, "row": 1 }
```

**Two flavours. Prefer `--trace`.**

- `--trace` converts a flat SVG into native Excalidraw `line` elements. The icon
  becomes real geometry: it takes the hand-drawn stroke, scales cleanly,
  recolours, and can be pulled apart in the app. This is what "an Excalidraw
  icon" means, as opposed to a picture of a logo. It needs an SVG, and it is
  only honest for flat vector marks — the tracer reports gradients, clip paths,
  masks and `<text>` rather than losing them silently. If `skipped` comes back
  non-empty, look at the result before shipping it.
- Default (embedded) puts the logo in as an `image` element. Always faithful,
  works for PNG and JPEG, but it is a bitmap: it will not take the stroke and
  cannot be restyled.

**Customising.** `--size` (longest side, aspect preserved), `--label`,
`--monochrome` (flatten to one colour), `--outline` (no fills — good for a
busy mark), `--stroke #hex`, `--stroke-width`, `--roughness`. `--restyle` re-runs
any of these over bytes already on disk, so changing your mind costs no second
download.

**Finding the file.** Use WebSearch/WebFetch to locate the asset, then hand the
URL to the script — the script does the binary download, not WebFetch. Good
sources, in order: the vendor's own press-kit or brand page; Simple Icons
(`https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/<slug>.svg`) for flat
monochrome marks, which trace perfectly; the vendor's GitHub organisation avatar
or `docs/` assets; Wikimedia Commons.

**Transparency.** Every cached file is checked, and an opaque PNG is warned
about at build time as well. A logo on a baked-in white rectangle looks wrong on
the canvas and worse inside a coloured boundary — go back for a better source
rather than shipping it. SVG plus `--trace` sidesteps the problem entirely.

**Look at it.** Render the diagram and read the PNG back. Brand searches return
old logos, fan art and lookalikes, and a traced logo can come out subtly wrong;
a wrong logo is worse than no logo.

**Privacy.** Only the logo URL is ever requested. Never put a customer name,
project codename, hostname or anything from the diagram into a search query or a
URL — search the product name alone. Downloading a public asset leaks nothing;
searching `"<customer> architecture"` does.

## The public library catalogue

Excalidraw's own libraries work here, and the agent can use them directly.

```bash
node scripts/browse-libraries.mjs --search "kubernetes"
node scripts/browse-libraries.mjs --search "network" --items
node scripts/browse-libraries.mjs --install slobodan/aws-serverless.excalidrawlib
node scripts/browse-libraries.mjs --list
node scripts/browse-libraries.mjs --show aws-serverless
```

Installed items are searched by `find-icon.mjs` alongside the house icons and
referenced as `library:index` or `library:name`:

```json
{ "id": "fn", "kind": "icon", "icon": "aws-serverless:0", "label": "Lambda" }
```

**Most published libraries are format v1 and carry no item names**, so items
come back as `aws-serverless-0`, `aws-serverless-1` and so on. Do not guess
which is which — render the contact sheet and look:

```bash
node scripts/browse-libraries.mjs --preview aws-serverless --out sheet.excalidraw
```
```powershell
./scripts/render-excalidraw.ps1 -Path sheet.excalidraw -Style clean -Width 1200
```

Library authors keep their own licence and trademarks. Installed libraries are
cached locally and gitignored.

## The local container

```powershell
./scripts/excalidraw-docker.ps1 -Up        # http://localhost:3000
./scripts/excalidraw-docker.ps1 -Open -Path scene.excalidraw
./scripts/excalidraw-docker.ps1 -Library   # reveal the house icon library to drag in
./scripts/excalidraw-docker.ps1 -Status
./scripts/excalidraw-docker.ps1 -Down
```

The container is the ground truth for appearance: the real app, the real fonts,
the real renderer. Everything else here exists so it does not have to be opened
for every small check.

It is the same static app as excalidraw.com with **no backend** — scenes live in
the browser and in the files on disk, so nothing drawn is uploaded. Two
consequences: there is no server-side save (the `.excalidraw` file is the source
of truth), and the app cannot open a file off the disk by itself, which is why
`-Open` reveals it in Explorer to drag in.

## Editing an existing scene

- Never read a whole scene with embedded images into context — they run to
  megabytes of base64. Summarize it instead:
  ```bash
  node scripts/analyze-excalidraw.mjs "<file>"            # structure and style tokens
  node scripts/analyze-excalidraw.mjs "<file>" --cells    # geometry table, no text
  node scripts/analyze-excalidraw.mjs "<file>" --images   # embedded image inventory
  ```
- Then make a targeted, backup-protected edit and re-validate.
- Keep bindings two-sided. `repairBindings()` in the core library fixes imported
  content; the validator fails a scene where one side is missing.
- Match the scene you are editing, not this style guide. If the existing diagram
  uses `roughness: 0` and sharp corners, so does your addition — say in the
  report that you followed the file rather than the guide.

## Non-negotiables

- Editable `.excalidraw` JSON is the deliverable.
- Every arrow bound at both ends, so the diagram survives being dragged around.
- Images embedded in the scene's `files`, never linked, so it opens for anyone.
- Real icons for named products, from the bundled libraries first. Where none
  exists, a placeholder that is obviously empty — never one product's mark
  standing in for another, and never a grey box passed off as finished.
- Every placeholder named in the report, so nothing unfinished ships silently.
- Excalidraw's font-size steps and stroke widths; its default palette plus the
  five house accents in `HOUSE_ACCENTS`, and a product's own brand colour where
  the diagram is about that product.
- A legend whenever more than one connector kind is used.
- Assumptions written on the canvas, not just in chat.
- Keep the user's diagrams local. Nothing is ever uploaded; the only network
  requests are for public logos and the public library catalogue, and nothing
  from the diagram goes into a query.
