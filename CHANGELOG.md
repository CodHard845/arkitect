# Changelog

All notable changes to Arkitect are recorded here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/spec/v2.0.0.html).

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
