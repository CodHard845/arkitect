# Icon libraries

Two tiers: the libraries bundled with the plugin, and the public catalogue you
can pull more from.

## The bundled set — the primary source

36 libraries, 1,162 items, committed to the repository. All native vector
geometry: not one embedded image in the set, so every mark takes the hand-drawn
stroke, scales without going soft, and can be recoloured or pulled apart in the
app.

```bash
S=skills/arkitect-excalidraw/scripts

node $S/index-libraries.mjs                       # one line per library
node $S/index-libraries.mjs --stats
node $S/index-libraries.mjs --items gcp-icons     # the names in one library
node $S/index-libraries.mjs --unnamed             # the ones you have to look at
node $S/index-libraries.mjs --build               # after adding a .excalidrawlib
```

Coverage worth knowing about: AWS (249 named marks), Azure (86 across four
libraries), GCP (83, unnamed), Google products (139), Snowflake (54), the data
platform stack — Kafka, Databricks, Airflow, dbt, Spark, Elasticsearch and so on
(33), DevOps tooling (29, unnamed), IT logos (38), plus general system-design
components, forms, network topology and sticky notes.

`find-icon.mjs` searches this set first, ahead of house icons and ahead of
anything sitting in the download cache:

```bash
node $S/find-icon.mjs "snowflake"
node $S/find-icon.mjs --resolve data-platform:9
```

Nothing is parsed at query time — the set is 21MB across three dozen files, so
`index.json` holds a flat list of names and sizes and that is all a search
reads.

### Items with no name

239 of the 1,162 carry neither a name nor a caption — mostly the GCP, DevOps and
technology-logo libraries, which are pure glyphs. They cannot be found by
searching, and the index deliberately does not invent a name for them: a wrong
name is how a diagram ends up showing the wrong product.

So each such library has a **numbered contact sheet**, committed as a PNG in
`skills/arkitect-excalidraw/assets/libraries/bundled/sheets/`. Look at the sheet,
find the mark, reference it by number:

```json
{ "kind": "icon", "icon": "gcp-icons:37", "label": "Pub/Sub", "col": 1, "row": 0 }
```

Rebuild a sheet after changing a library:

```bash
node $S/index-libraries.mjs --sheet gcp-icons
./skills/arkitect-excalidraw/scripts/render-excalidraw.ps1 \
  -Path skills/arkitect-excalidraw/assets/libraries/bundled/sheets/gcp-icons.excalidraw \
  -OutDir skills/arkitect-excalidraw/assets/libraries/bundled/sheets
```

A handful of multi-part items bleed slightly outside their cell on a sheet: the
layout measures an element's unrotated box and some items contain rotated
pieces. The numbering is still unambiguous.

### Two things that bite

- **Many items draw their own name.** Most AWS, Azure and data-platform marks
  include the product name as text inside the item. The generator notices and
  skips its own caption rather than printing the name twice; the build report
  lists those nodes under `icons.selfCaptioned`.
- **Styles differ between libraries.** An AWS mark is a hachure-filled pastel
  square, a GCP mark is flat blue line-art, an IT logo is a black glyph. Three
  libraries in one diagram looks like three libraries. Prefer one library per
  diagram where its coverage allows.

### Credits

`skills/arkitect-excalidraw/assets/libraries/bundled/ATTRIBUTION.md` lists every
library with its author and a link to its catalogue entry. They belong to their
authors and remain under whatever licence each was published under; they are
committed here so a diagram can be drawn offline and so the same product always
gets the same mark.

## The public catalogue

The app's **Browse libraries** button opens
[libraries.excalidraw.com](https://libraries.excalidraw.com) — a public
catalogue of a couple of hundred community libraries. All of it is usable from
here, so the agent can install and place items without a human clicking through
the browser.

```bash
S=skills/arkitect-excalidraw/scripts

node $S/browse-libraries.mjs --update                      # refresh the catalogue
node $S/browse-libraries.mjs --search "kubernetes"
node $S/browse-libraries.mjs --search "network" --items    # list every item name
node $S/browse-libraries.mjs --install slobodan/aws-serverless.excalidrawlib
node $S/browse-libraries.mjs --list
node $S/browse-libraries.mjs --show aws-serverless
node $S/browse-libraries.mjs --remove aws-serverless
```

Pass the exact `source` value from a search result to `--install`.

An installed library is a **cache**, not part of the repository: it is gitignored
and re-installable from the catalogue. Reach for one only when the bundled set
genuinely lacks something.

Installed items are searched by `find-icon.mjs` after the bundled set and the
house icons, and referenced the same way — `library:index` or `library:name`:

```bash
node $S/find-icon.mjs "database"
node $S/find-icon.mjs --stats
```

```json
{ "id": "fn", "kind": "icon", "icon": "aws-serverless:0", "label": "Lambda" }
```

## Most libraries have no item names

This is the thing to know. **Most published libraries are still format v1**,
whose items carry no name at all:

```json
{ "type": "excalidrawlib", "version": 1, "library": [ [ /* elements */ ], ... ] }
```

The catalogue sometimes supplies a positional `itemNames` array, and when it
does not, three fallbacks apply in order: the item's own name (v2 only), the
catalogue's `itemNames`, and the item's own caption text — an icon often ships
with its product name drawn underneath. When none of those exist you get
`aws-serverless-0`, `aws-serverless-1`, and searching for "lambda" finds
nothing.

**Do not guess which index is which.** Render the contact sheet and look:

```bash
node $S/browse-libraries.mjs --preview aws-serverless --out sheet.excalidraw
```
```powershell
./skills/arkitect-excalidraw/scripts/render-excalidraw.ps1 -Path sheet.excalidraw -Style clean -Width 1200
```

The sheet is an ordinary scene — every item laid out in a numbered grid — so the
normal render script turns it into a PNG that can be read back as an image.

## Libraries versus built icons

| | public library | `make-icon.mjs --trace` |
|---|---|---|
| coverage | whatever the community published | any product with a public logo |
| style | the author's, which may not be yours | yours, from your flags |
| naming | often positional only | the name you give it |
| effort | one install | one fetch, occasionally a retry for a better source |

Reach for a library when one exists for the whole domain you are drawing — AWS
serverless, Kubernetes, network gear. Build the icon when you need one specific
product, or when the library's style clashes with the diagram.

Both are searched together, and a house icon wins a tie: it was made
deliberately for this diagram set.

## Licensing

Library authors keep their own licence and trademarks, recorded in
`installed.json` along with the author names. Check the catalogue entry before
redistributing a diagram that leans heavily on someone's library.

## The cache

```
skills/arkitect-excalidraw/assets/libraries/
  index.json          cached copy of the public catalogue
  installed.json      source, author, item count, digest
  <slug>.excalidrawlib
```

**Gitignored.** These belong to their authors and are re-installable in one
command. A generated scene inlines the elements it uses, so a diagram does not
depend on the cache travelling with it.

Downloads are parsed immediately on install, so a malformed or renamed file
fails there rather than halfway through building a diagram.

## Privacy

Two requests, both public: the catalogue itself, and the library file you ask
for. Nothing about your scene is sent, and no query carries anything from your
diagram.
