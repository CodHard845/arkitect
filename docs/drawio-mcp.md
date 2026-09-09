# The Draw.io MCP server

**Generating** a new diagram needs no MCP server at all — the generator writes
`.drawio` XML directly. The server is for **editing what already exists**: it
lets an agent read a file's page inventory and work page-by-page instead of
pulling megabytes of XML into its context.

Skip this page entirely if you only ever create new diagrams.

## Install

```bash
claude mcp add --scope user drawio -- npx --yes --ignore-scripts @drawio/mcp
claude mcp list
```

Expect `drawio: ... - ✔ Connected`. `--scope user` makes it available in every
project; restart your session after adding it.

For other hosts, the same command with that host's config format:

<details>
<summary>Codex — <code>~/.codex/config.toml</code></summary>

```toml
[mcp_servers.drawio]
command = "npx"
args = ["--yes", "--ignore-scripts", "@drawio/mcp"]
```
</details>

<details>
<summary>Cursor — <code>.cursor/mcp.json</code> or <code>~/.cursor/mcp.json</code></summary>

```json
{
  "mcpServers": {
    "drawio": { "command": "npx", "args": ["--yes", "--ignore-scripts", "@drawio/mcp"] }
  }
}
```
</details>

<details>
<summary>VS Code / Copilot — <code>.vscode/mcp.json</code></summary>

```json
{
  "servers": {
    "drawio": { "command": "npx", "args": ["--yes", "--ignore-scripts", "@drawio/mcp"] }
  }
}
```
</details>

<details>
<summary>OpenCode — <code>opencode.json</code></summary>

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "drawio": {
      "type": "local",
      "command": ["npx", "--yes", "--ignore-scripts", "@drawio/mcp"],
      "enabled": true
    }
  }
}
```
</details>

`--ignore-scripts` is deliberate: it blocks package lifecycle scripts on
install, which is the right default for a tool you are about to hand a file
path to.

## The tools, and which are safe

| tool | what it does | Arkitect's rule |
|---|---|---|
| `list_pages` | page inventory of a file | **use freely** — this is the one that matters |
| `get_page` | read one page's XML | only when the page is small |
| `set_page` | write one page's XML | only after a backup |
| `search_shapes` | search Draw.io's built-in shape libraries | fine, it is a shape search |
| `open_drawio_xml` | open XML in the **hosted** editor | **never on your content** |
| `open_drawio_csv` | open CSV in the **hosted** editor | **never on your content** |
| `open_drawio_mermaid` | open Mermaid in the **hosted** editor | **never on your content** |

The last three open `app.diagrams.net` in a browser with your content in the
URL. That sends the architecture off the machine. Both Arkitect skills and
`AGENTS.md` state this as a hard rule, and the Draw.io section of the contract
repeats it. If you use Arkitect through a tool that does not read those files,
say it yourself in your instructions.

## Why `get_page` is not the default

Real architecture files carry embedded icons and logos as base64. The reference
files this style was learned from run **4–7 MB each**. Loading one page
wholesale can consume an entire context window and put every label in the
diagram into the model's history.

So the editing workflow is local-first:

```bash
node bin/arkitect.mjs drawio analyze diagram.drawio                 # summary, no XML
node bin/arkitect.mjs drawio analyze diagram.drawio --page 0 --cells   # geometry, no labels
node bin/arkitect.mjs drawio analyze diagram.drawio --page 0 --images  # image inventory
```

`list_pages` over MCP tells the agent what pages exist; the analyzer tells it
what is on the one it cares about, without the payloads. Only then does it make
a targeted edit — and `build-diagram.mjs` writes a timestamped backup before
replacing anything.

## Opening a file in the desktop app

Nothing to do with MCP, but it is what people usually want next:

```powershell
& 'C:\Program Files\draw.io\draw.io.exe' "docs/architecture.drawio"
```

```bash
open -a draw.io docs/architecture.drawio         # macOS
drawio docs/architecture.drawio                  # Linux
```

## Rendering to PNG

Draw.io Desktop does the rendering locally; no hosted editor or MCP open tool
is involved. The Node helper runs on Linux, macOS and Windows:

```bash
node bin/arkitect.mjs drawio render docs/architecture.drawio --all --out-dir .analysis/renders --width 2200
# Direct script, same options:
node skills/arkitect-drawio/scripts/render-drawio.mjs docs/architecture.drawio --page-index 0
```

`--all` counts pages in the file. `--drawio-exe` or `DRAWIO_EXE` overrides
executable discovery. Outputs are `<base>.p<0-based index>.<format>`; PNG is
the default. On Linux without `DISPLAY`, `xvfb-run -a` is used when available.
See [CLI rendering](cli.md#rendering) for all options and troubleshooting.

Linux arm64 Draw.io Desktop 24.7.17 is calibrated **0-based**: index 0 exports
the first page, 1 the second; an out-of-range 2 clamps to the second in a
two-page file. Windows 29.0.3 is documented **1-based**, so the Node helper
adds 1 on Windows only. macOS uses 0-based indexes provisionally (not calibrated).
Always pass Arkitect 0-based indexes, matching the analyzer and MCP `list_pages`.

The existing Windows PowerShell helper is unchanged, including its translation:

```powershell
./skills/arkitect-drawio/scripts/render-drawio.ps1 `
  -Path docs/architecture.drawio -All -OutDir .analysis/renders -Width 2200
```

Its `-DrawioExe` option still points at a non-default install.

## Troubleshooting

**`drawio: ✘ Failed to connect`** — `npx` could not fetch the package. Check
network access, or install `@drawio/mcp` globally and point the command at it.

**Tools do not appear** — restart the session after adding a server. Most hosts
read MCP config once at startup.

**A page will not load** — it may be compressed. The analyzer handles Draw.io's
deflate encoding; `get_page` over MCP may hand you the compressed blob.

**The agent tried to open the hosted editor** — stop it, and add the rule to
your own instructions. That is exactly the failure mode the rule exists for.
