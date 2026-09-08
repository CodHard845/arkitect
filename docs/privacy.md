# Privacy

Architecture diagrams are among the most sensitive documents an engineer draws.
They name systems, vendors, environments and, often, a customer. Arkitect is
built so that using an agent to draw one does not mean shipping it anywhere.

## The short version

- **Your diagrams never leave the machine.** No upload, no telemetry, no hosted
  step, no account.
- **Exactly two things reach the network**, both public and both free of
  anything about your architecture: a **product logo you asked for by URL**, and
  the **public Excalidraw library catalogue**.
- **No query ever carries content from your diagram.** Product names only.
- **Nothing derived from your diagrams is committed** — not renders, not labels,
  not paths, not the redaction digests.

## What runs where

| | where it runs | network |
|---|---|---|
| generating a diagram | your machine | none |
| validating | your machine | none |
| the Excalidraw SVG/PNG preview | your machine (headless Edge/Chrome for the PNG) | none |
| rendering a `.drawio` to PNG | Draw.io Desktop, your machine | none |
| the Excalidraw container | your machine | none — the image is the static app with no backend |
| the Draw.io MCP server | your machine, over stdio | none, for the tools Arkitect uses |
| fetching a product logo | your machine | one HTTPS GET to the URL you named |
| the Excalidraw library catalogue | your machine | HTTPS GET to `libraries.excalidraw.com` |

There are no npm dependencies, so there is no dependency tree phoning home
either. `npx @drawio/mcp` is fetched from the registry when you use the MCP
server, and `--ignore-scripts` blocks its lifecycle scripts on install.

## The hosted-editor rule

The Draw.io MCP server exposes three tools that open **app.diagrams.net** in a
browser with the content in the URL: `open_drawio_xml`, `open_drawio_csv`,
`open_drawio_mermaid`.

Arkitect's contract forbids calling any of them on your content, in both
`SKILL.md` files and in `AGENTS.md`. Only `list_pages`, `get_page`, `set_page`
and `search_shapes` are used — all local.

If you drive Arkitect through a tool that reads none of those files, state the
rule yourself in your instructions.

## Searching for a logo

The download is harmless: a public asset from a URL you named. The **query** is
the risk.

```
✅  snowflake logo svg
✅  grafana brand assets
❌  <customer> data platform architecture
❌  <internal codename> logo
```

Arkitect's contract says this in four places, because it is the one thing an
otherwise careful agent gets wrong.

## The Excalidraw container

`excalidraw/excalidraw:latest` is the same static app as excalidraw.com, served
by nginx. It has **no backend**. Scenes live in the browser's local storage and
in the files you open; nothing you draw is uploaded.

Two consequences, both practical rather than security-related: there is no
server-side save (the file on disk is the source of truth), and the app cannot
open a file off your disk by itself, which is why the helper reveals the file for
you to drag in.

One thing does reach out: the app's own **Browse libraries** button opens
`libraries.excalidraw.com`. That is a public catalogue and sends nothing about
your scene. Offline, the button simply does nothing.

## The style record

The learning skills read diagrams you designate and write a record of what they
found. That record contains **structural statistics and digests only**: shape and
edge counts, style-token distributions, geometry quantiles, and a SHA-256 per
source file.

It does not contain labels, page names, file names, paths, hostnames, URLs or
image payloads. The analyzers are written so that element text never reaches the
record, and a test asserts it on every run.

Your source files are opened read-only and hashed before and after.

## What is deliberately not committed

The `.gitignore` is part of the design, not housekeeping:

| | why |
|---|---|
| `.analysis/` | renders of your diagrams, and `sources.local.json` — the paths themselves can identify a customer |
| `tests/output/` | scratch from the suite |
| `tests/sensitive-tokens.*.sha256` | salted digests derived from your corpus (see below) |
| `skills/*/assets/logos/`, `assets/icons/` | third-party marks with their own trademark terms |
| `skills/arkitect-excalidraw/assets/libraries/*` (non-bundled) | other people's libraries, re-installable in one command |
| `*.backup-*.drawio`, `*.backup-*.excalidraw` | the safety copies taken before an in-place edit |

## The redaction check

The suite tokenizes every file in the repository and compares it against salted
SHA-256 digests of strings drawn from your reference diagrams. If a customer
name ever leaks into a doc, a comment or a test fixture, the suite fails.

The digest list is **gitignored on purpose**. The salt is an in-repo constant, so
publishing digests would let anyone holding a list of candidate company names
confirm which of them appear in your corpus — exactly what the check exists to
prevent. It regenerates whenever your sources are present, which is precisely
when a leak could be introduced. On a clone with no sources, the check skips.

→ [testing.md](testing.md#the-redaction-check)

## Reporting a problem

If you find a path by which Arkitect could send diagram content anywhere, treat
it as a security issue: [SECURITY.md](../SECURITY.md). It is the one bug class
here that is worth a private report rather than a public issue.
