---
name: arkitect-drawio
description: Create or edit editable Draw.io (.drawio) solution-architecture diagrams in the Arkitect house style, using the bundled icon packs for AWS, Azure, Google Cloud, data platforms, AI frameworks, DevOps, GitHub, file types and agent concepts. Use whenever the request involves a Draw.io/diagrams.net diagram, an AWS or cloud architecture diagram, a monitoring or observability architecture, a data-ingestion or data-pipeline architecture, an agentic/LLM system architecture, a solution-options or as-is/to-be comparison diagram, a flow or decision diagram wanted as .drawio, or an edit to an existing .drawio file.
---

# Draw.io architecture diagrams

Produces native, editable `.drawio` XML — never a flattened image, never Mermaid as the
final artifact. Style rules are learned from an analysed corpus of real architecture
pages, each rule carrying its evidence count; the icons are eighteen packs -
about 4,800 marks - bundled with this skill and resolved by one search.

Scripts live in `${CLAUDE_PLUGIN_ROOT}/skills/arkitect-drawio/scripts`.
Read `references/style-guide.md` before laying anything out, and
`references/pattern-catalog.md` to pick a starting pattern.

## Workflow

1. **Interview until you both mean the same thing.** One question at a time, each
   carrying your recommended answer, walking the design tree in dependency order. See
   [Interview first](#interview-first). Never ask about styling — that is this skill's
   job. Do not start drawing while a branch that would change the drawing is unresolved.

2. **Pick a pattern and state assumptions.** Choose the nearest entry in
   `references/pattern-catalog.md`. Write down every architectural assumption you made;
   they go in the final report and, where useful, in a note box on the canvas.

3. **Resolve icons — bundled packs first.**
   ```bash
   node scripts/find-icon.mjs "bedrock"                    # rank matches, metadata only
   node scripts/find-icon.mjs "cloud run" --context gcp    # bias toward the stack in play
   node scripts/find-icon.mjs --cell <id> --label "Amazon Bedrock" --x 0 --y 0
   ```
   The search answers with `confident: true` or with the reason it is not, plus the
   alternatives. **A result that is not confident is a question, not an answer** —
   pick an id deliberately, narrow with `--pack`, or ask. Do not take the first row
   because it was first.

   Sixty-nine products are catalogued without artwork, because their marks carry no
   redistribution licence. Those come back as `bytes: "on-demand"` with the exact
   `fetch-logo` command to run. Run it, then use the cached logo.

   If nothing matches, fall back to a built-in `mxgraph.aws4.*` shape, then to the MCP
   `search_shapes` tool, then to a plain labelled box that you call out in the report.
   **Never** swap in a different product's icon to fill a gap.

4. **Generate the file.** Write a spec and build it; this applies the style tokens,
   embeds the icon data directly in each cell, and keeps the layout collision-free:
   ```bash
   node scripts/build-diagram.mjs my-spec.json --out "path/to/diagram.drawio"
   ```
   `assets/templates/starter-architecture.spec.json` is a working example of the spec
   format. Declare the packs the diagram draws from so ties resolve inside the right
   stack, and pin a single stubborn node with its own `pack`:
   ```json
   { "context": { "packs": ["gcp", "devops"] },
     "nodes": [{ "id": "q", "kind": "icon", "icon": "kafka", "pack": "streaming-orchestration" }] }
   ```
   Hand-written XML is fine too — copy the exact style strings from the style
   guide — but embedded icons must use the comma-only data URI form
   (`data:image/svg+xml,<base64>`), because `;` terminates a draw.io style.

5. **Never overwrite blind.** `build-diagram.mjs` writes a timestamped sibling backup
   before replacing an existing file. If you edit XML by any other route, call
   `backupExisting()` or copy the file yourself first.

6. **Validate.**
   ```bash
   node scripts/validate-drawio.mjs "path/to/diagram.drawio"
   ```
   Errors (duplicate ids, missing parents, broken edge endpoints, unreadable embedded
   images) must be fixed. Warnings about overlaps and tight labels are judgement calls —
   check them against the render.

7. **Render and actually look at it.**
   ```bash
   node scripts/render-drawio.mjs "path/to/diagram.drawio" --out-dir .analysis/renders --width 2200
   # Or from the repository root:
   node bin/arkitect.mjs drawio render "path/to/diagram.drawio" --all --out-dir .analysis/renders
   ```
   Uses local Draw.io Desktop on Linux, macOS and Windows, with automatic
   `xvfb-run -a` wrapping on Linux without `DISPLAY` when available. Override
   discovery with `--drawio-exe` or `DRAWIO_EXE`. Outputs are
   `<base>.p<0-based index>.png`. The PowerShell helper remains unchanged:
   `./scripts/render-drawio.ps1 -Path "path/to/diagram.drawio" -OutDir .analysis/renders`.
   Read the PNG back as an image. Iterate until spacing, hierarchy, routing and label
   legibility hold up. A diagram that validates but reads badly is not done.
   Both helpers accept 0-based page numbers. The portable `.mjs` validates N,
   copies the selected raw `<diagram>` verbatim with original `<mxfile>`
   attributes into a temporary single-page file, exports WITHOUT Desktop's
   `--page-index`, and removes the temporary file even on failure. Compressed
   payloads remain compressed and byte-identical. Do not guess indexing from
   platform or version: Linux arm64 24.7.17 is 0-based, Windows x64 29.0.3 is
   1-based. The Windows-original `.ps1` remains unchanged. The opt-in
   `--page-index-passthrough` flag is only for debugging Desktop; it passes N
   directly on the original file without translating and can select a different
   page on a build with different indexing. See `docs/drawio-mcp.md`.
   Judge export success by a fresh non-empty output, not Chromium stderr noise.
   Extra Electron flags are opt-in: `--disable-gpu` for observed GPU errors,
   `--no-sandbox` only for a diagnosed sandbox failure. Never add them blindly.
   After a host update breaks rendering, report 🔴 and explicitly fall back to
   validate-only until fixed. Generator changes need a build, render and visual
   inspection before a PR; only committed-template renders may be attached.
   Never commit a render or upload real architecture.

8. **Open it on request.** `& 'C:\Program Files\draw.io\draw.io.exe' "<file>"`.

9. **Report.** File path, the assumptions the interview settled, validation and render
   results, any icon the resolver was not confident about or could not find, which
   third-party logos were downloaded and from where, and any deliberate deviation from
   the style guide.

## Interview first

A diagram is a claim about someone's system. Drawing the wrong claim beautifully is
worse than drawing nothing, and every wrong assumption survives into a slide deck and
gets believed. So before laying anything out, **interview the user until you both mean
the same thing** — then draw once.

**How to ask.**

- **One question at a time.** A wall of six questions gets one answer and five shrugs.
- **Always carry a recommendation.** Give your recommended answer with each question so
  "yes" is a complete reply. Say why in one line — a recommendation without a reason is
  just a guess with confidence.
- **Walk the tree in dependency order.** Answers that constrain later questions come
  first. Do not ask about failure paths before you know whether this is a context
  diagram or a component diagram.
- **Never interview about style.** Colours, fonts, spacing, connector shapes, icon
  choice, legend — those are this skill's job. Asking is an admission it is not doing it.
- **Feed answers forward.** Do not re-ask what an earlier answer already settled, and say
  when an answer changes something you had already agreed.

**The branches, in dependency order.** Skip a branch when the answer is already in the
request or genuinely cannot change the drawing.

1. **Purpose and audience.** Who reads this, and what decision does it support? An RFC
   reviewer, a client steering group and an on-call engineer need three different
   pictures of the same system. *Everything below depends on this answer.*
2. **Scope boundary.** What is inside the picture, and what is deliberately outside?
   Naming what is out is as useful as naming what is in.
3. **Level of abstraction.** One box per service, per container, or per team? Mixing
   levels in one diagram is the single most common way these go wrong.
4. **State.** As-is, to-be, or both side by side? If both, are they two pages or one
   comparison?
5. **The components — by their real product names.** "The warehouse" is not drawable;
   "Snowflake" is. This answer also picks the icon packs, so get the actual products:
   `node scripts/find-icon.mjs --list-packs`.
6. **The flows.** What moves between the components, in which direction, and which are
   synchronous versus scheduled or event-driven? Ask which flows matter enough to draw —
   every arrow costs legibility.
7. **Boundaries.** Trust, network, ownership, account/subscription/project. These become
   the containers, so they change the layout more than anything except the level.
8. **What must be visible.** Failure paths, multi-region, HA/DR, a specific control the
   audience is there to scrutinise. Ask rather than guess which of these earns space.
9. **Pages.** One page, or a set? Split by lifecycle stage or by audience, not by how
   much fits.
10. **Unknowns.** Where the user does not know, agree the treatment up front: draw it
    with a stated assumption, or leave a labelled placeholder. Never quietly invent.

**Stop when** the remaining unknowns could not change what gets drawn. Relentless means
resolving every branch that matters, not filling a quota. A one-box-to-three-boxes
flowchart needs two questions; a solution architecture for a review board needs the
ladder. Calibrate to what is actually being asked, and say when you are stopping and why.

**Then write the answers down.** They become the assumptions in your report, and the
ones that matter go into a note box on the canvas. An assumption nobody can see is an
assumption nobody can correct.

## The icon packs

One search covers all of them; `--pack` narrows to one, `--context` biases toward
several. Lower rank wins a tie, so a curated pack always beats the catch-all.

| Pack | Icons | What is in it |
|---|---|---|
| `aws` | 311 | AWS Architecture Icons, Amazon's July 2026 package |
| `azure` | 638 | Azure service icons, V24 |
| `gcp` | 249 | Google Cloud products and categories |
| `data-platforms` | 25 | Warehouses, lakehouses, query engines, BI, product analytics |
| `databases` | 37 | Relational, document, key-value, graph, vector |
| `ai-frameworks` | 34 | LLM orchestration, agent frameworks, providers |
| `ml-training` | 27 | Training, experiment tracking, the numeric stack |
| `streaming-orchestration` | 16 | Brokers, stream processors, schedulers |
| `observability` | 26 | Metrics, logs, traces, alerting, on-call |
| `devops` | 54 | IaC, CI/CD, containers, mesh, proxies, distros |
| `security-identity` | 25 | Secrets, SSO, scanning, runtime security, VPN |
| `github` | 38 | GitHub marks plus Octicon workflow concepts |
| `saas-collab` | 30 | Trackers, docs, design, comms, low-code, business SaaS |
| `languages-runtimes` | 80 | Languages, frameworks, package managers, build and test tooling |
| `file-types` | 35 | Document sheets badged with an extension |
| `agents` | 33 | Agent concepts — memory, tracing, RAG, guardrail |
| `primitives` | 43 | Generic concepts — queue, cache, load balancer |
| `brands` | 3,092 | Every other Simple Icons mark; ranked last |

`node scripts/find-icon.mjs --list-packs` prints this live.
`references/pack-index.md` lists what each curated pack contains, and which products
are catalogued without bytes. Contact sheets for every pack are in
`assets/libraries/contact-sheets/` — look at one before telling a user a pack is
missing something.

Rebuilding is only needed when `sources.json` changes:

```bash
node scripts/build-packs.mjs --verify        # committed libraries match the manifest?
node scripts/build-packs.mjs --all           # rebuild every pack and the catalog
node scripts/contact-sheet.mjs --all --png   # regenerate the review sheets
```

## Third-party product logos

The packs cover most things. Everything else — a niche vendor, an internal product,
one of the sixty-nine on-demand marks — gets its real logo, downloaded and embedded.
In the reference corpus 77 of 97 embedded images are exactly this. A generic box where
a recognisable logo belongs is a regression, not a safe default.

```bash
node scripts/fetch-logo.mjs --url https://.../logo.png --name snowflake
node scripts/fetch-logo.mjs --list
node scripts/fetch-logo.mjs --inspect snowflake
```

Then reference it in the spec by name:

```json
{ "id": "sf", "kind": "logo", "logo": "snowflake", "label": "Snowflake", "col": 3, "row": 1 }
```

**Finding the file.** Use WebSearch/WebFetch to locate the official asset, then hand the
URL to the script — the script does the binary download, not WebFetch. Good sources, in
order: the vendor's own press-kit or brand page, their GitHub organisation avatar or
`docs/` assets, Wikimedia Commons. Prefer a page that offers a downloadable asset over
scraping a rendered `<img>` out of a marketing page.

**Prefer transparent PNG, or SVG.** A logo on a baked-in white rectangle looks wrong on
the canvas and worse inside a coloured boundary. The script reports transparency for
every file it caches and warns when a PNG is opaque; if it warns, go back and find a
better source rather than shipping it. Search terms like "transparent png" or "logo svg"
usually get you there. SVG is ideal — it scales and is almost always transparent.

**Size.** Vendor logos sit at ~60–64px in the corpus, smaller than the 78px packaged
service icons. The default fits the longest side to 64px and preserves aspect, so a wide
wordmark stays wide rather than being squashed square. Stack them vertically at ~60px
inside an *external systems column* (pattern 6) when several sit together.

**Check it is the right logo.** Read the cached file back as an image before shipping
it. Brand searches return old logos, fan art and lookalikes; a wrong logo is worse than
no logo.

**Privacy.** Only the logo URL is ever requested. Never put a customer name, project
codename, hostname or anything from the diagram into a search query or URL — search the
product name alone. Downloading a public asset leaks nothing; searching
`"<customer> architecture"` does.

**Embed, never link.** The cache is local and gitignored, so a `remote-url` reference in
a cell would break for anyone else and is flagged by `validate-drawio.mjs`. `kind: "logo"`
embeds the bytes.

If you genuinely cannot find a usable logo, use a plain box with the product name and
say so in the report — do not substitute a different product's mark.

## Editing an existing diagram

- Call MCP `list_pages` first to see the page inventory.
- `get_page`/`set_page` are only safe when the page is small. Reference pages here run
  4–7 MB because of embedded images — loading one wholesale will blow up the context.
- For anything large, work page-scoped with the local scripts:
  ```bash
  node scripts/analyze-drawio.mjs "<file>" --page 0 --cells   # geometry table, no labels
  node scripts/analyze-drawio.mjs "<file>" --page 0 --images  # embedded image inventory
  ```
  then make a targeted, backup-protected edit and re-validate.
- Never call `open_drawio_xml`, `open_drawio_csv` or `open_drawio_mermaid` on anything
  derived from the user's diagrams — those open the hosted editor and would send private
  architecture off the machine.

## Non-negotiables

- Editable `.drawio` XML is the deliverable.
- Icons and logos embed in the cell, so the file renders without the palette loaded.
- Real product marks for every component, transparent background, not grey boxes.
- Orthogonal routing, square corners, no shadows, captions under icons, `#232F3E` text,
  12px body / 16px headings.
- Keep the user's own diagrams local. Never upload them anywhere. Fetching a public
  logo is fine; putting anything from the diagram into a query is not.
