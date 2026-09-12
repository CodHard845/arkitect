# Draw.io icons

Where a `.drawio` diagram's marks come from, in resolution order:

1. **The bundled icon packs** — eighteen libraries, ~4,800 marks, searched together
   by product name.
2. **Draw.io's own `mxgraph.aws4.*` shapes** — every AWS service the built-in
   set covers, no embedding needed.
3. **The MCP `search_shapes` tool**, if the Draw.io MCP server is connected.
4. **A real product logo**, fetched and embedded, for anything the packs miss.

If none of those fits, the answer is a labelled box *and a note in the report*
saying the icon is missing. Never a different product's icon.

```bash
node bin/arkitect.mjs drawio icon "bedrock"
node bin/arkitect.mjs drawio icon "cloud run" --context gcp
node bin/arkitect.mjs drawio icon --cell node1 --label "Amazon Bedrock" --x 0 --y 0
node bin/arkitect.mjs drawio logo --url https://.../acme.svg --name acme
```

## The packs

One file per pack in `skills/arkitect-drawio/assets/libraries/`, one row per pack in
`references/pack-index.md`, one contact sheet per pack in `contact-sheets/`.

| Tier | Packs | Where the artwork comes from |
|---|---|---|
| Vendor | `aws` `azure` `gcp` | The vendors' own published icon sets, embedded verbatim |
| Curated | `data-platforms` `databases` `ai-frameworks` `ml-training` `streaming-orchestration` `observability` `devops` `security-identity` `github` `saas-collab` `languages-runtimes` | Simple Icons and devicon, painted in the brand's own colour |
| Generated | `agents` `primitives` `file-types` | Lucide and Octicon glyphs composed into tiles and document sheets |
| Catch-all | `brands` | Every remaining Simple Icons mark, ranked last |

`node bin/arkitect.mjs drawio icon --list-packs` prints the live counts.

## Resolution is ranked, and refuses to guess

Search runs across every pack at once. A pack's `rank` breaks ties — vendor packs at 10,
curated at 20, the catch-all at 90 — so `docker` resolves to `devops/docker` rather than
to whichever Simple Icons entry happened to match first.

Two knobs steer it, and one gate stops it:

```json
{ "context": { "packs": ["gcp", "devops"] },
  "nodes": [{ "id": "q", "icon": "kafka", "pack": "streaming-orchestration" }] }
```

`context.packs` biases ties toward the stack being drawn. A node's own `pack` pins it.
And when the leader is not strong, not clearly ahead, or matched only by a fragment of
its name, the result comes back `confident: false` with the reason and the alternatives —
`build-diagram.mjs` still draws its best guess, but lists it under `ambiguous` in the
report with the fix. That is what stops a GCP diagram quietly receiving an Azure icon.

### A fragment of a name is not a name

A prefix counts only when what it leaves off is a generic tail: `postgres` names
PostgreSQL (`ql`), `rabbit` names RabbitMQ (`mq`), `envoy` names Envoy Proxy. It does
not count when it is the start of a different word — `tempo` ranks Temporal first, and
comes back flagged, because Grafana Tempo is a different product. A plural the builder
generated for a one-word vendor title is treated the same way: Azure's `Cubes` answers to
`cube`, but a bare common noun is not a product name, so it is never used unattended.

Neither rule changes a score, only whether the top result may be used without asking.
Lowering the score instead would widen the margin over the runner-up and hand confidence
to a *different* wrong answer — `delta` would become the airline.

This is measured, not asserted. `tests/icon-queries.json` is an answer key of 362
queries — the vocabulary of data, ML, platform and cloud engineers, plus 36 that must
come back flagged — and the suite fails on any confident wrong answer, or if precision
at rank 1 drops below its floor. Change a judgement row deliberately, never to make a
tuning change pass.

## What ships, and what deliberately does not

Vendor artwork is embedded **byte-for-byte**. Microsoft and Google grant permission to
use their icons in architecture diagrams and forbid altering the icon shape, so there is
no optimisation pass — and the untouched bytes keep the recorded SHA-256 meaningful.

Sixty-nine products are catalogued with a URL, a licence note and the exact
`fetch-logo` command, but **no bytes**, because no permissively licensed mark for them
exists. Seven of those were removed from Simple Icons 16 at the brand owner's request;
shipping them from an older pin would have made the rest of `ATTRIBUTION.md` dishonest.
`find-icon` hands back the command; `build-diagram` refuses to draw them.

See `assets/libraries/ATTRIBUTION.md` for per-source terms and
`references/pack-index.md` for the full on-demand list.

## Duplicate titles are kept, not deduplicated

Amazon files `AWS Compute Optimizer` under two categories with different artwork; both
survive, as `aws/aws-compute-optimizer` and `aws/aws-compute-optimizer-2`.
`aws/amazon-bedrock-agentcore-2` was once a PNG copy of the AgentCore service; it now
carries the same official SVG as `aws/amazon-bedrock-agentcore`, so a spec pinned to
either id still draws. All four are flagged `ambiguousTitle`. Lookups disambiguate by id
and decoded-image hash, never by title alone:

```bash
node skills/arkitect-drawio/scripts/find-icon.mjs "compute optimizer"
```

## The catalog

`references/icon-catalog.json` holds metadata only — namespaced id, pack, title,
aliases, source, licence, dimensions, and the SHA-256 of the decoded image. Image
payloads are **not** duplicated there; they are read from the pack library by
`libraryIndex` when a style is actually requested, so a search never drags base64 into
context.

## Rebuilding

`assets/libraries/sources.json` is the pinned manifest: every upstream carries an exact
version or a recorded sha256. The builder is rerunnable and offline after the first
fetch — archives cache in a gitignored `.cache/`.

```bash
S=skills/arkitect-drawio/scripts
node $S/build-packs.mjs --list              # what the manifest declares
node $S/build-packs.mjs --all               # rebuild every pack and the catalog
node $S/build-packs.mjs --pack azure        # just one
node $S/build-packs.mjs --refresh azure-v24 # re-download, report hash drift
node $S/build-packs.mjs --check-upstream    # has Simple Icons removed a mark we ship?
node $S/build-packs.mjs --check-drift       # have the pinned sources moved on?
node $S/build-packs.mjs --downscale-png in.png out.png --max 156   # shrink a raster, aspect kept
node $S/write-pack-docs.mjs                 # regenerate pack-index.md + ATTRIBUTION.md
node $S/contact-sheet.mjs --all --png       # regenerate the review sheets
```

A source whose bytes no longer match its pin **fails the build** rather than quietly
absorbing the change. Re-pin deliberately, after looking at what changed.

## Integrity

```bash
node skills/arkitect-drawio/scripts/build-packs.mjs --verify
```

Fifty-eight checks: every committed library matches the sha256 the catalog recorded,
every pack has the entry count the catalog claims, every catalog index still points at
the title it names, every id is unique, and nothing marked on-demand carries bytes.

None of that proves Draw.io can open the file, so the suite checks that too. Every
library is loaded the way Draw.io's own `EditorUi.loadLibrary` reads one — a strict XML
parse, an `<mxlibrary>` root, `JSON.parse` of its text — by a loader that shares no code
with `readLibrary`, so an escaping bug in `writeLibrary` cannot hide behind a reader just
as lenient. And `.github/workflows/drawio-desktop.yml` has Draw.io Desktop export one
icon from every pack, plus the GCP marks drawn with luminance masks and filters, and
fails if any page comes out blank.

`.gitattributes` marks every `.drawio`/`.xml` as binary so line-ending normalisation
cannot rewrite them — without that, a checkout on Windows would break every hash.

## Seeing what you shipped

Structural checks cannot notice that "Cloud Run" is wearing Cloud Scheduler's artwork.
Contact sheets can. Every pack is rendered as a labelled grid and committed as a PNG in
`assets/libraries/contact-sheets/`, so a reviewer can look rather than trust.

## Coverage, honestly

Across the five reference diagrams, only 20 of 97 embedded image placements — 9 distinct
icons — came from the original AWS library. Most AWS services are drawn with built-in
`mxgraph.aws4.*` shapes. The remaining 77 were pasted third-party vendor logos, which is
exactly the gap these packs close: the products those diagrams reached for by hand —
Snowflake, Grafana, Databricks, Datadog, GitHub — now resolve from bundled bytes.

The AWS pack is built from Amazon's own AWS Architecture Icons package (July 2026): every
service icon at 64px, embedded verbatim and pinned by sha256. Every id the original
243-entry palette used still resolves, and its captions stay searchable. Five Amazon
Bedrock AgentCore feature marks exist only as ~1024px rasters Amazon published outside
the package; they ship proportionally shrunk to 156px, twice the size they are drawn
at, from committed files under `assets/libraries/local/` — which took the pack from
7.3 MB to 1.5 MB.

## Third-party product logos

The packs cover most of a real architecture. Everything else — a niche vendor, an
internal product, one of the sixty-nine marks catalogued without artwork — gets its
actual logo, downloaded and embedded.

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
