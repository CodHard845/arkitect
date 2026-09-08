# Contributing

Thanks for looking. Arkitect is a small, dependency-free toolkit, and it stays
useful by staying small — so the bar for *adding* is higher than the bar for
*fixing*.

## Quick start

```bash
git clone https://github.com/mouadja02/arkitect.git
cd arkitect
node tests/run-tests.mjs        # ~2s, offline, no dependencies
node bin/arkitect.mjs doctor
```

On a fresh clone the suite reports roughly `112 passed, 0 failed, 7 skipped`.
The skips need reference diagrams of your own — that is the expected result.

The full contract — every invariant, the verification ritual, and what an
automated maintainer may and may not do — is in
[docs/maintenance.md](docs/maintenance.md). The highlights:

## The rules that are not negotiable

**Zero runtime dependencies.** Every script is plain Node 20+. If something
needs a library, it either does not belong here or belongs written out longhand
in `scripts/lib/`. This is what makes Arkitect installable by a `git clone` and
auditable in an afternoon.

**Nothing derived from a real diagram is ever committed.** No renders, no
labels, no page names, no file paths, no `sensitive-tokens.*.sha256`. The
`.gitignore` encodes this and the redaction test enforces it. If your PR makes
the suite fail on redaction, the finding is real — do not add an exception.

**No diagram content leaves the machine.** A change that introduces a network
call needs a very good reason, must be for a public asset only, and must never
carry anything from a diagram in the query. See
[docs/privacy.md](docs/privacy.md).

**Honesty over completeness.** A placeholder is a feature. Any change that makes
it easier for the generator to substitute one product's mark for another will be
declined, however convenient it is.

## Good first contributions

| | |
|---|---|
| **A pattern** | a layout that recurs in real architectures, added to `references/pattern-catalog.md` with a spec fragment in `assets/templates/patterns.json` |
| **Icon coverage** | a bundled Excalidraw library the set is missing (check the licence and add the author to `ATTRIBUTION.md`), or better fuzzy matching in `find-icon.mjs` |
| **An agent adapter** | a new entry in `bin/lib/install-agent.mjs` for a tool that reads its own file format |
| **A generator bug** | anything that produces a diagram which validates but reads badly — those are the best issues |
| **Docs** | if something took you two tries to get right, that is a doc bug |

## Changing the style

Style rules carry evidence. A rule in `references/style-guide.md` states a count
and a confidence level, and `source-analysis.json` holds the distribution behind
it.

So a style change is not "I prefer rounded corners". It is either:

- a **default** rule (one the corpus does not settle) where you can argue the new
  default reads better — say so explicitly in the PR, or
- a change backed by evidence you can describe without shipping the diagrams
  themselves.

And a convention that moves must move in the **generator** too — `STYLE` and
`EDGE_KINDS` in each engine's `build-diagram.mjs`. A rule changed only in the
prose has been noted, not learned; the next diagram still comes out the old way.

After a style change, rebuild the committed worked examples and look at both
PNGs. A change that suits the small example can wreck the large one.

## Pull requests

1. **Run the suite.** `node tests/run-tests.mjs` must pass, on a clone with no
   sources present.
2. **Add a test** for anything you fixed. The suites live in `tests/drawio.mjs`,
   `tests/excalidraw.mjs` and `tests/toolkit.mjs`; they are plain assertions,
   no framework.
3. **Keep the commit message about the change**, not the files touched.
4. **Say what you looked at.** If you changed a generator, put the render in the
   PR. "It validates" is not the same as "it reads".
5. If you changed a manifest or a skill, `claude plugin validate --strict .`.

Line endings matter here: `.drawio`, `.excalidraw`, `.excalidrawlib`, `.xml`,
`.svg`, `.png` and `.json` are marked binary or `-text` in `.gitattributes`
because the suite compares them by digest. Do not "fix" their whitespace.

## Reporting a bug

Include the spec (or the prompt), what came out, and what you expected. If the
diagram is confidential — most are — describe the shape rather than attaching
it: "six nodes, two boundaries, an edge crossing a third icon" is enough to
reproduce most layout bugs.

Security issues, and especially anything that could send diagram content
somewhere, go to [SECURITY.md](SECURITY.md) rather than a public issue.

## Code of conduct

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Be
decent; assume the other person is too.

## Licence

Contributions are accepted under the [MIT Licence](LICENSE). Bundled third-party
icon sets stay under their own terms — if you add one, add its author and licence
to `ATTRIBUTION.md` and check that redistribution is actually permitted.
