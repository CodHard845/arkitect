# Draw.io icons

Where a `.drawio` diagram's marks come from, in resolution order:

1. **The bundled AWS palette** — 243 entries, searched by product name.
2. **Draw.io's own `mxgraph.aws4.*` shapes** — every AWS service the built-in
   set covers, no embedding needed.
3. **The MCP `search_shapes` tool**, if the Draw.io MCP server is connected.
4. **A real product logo**, fetched and embedded, for anything not from AWS.

If none of those fits, the answer is a labelled box *and a note in the report*
saying the icon is missing. Never a different service's icon.

```bash
node bin/arkitect.mjs drawio icon "bedrock"
node bin/arkitect.mjs drawio icon --cell node1 --label "Amazon Bedrock" --x 0 --y 0
node bin/arkitect.mjs drawio logo --url https://.../snowflake.svg --name snowflake
```

> The palette is built from the **AWS Architecture Icons** asset package published by
> Amazon Web Services. The icons remain AWS's property and are used here for the purpose
> that package exists for — drawing architecture diagrams. See [NOTICE](../NOTICE).

## The three library files

Three files in `skills/arkitect-drawio/assets/libraries/`:

| file | entries | what it is |
|---|---|---|
| `AWS-icons.drawio.xml` | 237 SVG | the explicit draw.io export |
| `AWS-v1.drawio` | 243 (237 SVG + 6 PNG) | the working palette |
| `AWS-icons.merged.drawio` | 243 | deterministic merge, in palette order |

## Why the merge is trivial

The palette is a **strict superset** of the export: indices 0–236 are byte-identical in
the same order, with six AgentCore PNGs appended. So the merge preserves palette order
and records provenance in the catalog rather than in the library file, which keeps the
merged file loadable by draw.io unchanged.

The six palette-only entries are `AgentCore`, `AgentCoreGateway`, `AgentCoreIdentity`,
`AgentCoreMemory`, `AgentCoreObservability`, `AgentCoreRuntime` — PNGs at ~1024px, which
`find-icon.mjs` normalises down to the 78px service-icon footprint.

## Duplicate titles are kept, not deduplicated

Two entries share the title `Arch AWS-Compute-Optimizer 64` — one 81×81, one 80×80, with
different payloads. Both survive the merge. Lookups disambiguate by **index, dimensions
and decoded-image hash**, never by title alone, and an ambiguous search returns every
variant with its provenance instead of silently choosing:

```bash
node skills/arkitect-drawio/scripts/find-icon.mjs "compute optimizer"
```

## The catalog

`references/icon-catalog.json` holds metadata only — stable id, source index, exact
title, normalized aliases, MIME type, dimensions, and the SHA-256 of the decoded image.
Image payloads are **not** duplicated there; they are read from the bundled libraries on
demand, so a search never drags base64 into context.

Regenerate both the merge and the catalog with:

```bash
node skills/arkitect-drawio/scripts/extract-library.mjs --build
```

## Coverage, honestly

Across the five reference diagrams, only 20 of 97 embedded image placements — 9 distinct
icons — came from this library. Most AWS services are drawn with built-in
`mxgraph.aws4.*` shapes; the custom library fills the gaps the built-in set lacks
(Bedrock AgentCore, Timestream, Forecast). The remaining placements are pasted
third-party vendor logos, which are deliberately not bundled here.

So the resolution order for **AWS** components is: private catalog first, built-in
`mxgraph.aws4.*` as fallback, MCP `search_shapes` only if both come up empty. If nothing
fits, the skill says the icon is missing rather than substituting a different service's
icon.

**Non-AWS products** take a different route entirely — their real logo is downloaded and
embedded. See [Third-party product logos](#third-party-product-logos) below.

## Integrity

The two source palettes are verified byte-for-byte against the originals by 14
invariants:

```bash
node skills/arkitect-drawio/scripts/extract-library.mjs --verify
```

`.gitattributes` marks every `.drawio`/`.xml` as binary so line-ending normalisation
cannot rewrite them — without that, a checkout on Windows would break every hash.

## Third-party product logos

The bundled library covers AWS. Everything else in a real architecture — Snowflake,
Streamlit, Pinecone, Grafana, Milvus, Qdrant, Databricks, Talend, Datadog, GitHub — gets
its actual logo, downloaded and embedded.

This is not a nice-to-have: in the five reference diagrams, **77 of 97 embedded images
were third-party logos**, not AWS icons. A grey box labelled "Snowflake" is a
regression against how these diagrams are actually drawn.

### The flow

```bash
S=skills/arkitect-drawio/scripts

node $S/fetch-logo.mjs --url https://.../snowflake-logo.png --name snowflake
node $S/fetch-logo.mjs --list
node $S/fetch-logo.mjs --inspect snowflake
```

Already downloaded it by hand? Adopt the file instead of re-fetching:

```bash
node $S/fetch-logo.mjs --file ~/Downloads/snowflake.png --name snowflake
```

Then use it in a spec by name:

```json
{ "id": "sf", "kind": "logo", "logo": "snowflake", "label": "Snowflake", "col": 3, "row": 1 }
```

Or emit a single cell:

```bash
node $S/fetch-logo.mjs --cell snowflake --label "Snowflake" --x 200 --y 120
```

### Transparent background

A logo baked onto a white rectangle looks wrong on the canvas and worse inside a
coloured boundary. Every cached file is checked and the result recorded:

- **PNG** — read from the IHDR colour type. Types 6 and 4 carry an alpha channel; type 3
  counts only when a `tRNS` chunk is present; types 2 and 0 are opaque.
- **SVG** — flagged when a full-canvas `<rect>` or a painted `background` is present.
- **JPEG / WebP** — treated as opaque; JPEG has no alpha at all.

An opaque file still caches, but the tool warns and `build-diagram.mjs` repeats the
warning in its report. Treat that as a prompt to find a better source, not as noise.
"transparent png" or "logo svg" in the search usually gets you there; SVG is ideal.

### Where to look

In rough order of reliability:

1. the vendor's own press-kit or brand page
2. their GitHub organisation avatar, or assets under `docs/` in their repo
3. Wikimedia Commons

Prefer a page offering a downloadable asset over scraping an `<img>` out of marketing
HTML. Use WebSearch/WebFetch to *find* the URL; hand the URL to the script, which does
the binary download.

**Then look at the file.** Brand searches return old logos, fan art and lookalikes. Read
the cached image back before shipping it.

### Sizing

The longest side is fitted to **64px** by default, preserving aspect — so a wide
wordmark stays wide and short instead of being squashed into a square. That is smaller
than the 78px AWS service icons, matching the reference corpus, where vendor logos
cluster at 60–64px.

Override per node with `"size"`, or pin exact dimensions with `"width"`/`"height"`.

Several vendors together belong in an *external systems column* (pattern 6): a bordered
box outside the cloud boundary, bold heading, logos stacked vertically at ~60px, with
one arrow leaving the column as a whole rather than one per logo.

### Privacy

Only the logo URL is ever requested — a public asset download leaks nothing.

What would leak is the **query**. Search the product name alone. Never put a customer
name, project codename, hostname, or anything else from the diagram into a search term
or URL.

### The cache

Files live in `skills/arkitect-drawio/assets/logos/`, with an `index.json` recording file
name, MIME type, dimensions, transparency, SHA-256 and source URL.

The directory is **gitignored**. Logos carry their own trademark and licensing terms,
and generated diagrams embed the image anyway, so a diagram stays portable whether or
not the cache travels with it. If a particular logo belongs in the repo, force-add it:

```bash
git add -f skills/arkitect-drawio/assets/logos/snowflake.png
```

Because the cache is local, a `kind: "logo"` node **embeds** the bytes rather than
linking. A remote URL in a cell would break for everyone else, and
`validate-drawio.mjs` flags it.
