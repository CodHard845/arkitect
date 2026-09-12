# CLI and repository layout

Everything Arkitect does is a Node script. The dispatcher exists so you (or an
agent) need not memorise where they live.

```bash
node bin/arkitect.mjs                      # every command, one screen
node bin/arkitect.mjs doctor               # what is installed, what is optional
node bin/arkitect.mjs where                # the install path, for scripting
node bin/arkitect.mjs install --all        # write agent adapters into this project
node bin/arkitect.mjs test                 # the offline suite
```

`npm link` from the repository root puts `arkitect` on your `PATH` (no
dependencies are installed). The rest of this page writes `arkitect` for
brevity.

## Draw.io

```bash
arkitect drawio icon "bedrock"                        # search the AWS palette
arkitect drawio icon --cell n1 --label "Amazon Bedrock" --x 0 --y 0
arkitect drawio logo --url https://.../logo.svg --name snowflake
arkitect drawio logo --list
arkitect drawio logo --inspect snowflake              # size, transparency, source
arkitect drawio build spec.json --out docs/arch.drawio
arkitect drawio validate docs/arch.drawio
arkitect drawio render docs/arch.drawio --all --out-dir .analysis/renders
arkitect drawio analyze docs/arch.drawio --page 0 --cells
arkitect drawio analyze docs/arch.drawio --page 0 --images
arkitect drawio library --verify                      # 14 library invariants
arkitect drawio library --build                       # merged library + icon catalog
arkitect drawio learn --sources <files> --merge       # rebuild the style record
```

```powershell
./skills/arkitect-drawio/scripts/render-drawio.ps1 `
  -Path docs/arch.drawio -All -OutDir .analysis/renders -Width 2200
```

## Excalidraw

```bash
arkitect excalidraw icon "postgres"                   # search 1,162 bundled items
arkitect excalidraw icon --resolve gcp-icons:37       # what a spec node would draw
arkitect excalidraw icon --stats
arkitect excalidraw libraries                         # one line per bundled library
arkitect excalidraw libraries --items gcp-icons
arkitect excalidraw libraries --unnamed               # the ones you must look at
arkitect excalidraw libraries --build                 # after adding a .excalidrawlib
arkitect excalidraw browse --search "kubernetes"      # the public catalogue
arkitect excalidraw browse --install <source>
arkitect excalidraw browse --preview <slug> --out sheet.excalidraw
arkitect excalidraw make-icon --url https://.../dbt.svg --name dbt --trace
arkitect excalidraw build spec.json --out docs/arch.excalidraw
arkitect excalidraw validate docs/arch.excalidraw
arkitect excalidraw analyze docs/arch.excalidraw --cells
arkitect excalidraw render docs/arch.excalidraw --out preview.svg
arkitect excalidraw learn --sources <files> --merge
```

```powershell
./skills/arkitect-excalidraw/scripts/render-excalidraw.ps1 `
  -Path docs/arch.excalidraw -OutDir .analysis/renders -Width 2200
./skills/arkitect-excalidraw/scripts/excalidraw-docker.ps1 -Open -Path docs/arch.excalidraw
```

Any command's own `--help` is one level down: `arkitect drawio icon --help`
passes straight through to the script.

## Layout

```
bin/
  arkitect.mjs          the dispatcher
  lib/install-agent.mjs the agent adapters
.claude-plugin/         plugin + marketplace manifests (Claude Code)
.cursor/ .opencode/ .codex/ .github/
                        this repository's own agent adapters
docker/
  docker-compose.yml    the local Excalidraw app
skills/arkitect-drawio/
  SKILL.md              the Draw.io workflow contract
  references/           style-guide.md, pattern-catalog.md, icon-catalog.json,
                        source-analysis.json
  assets/libraries/     the AWS palette, the explicit export, the merge
  assets/templates/     starter spec, the built diagram, its PNG, pattern fragments
  assets/logos/         product logo cache (gitignored)
  scripts/              analysis, icon lookup, generation, validation, rendering
  scripts/lib/          the .drawio parsing core
skills/arkitect-excalidraw/
  SKILL.md              the Excalidraw workflow contract
  references/           style-guide.md, pattern-catalog.md, excalidraw-format.md,
                        source-analysis.json
  assets/libraries/bundled/   36 committed libraries, 1,162 items, contact sheets
  assets/icons/         icons built from logos (gitignored)
  assets/templates/     two worked specs, their scenes, their PNGs
  scripts/              generation, validation, rendering, icons, libraries
  scripts/lib/          scene model, SVG tracer, hand-drawn stroke generator
skills/learn-drawio-style/        user-invoked only
skills/learn-excalidraw-style/    user-invoked only
docs/                   this documentation
tests/                  run-tests.mjs (all suites), drawio.mjs, excalidraw.mjs,
                        toolkit.mjs
evals/                  eval cases, not run by default - they cost money
AGENTS.md               the agent contract
```

Scripts resolve their own paths, so they work from any working directory and
under any install route. Inside a `SKILL.md` the same scripts are addressed via
`${CLAUDE_PLUGIN_ROOT}`.

---

# The spec format

Both builders take a small JSON spec rather than raw XML or scene JSON. That is
what keeps base64 out of your context, the layout collision-free, and the style
applied without you naming a single colour.

## Draw.io spec

```json
{
  "title": "Log ingestion",
  "nodes": [
    { "id": "eb",  "kind": "icon", "icon": "eventbridge", "label": "EventBridge", "col": 0, "row": 1 },
    { "id": "fn",  "kind": "aws4", "shape": "lambda",     "label": "Processor",   "col": 1, "row": 1 },
    { "id": "sf",  "kind": "logo", "logo": "snowflake",   "label": "Snowflake",   "col": 3, "row": 1 },
    { "id": "note","kind": "note", "label": "Assumes one account per environment" }
  ],
  "boundaries": [ { "id": "cloud", "label": "AWS Cloud", "kind": "cloud" } ],
  "edges": [ { "from": "eb", "to": "fn", "kind": "flow", "label": "event" } ]
}
```

Node `kind`: `icon` (the bundled AWS palette), `logo` (a cached product logo),
`aws4` (a built-in Draw.io shape), `box`, `note`, `text`. Nodes sit on a
column/row grid and name their boundary as `parent`; boundaries span whole grid
cells. Edge `kind` is `flow`, `async`, `error`, `success` or `light`, and a
legend is generated once more than one is used.

Worked example:
`skills/arkitect-drawio/assets/templates/starter-architecture.spec.json`.
Fragments matching the pattern catalog: `assets/templates/patterns.json`.

## Excalidraw spec

```json
{
  "title": "Event-driven data platform",
  "canvasBackground": "white",
  "style": { "roughness": 1, "fontFamily": 1, "strokeWidth": 2, "rounded": true },
  "layout": { "colPitch": 300, "rowPitch": 230 },
  "boundaries": [
    { "id": "platform", "kind": "scope", "label": "Data platform", "color": "blue", "dashed": true }
  ],
  "nodes": [
    { "id": "api", "kind": "round", "label": "Ingest API", "accent": "blue", "col": 1, "row": 1, "parent": "platform" },
    { "id": "db",  "kind": "icon",  "icon": "postgres", "label": "Postgres", "col": 2, "row": 1 }
  ],
  "edges": [ { "from": "api", "to": "db", "kind": "flow", "label": "writes" } ]
}
```

| node `kind` | drawn as |
|---|---|
| `box` | sharp rectangle with a bound label |
| `round` | rounded rectangle — the default for a service |
| `ellipse` | start or end state |
| `diamond` | a decision |
| `cylinder` | a datastore, one closed silhouette plus a lid |
| `actor` | a person or external role |
| `icon` | a bundled library item or one you built, captioned underneath |
| `placeholder` | an obviously empty slot for a mark you will drop in by hand |
| `note` | a sticky note for assumptions |
| `text` | bare text |

Also `accent` (a swatch name or hex), `label`, `sublabel`, `width`, `height`,
`size`, `fontSize`, `strokeStyle`, `fillStyle`.

**Boundaries** are `kind: "scope"` (a dashed rectangle, nestable via `parent`)
or `kind: "frame"` (a real Excalidraw frame, top level only). Both are sized
from their contents, captions included, so a wide node cannot poke out of its
own boundary.

**Edges** take `kind`: `flow`, `async`, `branch`, `error`, `success`, `data`,
`light`. `routing` is `elbow` (default) or `points`; `route` shapes the path —
`auto`, `straight`, `elbow`. Labels are placed as free text beside the line.

Worked examples: `assets/templates/starter-architecture.spec.json` (small, one
of every kind) and `assets/templates/aws-data-platform.spec.json` (48 nodes,
what a real answer looks like). **Look at the PNG beside each before writing
your first spec.**

## Four things that will bite you

**Draw.io data URIs are comma-only.** A style string is semicolon-delimited, so
`data:image/svg+xml;base64,…` is cut in half by the style parser and the icon
silently disappears. Draw.io's own files use `data:image/svg+xml,<base64>`. The
scripts handle it; hand-written XML must too.

**Draw.io page indexing varies by build.** Linux arm64 Desktop 24.7.17 is
0-based; Windows x64 Desktop 29.0.3 is 1-based. The portable `.mjs` renderer
avoids that unstable interface: select a 0-based page, copy it verbatim to a
temporary single-page file, export without Desktop's `--page-index`, clean up.
There is no platform/version table. The `.ps1` is the Windows original and
retains its existing translation unchanged. See
[Page indexing across Draw.io builds](drawio-mcp.md#page-indexing-across-drawio-builds).

**Excalidraw arrow points are relative.** An arrow's `x`/`y` is its first point
and `points[0]` is `[0,0]`. Absolute coordinates in `points` move the arrow
twice.

**Excalidraw bindings are stored twice.** The arrow names its shapes and each
shape lists the arrow back. A one-sided binding drifts apart the first time
someone drags a box, so the validator treats it as an error;
`repairBindings()` fixes imported content.

Full format notes:
`skills/arkitect-excalidraw/references/excalidraw-format.md`.

## Rendering

```bash
arkitect drawio render docs/arch.drawio --page-index 0 --width 2200 --out-dir .analysis/renders --format png
arkitect drawio render docs/arch.drawio --all --drawio-exe /path/to/drawio
```

Options: `<file>` is required; `--page-index N` is 0-based (default `0`),
`--all` selects every `<diagram>`, `--width` defaults to `2200`, `--out-dir`
to `.`, and `--format` to `png`. Output names are `<base>.p<N>.<format>`.
The portable entry point is `skills/arkitect-drawio/scripts/render-drawio.mjs`.
The `.ps1` invocation above is the Windows original and remains unchanged.

For each selected page, the Node helper uses `readMxfile()` and copies the full
raw `<diagram>` element verbatim into a temporary `.drawio`, preserving the
original `<mxfile ...>` attributes. It exports without Desktop's `--page-index`
and deletes the temporary file. Compressed payloads are copied byte for byte,
not decoded/re-encoded. N is checked against the page count before any export.
One Electron launch per page; no version probing or platform-index heuristics.

`--page-index-passthrough` (boolean, default off) is a debugging escape hatch:
export the original file with Desktop's `--page-index N` unchanged, without
splitting or translation. N must still be in range, but which page Desktop
selects depends on the build. Do not use this switch for normal verification.

The normal suite tests parsing, discovery, verbatim splitting and export handling
without requiring Desktop. For the optional real two-page PNG smoke test, run
`ARKITECT_DRAWIO_SMOKE=1 node tests/drawio.mjs` (PowerShell:
`$env:ARKITECT_DRAWIO_SMOKE='1'; node tests/drawio.mjs`). This additional test
skips when Desktop is absent; no existing tests acquire new prerequisites.

Executable discovery: `--drawio-exe` (or `DRAWIO_EXE`) is a strict pin to the
build you mean, not a hint — if that path is set but not executable, the render
fails naming it instead of silently falling through to a different binary (page
indexing differs between builds). Only when neither is set does the helper
search `drawio` on PATH, then `/opt/drawio/drawio`, `/usr/bin/drawio`,
`/Applications/draw.io.app/Contents/MacOS/draw.io`,
`C:\Program Files\draw.io\draw.io.exe` and
`C:\Program Files (x86)\draw.io\draw.io.exe`, in that order. Missing-app errors
list the candidates tried. Rendering is local; never use the hosted editor.

On Linux without `DISPLAY`, the helper announces and uses `xvfb-run -a` if
available. Install Xvfb separately when needed, and set `HOME` under cron/ssh.
Only add `--disable-gpu` for observed GPU failures, or `--no-sandbox` for a
diagnosed sandbox/user-namespace failure; neither is enabled blindly.

**Calibration:** Ubuntu Raspberry Pi arm64, Draw.io Desktop 24.7.17: a
two-page copy of the committed starter template with a visible second-page
marker exported first/second/second for CLI indexes 0/1/2. Windows x64 29.0.3
instead exports the first page for both 0 and 1. These observations explain why
Arkitect splits instead of relying on Desktop indexing; they are not a version
or platform lookup table.

This Pi exports successfully without extra flags, but logs a GPU initialization
error. `--disable-gpu` suppresses it; `--no-sandbox` is not needed. This build
requires Electron flags **after the input filename** when called directly:

```bash
xvfb-run -a drawio -x -f png --width 2200 -o out.png single-page.drawio --disable-gpu
```

The helper handles that ordering. Chromium stderr warnings are noise; success
requires a fresh non-empty output. Existing outputs are backed up before
replacement. Read the PNG back before delivery. If rendering breaks after a
host update, report 🔴 and explicitly fall back to validate-only until fixed.
Never commit renders or upload real architecture; PR attachments must come
only from committed repository templates.

| | Draw.io | Excalidraw |
|---|---|---|
| command | `arkitect drawio render`, or unchanged `render-drawio.ps1` | `arkitect excalidraw render`, or `render-excalidraw.ps1` for PNG |
| needs | Draw.io Desktop; Xvfb for headless Linux | nothing (SVG) / Edge or Chrome (PNG) |
| fidelity | exact | geometry exact; fonts substituted, fills flat |

The Excalidraw preview is a preview, not an export: Excalidraw's fonts are not
installed outside the app, so text runs a little wide. `-Style clean` drops the
hand-drawn stroke and is easier to read when the question is whether something
collides. Judge layout from the preview; judge appearance in the container.
