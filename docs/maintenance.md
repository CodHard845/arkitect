# Maintaining Arkitect

This page is the contract for anyone — a person or an automated maintainer —
who changes this repository. It exists so that "improve it" never turns into
"break it".

Read it before opening a pull request. If a change conflicts with anything here,
the change is wrong until this page is deliberately changed first, in its own
pull request, with a reason.

## The verification ritual

Every change, however small, is verified the same way. Run all of it, from a
clean checkout, before opening a pull request.

```bash
node tests/run-tests.mjs
```

The bar is **0 failed**, and no test that used to pass may start skipping. On a
clone with no reference diagrams of your own, the expected shape is
`150 passed, 0 failed, 7 skipped` — the skips are the tests that need a local
corpus. A drop in the passing count is a regression even if nothing says FAIL.

```bash
node bin/arkitect.mjs doctor
node bin/arkitect.mjs drawio icon "bedrock"
node bin/arkitect.mjs excalidraw icon "postgres"
```

Then prove both engines still produce a real diagram end to end:

```bash
node bin/arkitect.mjs drawio build \
  skills/arkitect-drawio/assets/templates/starter-architecture.spec.json --out /tmp/a.drawio
node bin/arkitect.mjs drawio validate /tmp/a.drawio

node bin/arkitect.mjs excalidraw build \
  skills/arkitect-excalidraw/assets/templates/aws-data-platform.spec.json --out /tmp/b.excalidraw
node bin/arkitect.mjs excalidraw validate /tmp/b.excalidraw
node bin/arkitect.mjs excalidraw render /tmp/b.excalidraw --out /tmp/b.svg
```

And, if you touched a manifest or a skill:

```bash
claude plugin validate --strict .
```

## Invariants

These do not bend for convenience.

**1. Zero runtime dependencies.** Node 20+ and nothing else. No `npm install`,
no `package-lock.json`, no vendored `node_modules`. If a change needs a library,
it is written out longhand in `skills/*/scripts/lib/` or it does not happen.
This is what makes the toolkit auditable and installable by `git clone`.

**2. Both engines keep working.** A change to shared thinking must be applied to
both `skills/arkitect-drawio` and `skills/arkitect-excalidraw`, or explicitly
scoped to one and said so. Neither engine may lose a capability listed in its
`SKILL.md`.

**3. Output stays native and editable.** `.drawio` XML and `.excalidraw` JSON,
with icons and images **embedded**, never linked. No change may make the
deliverable a flattened image, a Mermaid block, or a file that only opens on the
machine that made it.

**4. Icon honesty.** No change may make it easier for a generator to substitute
one product's mark for another. An unresolvable icon becomes a named
placeholder, listed in the build report. This is a feature, not a gap.

**5. Nothing derived from a real diagram enters the repository.** No renders, no
labels, no page names, no file paths, no `.analysis/`, no
`tests/sensitive-tokens.*.sha256`. The redaction test enforces it. If it fails,
the finding is real — never add an exception to make it pass.

**6. Nothing about a diagram reaches the network.** Exactly two network calls
exist: fetching a product logo from a URL the user named, and the public
Excalidraw library catalogue. A change that adds a third needs a very good
reason and its own pull request. The Draw.io MCP tools that open the hosted
editor stay forbidden on user content.

**7. Backups before overwrites.** Both builders write a timestamped sibling
backup before replacing an existing file. Do not remove that, and do not add a
write path that skips it.

**8. Style rules carry evidence.** A rule in `references/style-guide.md` states
its count and confidence. A rule marked `default` is one the corpus does not
settle, and must keep saying so. Never dress a preference up as an observation.

**9. A convention that moves must move in the generator.** Changing prose in
`style-guide.md` without changing `STYLE` / `EDGE_KINDS` in that engine's
`build-diagram.mjs` means the rule was noted, not learned — the next diagram
still comes out the old way. After any style change, rebuild both committed
worked examples and look at the PNGs.

**10. Line endings are load-bearing.** `.drawio`, `.excalidraw`,
`.excalidrawlib`, `.xml`, `.svg`, `.png` and `.json` are marked binary or
`-text` in `.gitattributes` because the suite compares them by digest. Never
reformat, re-indent or "clean up" those files.

## What a good change looks like

- **One concern per pull request.** A dependency bump, an icon library and a
  docs fix are three pull requests, not one.
- **Additive before destructive.** Add the new path, keep the old one working,
  deprecate in a later release.
- **Tested.** Anything fixed gets a test in `tests/drawio.mjs`,
  `tests/excalidraw.mjs` or `tests/toolkit.mjs`. Plain assertions, no framework.
- **Described.** The pull request says what changed, why, what could break, and
  exactly what was run to verify it. If generated output changed, it shows the
  before and after render.
- **Reversible.** Say how to undo it in one line.

## Areas, and how much care each needs

| area | care |
|---|---|
| `docs/`, `README.md` | low — fix freely, keep links resolving |
| `bin/`, agent adapters in `bin/lib/install-agent.mjs` | low — covered by `tests/toolkit.mjs` |
| `tests/` | medium — add tests freely; never weaken one to make a change pass |
| `skills/*/references/*.md` | medium — evidence rules apply (invariants 8 and 9) |
| `skills/*/scripts/` | high — the generators. Full ritual, plus a render you looked at |
| `skills/*/scripts/lib/` | high — the scene model, the tracer, the stroke generator. Small, surgical changes only |
| `skills/*/assets/libraries/` | high — third-party bytes under their own licences. See below |
| `.claude-plugin/`, `package.json` | high — version and name must stay in step (see below) |
| `LICENSE`, `NOTICE`, `.gitattributes`, `.gitignore` | do not change without a stated reason |

## Adding an icon library

1. Confirm the licence permits redistribution, and who the author is.
2. Drop the `.excalidrawlib` into
   `skills/arkitect-excalidraw/assets/libraries/bundled/`.
3. `node bin/arkitect.mjs excalidraw libraries --build` — rebuilds `index.json`
   and `ATTRIBUTION.md`. A test fails if the index and the files disagree.
4. If the library has unnamed items, generate its contact sheet and commit the
   PNG; unnamed items are otherwise unfindable.
5. Check the item count and author landed in `ATTRIBUTION.md`, and update the
   counts quoted in `README.md`, `docs/icons.md` and both `SKILL.md` files if
   they moved.
6. Search for a product in the new library to prove it resolves.

Never edit a bundled library's bytes by hand.

## Watching the upstreams

The Draw.io packs build from pins in `skills/arkitect-drawio/assets/libraries/sources.json`.
A pin stays honest only while someone checks it, so
`.github/workflows/upstream-watch.yml` does the checking:

| check | when | opens | why it matters |
|---|---|---|---|
| `build-packs.mjs --check-upstream` | weekly | `A mark we ship has been removed from Simple Icons` (`licensing`) | Simple Icons removes a brand when its owner asks; shipping it anyway redistributes a mark we were asked not to |
| `build-packs.mjs --check-drift` | quarterly | `Pinned icon sources have moved on upstream` (`upstream`) | vendors rev their sets without notice, and the packs fall behind |

A rename upstream is reported but opens nothing. A slug that moved is not a
licensing problem. If an issue is already open, the workflow comments on it
instead of opening a second one. A network failure turns the run red and opens nothing.

Both checks run locally too, and exit `0` clean, `1` with findings, `2` on error:

```bash
node skills/arkitect-drawio/scripts/build-packs.mjs --check-upstream
node skills/arkitect-drawio/scripts/build-packs.mjs --check-drift
```

The workflow only ever opens or comments on an issue. A removal is fixed by moving the mark
to its pack's `onDemand` list, the way the seven 15.x removals were. A drift is
fixed by re-pinning, rebuilding and looking at the contact sheets. Both are pull
requests a person reviews.

## Adding an agent adapter

1. Confirm which file that tool actually reads — do not guess a path.
2. Add an entry to `ADAPTERS` in `bin/lib/install-agent.mjs`, reusing the shared
   `body` renderer unless the host needs its own frontmatter.
3. Add the tool to the table in `docs/agents.md` and the one in `README.md`,
   with its MCP configuration if it supports MCP.
4. `node tests/run-tests.mjs toolkit` covers rendering, aliases, idempotency and
   the refusal to clobber.

## Version bumps

`package.json` `version` and `.claude-plugin/plugin.json` `version` move
together, always, and a `CHANGELOG.md` entry lands in the same pull request.
[SemVer](https://semver.org): a new capability is a minor, a fix is a patch, and
anything that changes the shape of generated output or removes a command is a
major.

## What is never automated

An automated maintainer may open pull requests and issues, and nothing else. It
must not:

- merge, approve or close a pull request, or push to `main`
- force-push, rewrite history, or delete a branch it did not create
- change the licence, the repository visibility, its settings or its topics
- publish a release or a package
- add a runtime dependency, or commit a binary over 2 MB, without being asked
- weaken or delete a test to make a change pass
- commit anything derived from a real diagram

When it is unsure, it opens an issue describing the options instead of a pull
request choosing one.
