# Changelog

All notable changes to Arkitect are recorded here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **An accuracy measure for icon resolution** (#15). `tests/icon-queries.json`
  is a 362-query answer key; the suite fails on any confident wrong answer or if
  precision at rank 1 drops below 92%, and prints the numbers on every run.
  Today: 94.5% at rank 1, zero confident wrong answers, 36 of 36 refusals held.
- **The pins are watched.** `build-packs.mjs --check-upstream` compares every
  Simple Icons slug we ship with the latest release and reports removals,
  telling a rename apart (#10). `--check-drift` compares every pinned source with
  what upstream publishes now (#9). `.github/workflows/upstream-watch.yml` runs
  the first weekly and the second quarterly. Each opens an issue, or comments on
  the open one, and never changes the repository.
- **Proof that a built library opens in Draw.io** (#12). Every committed
  library is loaded the way `EditorUi.loadLibrary` reads one, by a strict loader
  that shares no code with `readLibrary`. `drawio-desktop.yml` installs a pinned,
  checksum-verified Draw.io Desktop and exports one icon from every pack. The job
  fails on any blank page. It runs when Draw.io files change.
- The five GCP legacy marks drawn with luminance masks and filters ride along in
  that export. They render correctly, so #13 is closed with evidence and guarded
  from now on.

### Changed

- **The AWS pack is built from Amazon's official icon package** (#8). Every
  service icon from the AWS Architecture Icons package of July 2026, at 64px,
  embedded verbatim and pinned by sha256: 311 icons where the palette had 243,
  68 of them new (Braket, Chime, Connect, the Elemental media services, IoT Core
  and Greengrass, Thinkbox, Transfer Family and more). Every id the palette used
  still resolves, and its captions stay searchable. The `local-aws` special case
  in the builder is gone; AWS is an ordinary `zip-tree` pack.
- **The AgentCore rasters are 73 KB, not 4.65 MB** (#7). The service now uses
  Amazon's official SVG under both of its ids. The five feature marks Amazon has
  only published as ~1024px PNGs ship proportionally shrunk to 156px - twice their
  drawn size - by a dependency-free area-average resampler
  (`build-packs.mjs --downscale-png`), committed under `assets/libraries/local/` as
  a pinned `local-files` source. `aws.drawio` went from 7.3 MB to 1.5 MB.

### Fixed

- **A fragment of a different product's name no longer resolves confidently.**
  `tempo` resolved to Temporal, `cube` to Azure's generic "Cubes" and
  `active directory` to its Connect Health sub-product, all without comment
  (#21). A prefix now counts only when what it leaves off is a generic tail
  (`postgres` → PostgreSQL still does), and a plural the builder generated for a
  one-word vendor title is never used unattended. Scores and ranking are
  unchanged; only the confidence verdict moved. The catalog records
  `generatedAliases` so the resolver can tell them apart.
- **An icon cell fits its image instead of stretching square.** A requested
  icon size became both width and height, and cell styles set `imageAspect=0`,
  so any non-square raster was squashed. The size is now the longest side.

## [1.1.0] — 2026-09-12

Eighteen Draw.io icon packs instead of one AWS palette, and a resolver that says
when it is not sure.

### Added

- **Seventeen new icon packs**, ~4,500 new marks, built by `build-packs.mjs`
  from `assets/libraries/sources.json` — a pinned manifest where every upstream
  carries an exact version or a recorded sha256.
  - Vendor sets, embedded verbatim: `azure` (638), `gcp` (249).
  - Curated: `data-platforms`, `databases`, `ai-frameworks`, `ml-training`,
    `streaming-orchestration`, `observability`, `devops`, `security-identity`,
    `github`, `saas-collab`, `languages-runtimes`.
  - Generated from Lucide and Octicon glyphs: `agents` (33 agent-architecture
    concepts), `primitives` (43 generic concepts), `file-types` (35 document
    sheets badged with an extension).
  - `brands` (3,158) as a catch-all, ranked strictly below every curated pack.
- **Pack-aware resolution.** `find-icon.mjs` ranks across every pack, gains
  `--list-packs`, `--pack` and `--context`, and returns a confidence verdict
  with alternatives instead of always handing back its best guess.
- **Spec-level icon steering.** `context.packs` on a spec biases ties toward the
  stack being drawn; `pack` on a node pins it outright.
- **On-demand catalogue entries.** 69 products whose marks carry no
  redistribution licence are catalogued with a URL, a licence note and the exact
  `fetch-logo` command — and no bytes. `build-diagram.mjs` refuses to draw them
  rather than substituting another product's mark.
- **Contact sheets** for every pack, committed as PNGs, because no structural
  check can notice that a service is wearing the wrong artwork.
- `contact-sheet.mjs` and `write-pack-docs.mjs`; `arkitect drawio packs` and
  `arkitect drawio sheets`.
- `references/pack-index.md` and `assets/libraries/ATTRIBUTION.md`, both
  generated from the catalog so they cannot drift from what shipped.

### Changed

- **Icon titles are readable.** `Arch Amazon-Route-53 64` is now
  `Amazon Route 53`. The old palette captions, plural forms and acronyms are all
  kept as aliases, so `s3`, `data factory` and
  `Arch Amazon-Simple-Storage-Service 64` all still resolve.
- `icon-catalog.json` is pack-aware: namespaced ids, per-icon licence and
  source, and `bytes: committed | on-demand`. Still metadata only.
- `arkitect drawio library` is now `arkitect drawio packs`.

### Removed

- `AWS-v1.drawio` and `AWS-icons.merged.drawio` were content-identical, and
  `AWS-icons.drawio.xml` was a 237-entry subset missing the six AgentCore
  icons. One survives as `aws.drawio` with its artwork untouched; deleting the
  other two reclaims 8.8 MB, which nearly pays for everything added above.
- `extract-library.mjs`, which verified that two AWS palettes byte-matched.
  `build-packs.mjs --verify` checks what matters now: that every committed
  library still matches the manifest it was built from.

### Fixed

- Simple Icons lists "Terraform" as an alias of OpenTofu, which put a fork one
  point behind the real product. The catch-all no longer carries names a curated
  pack already owns.

## [1.0.0] — 2026-09-08

First public release. Two diagram engines, one contract, no dependencies.

### Draw.io

- Native `.drawio` generation from a JSON spec: grid layout, boundaries,
  five connector kinds, an auto-generated legend, collision-free placement.
- A 243-entry AWS Architecture Icons palette, searchable by product name, with
  duplicate titles disambiguated by index, dimensions and payload hash.
- Real product logos for non-AWS components: fetched from a URL you name,
  transparency-checked, embedded in the cell rather than linked.
- A structural validator and a page-scoped analyzer that never pulls XML or
  labels into context.
- PNG rendering through Draw.io Desktop, with the 1-based `--page-index`
  off-by-one corrected.

### Excalidraw

- Native `.excalidraw` generation with every arrow bound at both ends,
  boundaries sized from their contents, and seven connector kinds.
- 36 bundled icon libraries — 1,162 items, all native vector geometry — covering
  AWS, Azure, GCP, Snowflake, the data-platform stack, DevOps tooling and
  general IT logos, with numbered contact sheets for the 239 unnamed items.
- Icons built from real logos: `--trace` converts a flat SVG into native
  Excalidraw geometry, holes and fill rules included.
- The public library catalogue, searchable and installable from the command
  line.
- An honest placeholder for anything unresolvable, named in the build report.
- A dependency-free SVG renderer that reproduces the hand-drawn stroke, plus PNG
  rasterisation through headless Edge or Chrome.
- Excalidraw in Docker: the official image, read-only, no backend, nothing
  uploaded.

### Both

- A learned house style per engine, every rule carrying its evidence count and
  confidence, with defaults marked as defaults.
- Two user-invoked learning skills that fold your own diagrams into the record —
  merging rather than replacing, and lowering confidence on contradiction.
- Structural-statistics-only style records: no labels, page names, paths or image
  payloads, enforced by a test.
- `bin/arkitect.mjs`: one command surface over both engines, plus `doctor` and
  `install`.
- Agent adapters for Claude Code (a 4-skill plugin), Codex, Cursor, OpenCode,
  GitHub Copilot, Antigravity and Pi, generated with the install path baked in.
- An offline test suite of 118 checks across both engines and the toolkit,
  including a redaction
  check that fails the build if anything from a reference diagram leaks into the
  repository.
