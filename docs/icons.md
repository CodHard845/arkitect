# Icons

A diagram of grey boxes labelled "Snowflake" and "Kafka" is not a diagram of
your system, it is a wireframe of one. Arkitect treats icon resolution as the
step that decides whether the output is worth having — which is why it ships
5,950 marks and refuses to fake the rest.

```bash
node bin/arkitect.mjs drawio icon "bedrock"        # 4,793 marks in 18 packs
node bin/arkitect.mjs drawio icon --list-packs     # what each pack holds
node bin/arkitect.mjs excalidraw icon "postgres"   # 1,162 items, 36 libraries
```

## What ships

| | Draw.io | Excalidraw |
|---|---|---|
| bundled | 4,793 marks across 18 packs | 1,162 items across 36 libraries |
| coverage | AWS (311), Azure (638), Google Cloud (249), plus curated packs for data platforms, databases, AI frameworks, ML, streaming, observability, DevOps, security, GitHub, SaaS, languages and file types; agent and architecture concepts as tiles; 3,092 more brands as a catch-all | AWS (249), Azure (86), GCP (83), Google products (139), Snowflake (54), data platform (33), DevOps (29), IT logos (38), plus system-design components, forms, network topology, sticky notes |
| also available | Draw.io's built-in `mxgraph.aws4.*` shapes, and MCP `search_shapes` | the public catalogue at libraries.excalidraw.com |
| for anything else | fetch the real logo and embed it — including the 69 marks catalogued without bytes | trace the real logo into native geometry, or use a placeholder |
| detail | [drawio-icons.md](drawio-icons.md) · [pack index](../skills/arkitect-drawio/references/pack-index.md) | [excalidraw-libraries.md](excalidraw-libraries.md) · [excalidraw-icons.md](excalidraw-icons.md) |

## The rule

**Never substitute one product's mark for another.** Not a similar service, not
the same vendor's other product, not a generic cloud glyph standing in for a
named thing. A wrong logo survives into someone's slide deck and is believed.

The honest answers, in order:

1. **A bundled mark**, searched by product name — and only when the search says
   it is confident. A result flagged otherwise is a question, not an answer.
2. **An unnamed bundled mark**, found by looking at the numbered contact sheet
   and referenced as `<slug>:<n>`. 239 Excalidraw items have no name — the index
   deliberately does not invent one.
3. **A real logo**, fetched from a source you name, transparency-checked and
   embedded (Draw.io) or traced into native geometry (Excalidraw).
4. **A placeholder** — a dotted slot with a `?`, captioned with the component
   name, listed under `placeholders` in the build report, and mentioned in the
   agent's summary. Nothing else in the visual vocabulary looks like it, which
   is the point: an empty slot must be impossible to mistake for a finished
   node.

Placeholders are the *default* for Excalidraw, not a failure. Fetching a logo
happens when you ask for it.

## Which route for which product

| situation | route |
|---|---|
| an AWS service, Draw.io | the bundled palette, then `mxgraph.aws4.*` |
| an AWS/Azure/GCP/Snowflake service, Excalidraw | the bundled libraries — one library per diagram where coverage allows |
| a named product with a public logo, Draw.io | `arkitect drawio logo --url …` |
| a named product with a flat SVG, Excalidraw | `arkitect excalidraw make-icon --url … --trace` |
| a whole domain the bundled set misses (Kubernetes gear, network hardware) | `arkitect excalidraw browse --search …` then `--install` |
| an internal product with no public asset | a placeholder, or a labelled box, and say so |

## Two things that surprise people

**Many bundled marks draw their own name.** Most AWS, Azure and data-platform
items include the product name as text inside the item. The generator detects
that and skips its own caption rather than printing the name twice; those nodes
are listed under `icons.selfCaptioned` in the build report.

**Styles differ between libraries.** An AWS mark is a hachure-filled pastel
square, a GCP mark is flat blue line-art, an IT logo is a black glyph. Three
libraries in one diagram looks like three libraries. Prefer one library per
diagram where its coverage allows.

## Transparency

A logo baked onto a white rectangle looks wrong on the canvas and worse inside a
coloured boundary. Every cached file is checked — PNG from the IHDR colour type,
SVG from a full-canvas `<rect>` or painted background, JPEG and WebP treated as
opaque — and an opaque file is warned about at fetch time and again at build
time. Treat the warning as a prompt to find a better source. An SVG traced with
`--trace` sidesteps the question entirely.

## Where logos live, and why they are not committed

```
skills/arkitect-drawio/assets/logos/        fetched logos + index.json
skills/arkitect-excalidraw/assets/icons/    built icons + items/ + house.excalidrawlib
skills/arkitect-excalidraw/assets/libraries/    libraries pulled from the catalogue
```

All three are **gitignored**. Logos carry their own trademark and licensing
terms, and a generated diagram embeds or inlines the artwork anyway — so a
diagram stays portable whether or not the cache travels with it. Force-add one if
you decide it belongs in your repository:

```bash
git add -f skills/arkitect-drawio/assets/logos/snowflake.svg
```

The **bundled** Excalidraw libraries are different: they are committed, because
they are the primary source and the reason a diagram can be drawn offline. Their
authors are credited in
[ATTRIBUTION.md](../skills/arkitect-excalidraw/assets/libraries/bundled/ATTRIBUTION.md),
and the AWS palette's provenance is in [NOTICE](../NOTICE).

## Privacy

Only the URL you name is ever requested, and a public asset download leaks
nothing. What would leak is the **query**: search the product name alone. Never
put a customer name, project codename or hostname into a search term or a URL —
`"snowflake logo svg"` is fine, `"<customer> architecture"` is not.

→ [privacy.md](privacy.md)
