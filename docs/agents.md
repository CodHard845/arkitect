# Agent setup

Arkitect is not tied to any one assistant. The engines are plain Node scripts;
the "agent layer" is a single contract — [`AGENTS.md`](../AGENTS.md) — expressed
in whatever file format your tool happens to read.

| agent | reads | install |
|---|---|---|
| [Claude Code](#claude-code) | plugin skills | `claude plugin install arkitect@arkitect` |
| [Codex](#codex) | `AGENTS.md` | `arkitect install codex` |
| [Cursor](#cursor) | `.cursor/rules/*.mdc` | `arkitect install cursor cursor-command` |
| [OpenCode](#opencode) | `AGENTS.md`, `.opencode/command/` | `arkitect install opencode agents` |
| [GitHub Copilot](#github-copilot) | `.github/copilot-instructions.md` | `arkitect install copilot` |
| [Antigravity](#antigravity) | `AGENTS.md` | `arkitect install antigravity` |
| [Pi](#pi) | `AGENTS.md` | `arkitect install pi` |
| [anything else](#anything-else) | `AGENTS.md`, or a pasted block | `arkitect install agents` |

Throughout, `arkitect` means `node /path/to/arkitect/bin/arkitect.mjs`. Run the
install command **from the project you want diagrams in**, not from the Arkitect
checkout — the adapter it writes carries the absolute path back to Arkitect.

```bash
cd ~/my-project
node ~/arkitect/bin/arkitect.mjs install --all       # every adapter
node ~/arkitect/bin/arkitect.mjs install cursor      # just one
node ~/arkitect/bin/arkitect.mjs install agents --print   # print it, write nothing
```

Writes are idempotent. Markdown files that may already exist (`AGENTS.md`,
`copilot-instructions.md`) get a fenced `arkitect:begin … arkitect:end` block
that is replaced in place on the next run; your own content is untouched.

---

## Claude Code

The richest integration, because Claude Code loads Arkitect as a **plugin with
four skills** rather than a block of instructions.

```bash
claude plugin marketplace add mouadja02/arkitect
claude plugin install arkitect@arkitect
claude plugin details arkitect          # expect: Skills (4)
```

Or clone into `~/.claude/skills/arkitect`, which is the same thing without the
marketplace. See [install.md](install.md).

| skill | invocation |
|---|---|
| `arkitect-drawio` | automatic, whenever a `.drawio` or solution-architecture diagram is in play |
| `arkitect-excalidraw` | automatic, whenever an Excalidraw scene or a sketchy diagram is in play |
| `learn-drawio-style` | `/learn-drawio-style` only |
| `learn-excalidraw-style` | `/learn-excalidraw-style` only |

The two main skills are model-invoked — there is no command to remember, just
ask for a diagram. The two learning skills carry
`disable-model-invocation: true`, so they only ever run when you type them.

Add the Draw.io MCP server for editing existing files:

```bash
claude mcp add --scope user drawio -- npx --yes --ignore-scripts @drawio/mcp
```

→ [drawio-mcp.md](drawio-mcp.md)

## Codex

Codex reads `AGENTS.md` from the repository root.

```bash
cd ~/my-project
node ~/arkitect/bin/arkitect.mjs install codex
```

For a slash command, copy the prompt template into your Codex prompts
directory — Codex exposes each file there as `/<filename>`:

```bash
mkdir -p ~/.codex/prompts
cp ~/arkitect/.codex/prompts/diagram.md ~/.codex/prompts/diagram.md
```

Then `/diagram draw the ingestion pipeline as excalidraw`.

MCP servers live in `~/.codex/config.toml`:

```toml
[mcp_servers.drawio]
command = "npx"
args = ["--yes", "--ignore-scripts", "@drawio/mcp"]
```

## Cursor

```bash
cd ~/my-project
node ~/arkitect/bin/arkitect.mjs install cursor cursor-command
```

That writes two files:

- `.cursor/rules/arkitect.mdc` — a rule with `alwaysApply: false`, so it loads
  when the conversation is about diagrams rather than sitting in every context.
- `.cursor/commands/diagram.md` — a `/diagram` command.

Recent Cursor versions also read `AGENTS.md`; `arkitect install agents` adds it,
and having both is harmless.

MCP goes in `.cursor/mcp.json` (this project) or `~/.cursor/mcp.json` (all
projects):

```json
{
  "mcpServers": {
    "drawio": {
      "command": "npx",
      "args": ["--yes", "--ignore-scripts", "@drawio/mcp"]
    }
  }
}
```

## OpenCode

```bash
cd ~/my-project
node ~/arkitect/bin/arkitect.mjs install opencode agents
```

`AGENTS.md` carries the contract; `.opencode/command/diagram.md` gives you
`/diagram`.

MCP goes in `opencode.json` at the project root:

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

## GitHub Copilot

```bash
cd ~/my-project
node ~/arkitect/bin/arkitect.mjs install copilot
```

`.github/copilot-instructions.md` is read by Copilot in VS Code and JetBrains,
and by the Copilot coding agent on github.com. Recent VS Code builds also read
`AGENTS.md`, so `arkitect install agents copilot` covers both.

MCP in VS Code lives in `.vscode/mcp.json`:

```json
{
  "servers": {
    "drawio": {
      "command": "npx",
      "args": ["--yes", "--ignore-scripts", "@drawio/mcp"]
    }
  }
}
```

## Antigravity

Antigravity reads `AGENTS.md` from the project root like the other
agent-first tools:

```bash
cd ~/my-project
node ~/arkitect/bin/arkitect.mjs install antigravity
```

If your build also offers a rules or memory panel, paste the same block into it
— `arkitect install agents --print` writes it to stdout. MCP servers are added
through Antigravity's own MCP settings, using the same command and arguments as
above: `npx --yes --ignore-scripts @drawio/mcp`.

## Pi

```bash
cd ~/my-project
node ~/arkitect/bin/arkitect.mjs install pi
```

Pi picks up `AGENTS.md` from the project root. If your version keeps its
instructions somewhere else, `--print` gives you the block to paste there.

## Anything else

Agent tooling moves quickly, and file conventions move with it. Two fallbacks
that always work:

1. **`AGENTS.md`** — the closest thing to a standard. Most agents read it, and
   the ones that do not usually let you point at a file.
2. **Paste it.** `arkitect install agents --print` prints the whole block; drop
   it into whatever custom-instructions box your tool provides.

The contract does not depend on any tool feature. It is: run these commands,
follow these rules, look at the render. An agent that can run a shell command
and read a PNG can use Arkitect.

## Verifying it took

Ask for something small and see whether the agent reaches for the toolkit:

> Draw a three-box flow — API gateway, worker, Postgres — as Excalidraw, save it
> to `docs/smoke.excalidraw`.

A working setup produces the file, validates it, renders it, and tells you the
assumptions it made. A setup that did not take produces Mermaid or an
apology — check that the adapter file exists and that the path inside it points
at your Arkitect checkout.

## What each adapter contains

All of them wrap the same short block: what Arkitect is, where it is installed,
which engine to choose, the icon honesty rule, the privacy rule, and five
commands. The full contract stays in one place —
[`AGENTS.md`](../AGENTS.md) in the Arkitect repository — and every adapter points
at it. Update Arkitect and the adapters keep pointing at the new contract; only
re-run `install` if the path changed.
