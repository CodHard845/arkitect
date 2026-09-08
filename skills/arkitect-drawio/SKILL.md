---
name: arkitect-drawio
description: Create or edit editable Draw.io (.drawio) solution-architecture diagrams in the Arkitect house style, using the bundled AWS icon library. Use whenever the request involves a Draw.io/diagrams.net diagram, an AWS or cloud architecture diagram, a monitoring or observability architecture, a data-ingestion or data-pipeline architecture, an agentic/LLM system architecture, a solution-options or as-is/to-be comparison diagram, a flow or decision diagram wanted as .drawio, or an edit to an existing .drawio file.
---

# Draw.io architecture diagrams

Produces native, editable `.drawio` XML — never a flattened image, never Mermaid as the
final artifact. Style rules are learned from an analysed corpus of real architecture
pages, each rule carrying its evidence count; the icon set is a 243-entry AWS
Architecture Icons palette bundled with this skill.

Scripts live in `${CLAUDE_PLUGIN_ROOT}/skills/arkitect-drawio/scripts`.
Read `references/style-guide.md` before laying anything out, and
`references/pattern-catalog.md` to pick a starting pattern.

## Workflow

1. **Understand the system.** Ask only for facts you cannot infer: the components, what
   flows between them, and the trust/ownership boundaries. Do not interrogate the user
   about styling — that is what this skill is for.

2. **Pick a pattern and state assumptions.** Choose the nearest entry in
   `references/pattern-catalog.md`. Write down every architectural assumption you made;
   they go in the final report and, where useful, in a note box on the canvas.

3. **Resolve icons — bundled AWS palette first.**
   ```bash
   node scripts/find-icon.mjs "bedrock"           # rank matches, metadata only
   node scripts/find-icon.mjs --cell <id> --label "Amazon Bedrock" --x 0 --y 0
   ```
   If a title is ambiguous the search returns every variant with its size and
   provenance — surface the choice, do not pick silently. If nothing matches, fall back
   to a built-in `mxgraph.aws4.*` shape, then to the MCP `search_shapes` tool. **Never**
   swap in a different AWS service's icon to fill a gap.

   For **non-AWS products** — Snowflake, Streamlit, Pinecone, Grafana, Databricks,
   Datadog, GitHub, whatever the architecture actually uses — do not settle for a plain
   grey box. Fetch the real logo from the web and embed it. See
   [Third-party product logos](#third-party-product-logos).

4. **Generate the file.** Write a spec and build it; this applies the style tokens,
   embeds the icon data directly in each cell, and keeps the layout collision-free:
   ```bash
   node scripts/build-diagram.mjs my-spec.json --out "path/to/diagram.drawio"
   ```
   `assets/templates/starter-architecture.spec.json` is a working example of the spec
   format. Hand-written XML is fine too — copy the exact style strings from the style
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
   ```powershell
   ./scripts/render-drawio.ps1 -Path "path/to/diagram.drawio" -OutDir .analysis/renders -Width 2200
   ```
   Read the PNG back as an image. Iterate until spacing, hierarchy, routing and label
   legibility hold up. A diagram that validates but reads badly is not done.
   Note: this draw.io build treats `--page-index` as 1-based; the script takes a 0-based
   index and translates, so always go through the script.

8. **Open it on request.** `& 'C:\Program Files\draw.io\draw.io.exe' "<file>"`.

9. **Report.** File path, assumptions made, validation and render results, any icon
   missing from the library, which third-party logos were downloaded and from where,
   and any deliberate deviation from the style guide.

## Third-party product logos

The bundled palette covers AWS only. Everything else — Snowflake, Streamlit, Pinecone,
Grafana, Milvus, Qdrant, Databricks, Talend, Datadog, GitHub, an internal product —
gets its real logo, downloaded and embedded. In the reference corpus 77 of 97 embedded
images are exactly this. A generic box where a recognisable logo belongs is a
regression, not a safe default.

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

**Size.** Vendor logos sit at ~60–64px in the corpus, smaller than the 78px AWS service
icons. The default fits the longest side to 64px and preserves aspect, so a wide
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
- Real product logos for non-AWS components, transparent background, not grey boxes.
- Orthogonal routing, square corners, no shadows, captions under icons, `#232F3E` text,
  12px body / 16px headings.
- Keep the user's own diagrams local. Never upload them anywhere. Fetching a public
  logo is fine; putting anything from the diagram into a query is not.
