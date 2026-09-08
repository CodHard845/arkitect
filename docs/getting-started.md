# Getting started

A fresh clone draws immediately. The style guides, pattern catalogs, icon
catalog and 36 icon libraries are all committed, so there is nothing to build
and nothing to download.

1. [ask for a diagram](#1-ask-for-a-diagram)
2. [look at it in the real app](#2-look-at-it-in-the-real-app)
3. [give it the icons you need](#3-give-it-the-icons-you-need)
4. [make the style yours](#4-make-the-style-yours)

Install first if you have not: [install.md](install.md) · [agents.md](agents.md).

## 1. Ask for a diagram

There is no command. Describe the system and say where to put the file:

> Draw an architecture for an event-driven order system: a web app posts to an
> API gateway, orders land on a queue, a worker validates them and writes to
> Postgres, failures go to a dead-letter queue, and a nightly job reconciles
> against the warehouse. Save it to `docs/orders.excalidraw`.

The extension decides the engine — `.excalidraw` or `.drawio`. If you do not
name one, say which you want:

- **Draw.io** when a client, a review board or an RFC will see it, when the
  design is AWS-heavy, or when you need multiple pages.
- **Excalidraw** for system design, block diagrams, flows, and anything going
  into a README.

What happens next: the agent picks a layout from the pattern catalog, resolves
an icon for every named product, writes a spec, builds the file, validates it,
renders a PNG and *looks at it*, then reports the path, the assumptions it made,
and anything it could not resolve.

Driving it yourself instead:

```bash
node bin/arkitect.mjs excalidraw build my-spec.json --out docs/orders.excalidraw
node bin/arkitect.mjs excalidraw validate docs/orders.excalidraw
node bin/arkitect.mjs excalidraw render docs/orders.excalidraw --out preview.svg
```

Start from a worked spec rather than a blank file:

| | |
|---|---|
| `skills/arkitect-excalidraw/assets/templates/starter-architecture.spec.json` | the vocabulary: every node kind, every connector kind, the generated legend |
| `skills/arkitect-excalidraw/assets/templates/aws-data-platform.spec.json` | the shape of a real answer: 48 nodes, phase regions, an error lane, a cross-cutting band |
| `skills/arkitect-drawio/assets/templates/starter-architecture.spec.json` | the same tour, in Draw.io |

Each has a PNG beside it. **Look at the PNG first** — it is faster than reasoning
about the rules, and it is what the output is supposed to look like.

## 2. Look at it in the real app

**Excalidraw:**

```bash
docker compose -f docker/docker-compose.yml up -d      # http://localhost:3000
```

```powershell
./skills/arkitect-excalidraw/scripts/excalidraw-docker.ps1 -Open -Path docs/orders.excalidraw
```

The app has no backend and cannot read your disk, so `-Open` starts the
container, opens the browser, copies the path and reveals the file in your file
manager — drag it onto the canvas. Nothing you draw is uploaded; the file on
disk is the source of truth. → [excalidraw-docker.md](excalidraw-docker.md)

**Draw.io:**

```powershell
& 'C:\Program Files\draw.io\draw.io.exe' "docs/orders.drawio"
```

To let an agent *edit* an existing Draw.io file, connect the MCP server —
generation does not need it. → [drawio-mcp.md](drawio-mcp.md)

## 3. Give it the icons you need

An architecture full of grey boxes is not worth drawing, so check what is
already covered before you go looking:

```bash
node bin/arkitect.mjs excalidraw icon "postgres"
node bin/arkitect.mjs drawio icon "bedrock"
```

1,405 marks ship with Arkitect: 243 AWS Architecture Icons for Draw.io, and
1,162 items across 36 Excalidraw libraries covering AWS, Azure, GCP, Snowflake,
the data-platform stack, DevOps tooling and general IT logos.

When something is missing, there are three honest answers and one dishonest one.

```bash
# 1. a placeholder - the default, and the right answer most of the time
#    (a dotted slot with a "?", named in the build report)

# 2. build the icon from the real logo, traced into native geometry
node bin/arkitect.mjs excalidraw make-icon \
  --url https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/postgresql.svg \
  --name postgres --trace --label "PostgreSQL"

# 3. install a whole public library for the domain
node bin/arkitect.mjs excalidraw browse --search "kubernetes"
node bin/arkitect.mjs excalidraw browse --install <source>
```

The dishonest one is using a different product's mark. Arkitect will not do it,
and neither should you. → [icons.md](icons.md)

For Draw.io, non-AWS products get their real logo fetched and embedded:

```bash
node bin/arkitect.mjs drawio logo --url https://.../snowflake.svg --name snowflake
```

## 4. Make the style yours

**This is the step that turns the output from good into yours.** What ships is a
house style with its evidence attached — every rule carries the count behind it,
and the rules that are just sensible defaults say so.

Point the learning skill at diagrams you have already drawn and it merges them
into the record:

```
/learn-excalidraw-style

Learn the style from these:
  C:\path\to\first.excalidraw
  C:\path\to\second.excalidraw
```

```
/learn-drawio-style

Learn the style from these:
  C:\path\to\first.drawio
```

If your host namespaces plugin skills it is `/arkitect:learn-excalidraw-style` —
type `/` to see which form is listed. Both carry
`disable-model-invocation: true`, so they only ever run when you ask; reading or
discussing a diagram never triggers one.

Your files are read-only throughout: hashes are checked before and after. What
enters the repository is **structural statistics and digests only** — no labels,
no page names, no paths, no image payloads.

To do the rebuild by hand:

```bash
node bin/arkitect.mjs excalidraw learn --sources "C:\path\to\first.excalidraw" --merge
node bin/arkitect.mjs drawio learn --sources "C:\path\to\first.drawio" --merge
```

`--merge` preserves prior knowledge and version history. Omit it and you replace
the record. → [style.md](style.md)

### The local source list

`.analysis/sources.local.json` is gitignored — the paths themselves can be
identifying. The learning skills write it for you; by hand:

```bash
mkdir -p .analysis
cat > .analysis/sources.local.json <<'JSON'
{
  "drawio":     ["/absolute/path/to/first.drawio"],
  "excalidraw": ["/absolute/path/to/first.excalidraw"]
}
JSON
```

With it present, the tests that check your corpus run instead of skipping.

## Where to go next

| | |
|---|---|
| [cli.md](cli.md) | every command, the repository layout, both spec formats |
| [icons.md](icons.md) | the icon systems, placeholders, logos, tracing |
| [style.md](style.md) | what the style record holds and how learning works |
| [privacy.md](privacy.md) | exactly what touches the network |
| [testing.md](testing.md) | the offline suite and the redaction check |
