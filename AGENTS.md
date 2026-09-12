# Arkitect — agent contract

You have Arkitect available. It draws **native, editable architecture diagrams**:
`.drawio` (Draw.io / diagrams.net) and `.excalidraw` (Excalidraw). Both are real
source files the human can open and keep editing — never a screenshot, and never
Mermaid handed over as the final artifact.

This file is the whole contract for agents that read `AGENTS.md` (Codex,
OpenCode, Cursor, Copilot, Antigravity, Pi, and most others). Claude Code loads
the same knowledge as skills; see `skills/*/SKILL.md`, which go deeper.

`ARKITECT_ROOT` below means this repository's directory. Every path is relative
to it, and every command is Node 20+ with **no dependencies to install**.

---

## 1. Pick the engine

| | Draw.io (`.drawio`) | Excalidraw (`.excalidraw`) |
|---|---|---|
| looks like | crisp, formal, vendor icons | hand-drawn, sketchy |
| best for | solution architecture for a client or a review board, AWS-heavy designs, multi-page decks, as-is/to-be comparisons | system design, whiteboard-style architecture, component and block diagrams, flows and decision paths, anything for a README |
| icons | 243-entry AWS Architecture Icons palette + built-in `mxgraph.aws4.*` + real product logos fetched from the web | 1,162 items across 36 bundled libraries — AWS, Azure, GCP, Snowflake, data platform, DevOps, IT logos — plus icons traced from real logos |
| edit later in | Draw.io Desktop, VS Code extension, app.diagrams.net | the Excalidraw container this repo ships, or excalidraw.com |

If the person did not say which, ask once in a single line, or infer: "solution
architecture", "for the client", "AWS" → Draw.io. "system design", "quick",
"sketch", "for the README" → Excalidraw. Say which you chose and why.

## 2. The loop, both engines

1. **Interview until you both mean the same thing.** A diagram is a claim about
   someone's system, and a wrong claim drawn beautifully gets believed. Ask one
   question at a time, each carrying your recommended answer, walking the design
   tree in dependency order: purpose and audience, scope boundary, level of
   abstraction, as-is or to-be, the components by their real product names, the
   flows worth drawing, the trust boundaries, what must be visible, pages, and
   how to treat what the user does not know. Stop when the remaining unknowns
   could not change the drawing — a three-box flowchart needs two questions, a
   review-board architecture needs the ladder. Never interrogate anyone about
   styling; that is what Arkitect is for. The full ladder is in each engine's
   SKILL.md under "Interview first".
2. **Pick a pattern.** `skills/arkitect-<engine>/references/pattern-catalog.md`
   holds the reusable layouts. State every architectural assumption you make;
   they go into your report and, where they matter, into a note on the canvas.
3. **Resolve icons before laying out.** A diagram of grey boxes is not worth
   drawing. See §4.
4. **Write a spec, then build.** Both engines generate from a small JSON spec,
   not from hand-written XML/JSON. This is what applies the style, keeps the
   layout collision-free and keeps base64 out of your context.
5. **Never overwrite blind.** Both builders write a timestamped sibling backup
   before replacing an existing file. Any other edit route means copying the
   file yourself first.
6. **Validate.** Errors block delivery. Warnings about overlap and tight labels
   are judgement calls — check them against the render.
7. **Render it and actually look at the PNG.** Read the image back. Iterate on
   spacing, hierarchy, routing and label legibility. A diagram that validates
   but reads badly is not done.
8. **Report.** File path, assumptions, validation and render results, which
   icons came from where, anything unresolved, and any deliberate deviation
   from the style guide.

## 3. Commands

One dispatcher covers both engines:

```bash
node bin/arkitect.mjs                              # every command, one screen
node bin/arkitect.mjs doctor                       # what is installed, what is optional

# Draw.io
node bin/arkitect.mjs drawio icon "bedrock"                     # search the AWS palette
node bin/arkitect.mjs drawio logo --url <https url> --name snowflake
node bin/arkitect.mjs drawio build spec.json --out docs/arch.drawio
node bin/arkitect.mjs drawio validate docs/arch.drawio
node bin/arkitect.mjs drawio analyze docs/arch.drawio --page 0 --cells

# Excalidraw
node bin/arkitect.mjs excalidraw icon "postgres"                # search 1,162 bundled items
node bin/arkitect.mjs excalidraw libraries --unnamed
node bin/arkitect.mjs excalidraw build spec.json --out docs/arch.excalidraw
node bin/arkitect.mjs excalidraw validate docs/arch.excalidraw
node bin/arkitect.mjs excalidraw render docs/arch.excalidraw --out .analysis/renders
```

Rendering a `.drawio` to PNG uses Draw.io Desktop through
`skills/arkitect-drawio/scripts/render-drawio.ps1` (PowerShell; it corrects a
page-index off-by-one, so go through the script). Excalidraw renders with
`arkitect excalidraw render`, no app required.

Every script also runs directly out of `skills/*/scripts/` if you prefer.
Full reference: `docs/cli.md`.

## 4. Icons — the rule that matters most

**Draw.io:** bundled AWS palette first (`drawio icon`), then a built-in
`mxgraph.aws4.*` shape, then the Draw.io MCP `search_shapes` tool. For non-AWS
products — Snowflake, Grafana, Databricks, Postgres, an internal product —
fetch the **real logo** and embed it (`drawio logo --url …`). A grey box
labelled "Snowflake" is a regression, not a safe default.

**Excalidraw:** the 36 bundled libraries first (`excalidraw icon`). 239 items
carry no name; find those by reading the numbered contact sheets in
`skills/arkitect-excalidraw/assets/libraries/bundled/sheets/` and referencing
`<slug>:<n>`. If nothing matches, use an honest **placeholder** — a dotted slot
with a `?`, named in the build report — and say so. Only build an icon from a
logo (`excalidraw make-icon --url … --trace`) when asked.

**Never substitute one product's mark for another.** A placeholder is honest; a
wrong logo is a lie that survives into someone's slide deck.

## 5. Editing an existing diagram

Never read a whole diagram into context. Both formats embed images as base64 and
run to megabytes; one file can blow your entire window.

```bash
node bin/arkitect.mjs drawio analyze <file> --page 0 --cells     # geometry, no labels
node bin/arkitect.mjs excalidraw analyze <file> --cells
```

Then make a targeted, backup-protected edit and re-validate. **Match the file
you are editing, not the style guide** — if the existing diagram uses sharp
corners and no roughness, so does your addition. Say in the report that you
followed the file.

## 6. Privacy — non-negotiable

- Diagrams stay on the machine. Nothing is uploaded, ever.
- With the Draw.io MCP server connected, use only `list_pages`, `get_page`,
  `set_page`, `search_shapes`. **Never** call `open_drawio_xml`,
  `open_drawio_csv` or `open_drawio_mermaid` on anything derived from the user's
  content — those open the hosted editor and would send private architecture off
  the machine.
- Only two things ever reach the network, both public: a product logo you were
  asked to fetch, and the public Excalidraw library catalogue. Search the
  **product name alone**. Never put a customer name, project codename, hostname
  or anything else from the diagram into a query or a URL.
- The learning skills (`learn-drawio-style`, `learn-excalidraw-style`) are
  user-invoked only. Never learn from a diagram just because you read one.

## 7. Non-negotiables

- Editable `.drawio` XML / `.excalidraw` JSON is the deliverable.
- Icons and images **embed in the file**, never link, so it opens for anyone.
- Real icons for named products; an obvious placeholder where none exists.
- Every Excalidraw arrow bound at both ends, so the scene survives being dragged
  around. Draw.io edges connected at both ends, orthogonal routing.
- A legend whenever more than one connector kind is used.
- Assumptions written on the canvas, not only in chat.
- Look at the render before you call it done.

## 8. Deeper reading

| | |
|---|---|
| `skills/arkitect-drawio/SKILL.md` | the full Draw.io workflow |
| `skills/arkitect-excalidraw/SKILL.md` | the full Excalidraw workflow |
| `skills/*/references/style-guide.md` | the style rules and the evidence behind each |
| `skills/*/references/pattern-catalog.md` | the reusable layouts |
| `skills/arkitect-excalidraw/references/excalidraw-format.md` | the scene format, for hand-editing |
| `skills/*/assets/templates/*.spec.json` | worked spec examples, with the PNG beside them |
| `docs/` | install, agent setup, MCP, Docker, CLI, icons, testing |

**Look at the example PNGs before writing your first spec.** It is faster than
reasoning about the rules, and it is what the output is supposed to look like.
